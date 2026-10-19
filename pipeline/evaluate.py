"""Evaluation on the gold questions, the abstention study and the parity table.

Everything here is deterministic, so the files it feeds (``eval.reference.json``
and ``parity.fixtures.json``) are byte-identical from one build to the next.

* :func:`run_strategy` / :func:`evaluate` mirror ``src/engine/eval/run.ts``:
  top-10 rankings, recall@5, precision@5, MRR and nDCG@10. Unanswerable probe
  questions (empty ``relevant``) are left out of the quality metrics.
* :func:`abstention_study` calibrates the score below which the brief refuses
  to answer (``ABSTAIN_BELOW`` in ``src/engine/answer.ts``).
* :func:`parity_table` records what the reference engine returns on the shared
  fixtures, for the TypeScript parity test.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from itertools import pairwise
from typing import Any

from pipeline.engine import (
    STRATEGY_IDS,
    Corpus,
    bm25_search,
    correct_spelling,
    estimate_tokens,
    js_round,
    mean,
    ndcg_at,
    precision_at,
    recall_at,
    reciprocal_rank,
    retrieve,
    tokenize,
)

#: Cut-off for recall and precision, and for the context-token estimate (``K`` in run.ts).
K = 5
#: Every strategy returns its top 10 (run.ts calls ``retrieve`` with ``k: 10``).
RANK_DEPTH = 10
#: nDCG is computed over the whole top 10 (``ndcgAt(ranked, relevant, 10)`` in run.ts).
NDCG_DEPTH = 10

#: The abstention rule from ``composeBrief`` in src/engine/answer.ts, as the agent harness applies it.
ABSTENTION_RULE = (
    "after spelling repair, abstain when the best BM25 score is below the threshold and no topic links"
    " (a linked country alone does not count)"
)

#: Queries recorded in src/engine/parity.fixtures.json (run on the fixture corpus).
PARITY_QUERIES: tuple[str, ...] = (
    "household finances survey",
    "smoking near building entrances",
    "children",
    "household finances",
    "trust police Norway",
    "preparedniss index",
    "compare policing trust versus smoke-free areas",
    "young people preparedness",
    "survey",
    "women leadership",
    "what has verian published about the police?",
)


@dataclass(frozen=True, slots=True)
class GoldQuery:
    """A hand-labelled evaluation question.

    ``relevant`` maps item ids to graded relevance (2 = answers it directly,
    1 = useful context). An empty mapping marks an unanswerable probe: a
    question the library cannot answer, used to calibrate refusals.
    """

    id: str
    query: str
    relevant: Mapping[str, int]
    note: str | None = None

    @property
    def answerable(self) -> bool:
        return bool(self.relevant)


# --------------------------------------------------------------- strategies


def context_tokens(corpus: Corpus, ranked: Sequence[str]) -> int:
    """Tokens a model would read if the top ``K`` sources were passed to it (as in run.ts)."""
    total = 0
    for item_id in ranked[:K]:
        it = corpus.by_id[item_id]
        total += estimate_tokens(f"{it.title}\n{it.kind} {it.date} {it.country}\n{it.summary}\n{it.url}")
    return total


def run_strategy(corpus: Corpus, gold: Iterable[GoldQuery], strategy: str) -> dict[str, Any]:
    """Score one strategy on the answerable gold questions (``runStrategy`` in run.ts, minus timings)."""
    rows: list[dict[str, Any]] = []
    calls: list[float] = []
    tokens: list[float] = []
    for g in gold:
        if not g.answerable:
            continue
        res = retrieve(corpus, strategy, g.query, k=RANK_DEPTH)
        ranked = res.ids
        rows.append(
            {
                "id": g.id,
                "query": g.query,
                "ranked": ranked,
                "scores": [h.score for h in res.hits],
                "recall": recall_at(ranked, g.relevant, K),
                "precision": precision_at(ranked, g.relevant, K),
                "rr": reciprocal_rank(ranked, g.relevant),
                "ndcg": ndcg_at(ranked, g.relevant, NDCG_DEPTH),
            }
        )
        calls.append(res.calls)
        tokens.append(context_tokens(corpus, ranked))
    return {
        "strategy": strategy,
        "recall": mean([r["recall"] for r in rows]),
        "precision": mean([r["precision"] for r in rows]),
        "mrr": mean([r["rr"] for r in rows]),
        "ndcg": mean([r["ndcg"] for r in rows]),
        "calls": mean(calls),
        "contextTokens": js_round(mean(tokens)),
        "rows": rows,
    }


# --------------------------------------------------------------- abstention


@dataclass(frozen=True, slots=True)
class AbstentionCase:
    """What the abstention rule sees for one gold question."""

    id: str
    query: str
    resolved: str  # the question after spelling repair (equal to ``query`` when nothing was fixed)
    answerable: bool
    best_score: float  # best BM25 score of ``resolved``, 0 when nothing matches
    entities: tuple[str, ...]  # topic/country nodes linked from ``resolved``

    def abstains(self, threshold: float) -> bool:
        """The rule in composeBrief: a weak lexical match and no linked topic.

        A linked country does not count: "the weather in London" links to the
        United Kingdom but is still off-topic.
        """
        return self.best_score < threshold and not any(e.startswith("topic:") for e in self.entities)


@dataclass(frozen=True, slots=True)
class ThresholdOutcome:
    threshold: float
    correct_abstentions: int  # unanswerable probes that abstain
    false_abstentions: int  # answerable questions that abstain


def candidate_thresholds(scores: Iterable[float]) -> list[float]:
    """Midpoints between consecutive distinct scores, rounded to 2 dp, ascending and de-duplicated."""
    distinct = sorted(set(scores))
    return sorted({round((a + b) / 2, 2) for a, b in pairwise(distinct)})


def outcome(cases: Sequence[AbstentionCase], threshold: float) -> ThresholdOutcome:
    return ThresholdOutcome(
        threshold=threshold,
        correct_abstentions=sum(1 for c in cases if not c.answerable and c.abstains(threshold)),
        false_abstentions=sum(1 for c in cases if c.answerable and c.abstains(threshold)),
    )


def choose_threshold(cases: Sequence[AbstentionCase]) -> tuple[ThresholdOutcome | None, list[ThresholdOutcome]]:
    """Pick the refusal threshold from the candidate midpoints.

    The chosen threshold causes no abstention on an answerable question and,
    among those, refuses the most unanswerable probes; ties go to the lowest
    threshold, to stay conservative about refusing.

    False abstentions only grow as the threshold rises, so when even the lowest
    candidate refuses some answerable question (one that scores below every
    candidate and links nothing), no candidate is feasible. Then the rule is
    applied on top of those unavoidable refusals: fewest false abstentions
    first, then most correct ones, then the lowest threshold.

    Returns the choice (``None`` when there are fewer than two distinct scores)
    and the outcome of every candidate.
    """
    outcomes = [outcome(cases, t) for t in candidate_thresholds(c.best_score for c in cases)]
    if not outcomes:
        return None, []
    best = min(outcomes, key=lambda o: (o.false_abstentions, -o.correct_abstentions, o.threshold))
    return best, outcomes


def unavoidable_refusals(cases: Sequence[AbstentionCase], outcomes: Sequence[ThresholdOutcome]) -> list[str]:
    """Ids of answerable questions refused at every candidate threshold (so at the lowest one)."""
    if not outcomes:
        return []
    lowest = min(o.threshold for o in outcomes)
    return [c.id for c in cases if c.answerable and c.abstains(lowest)]


def resolve_question(corpus: Corpus, question: str) -> str:
    """The text the agent harness scores a question by: spelling repaired first.

    Mirrors ``runAgent`` in src/engine/agent/harness.ts, where ``resolved`` is
    ``correctSpelling(...).query`` when it made fixes and the question otherwise.
    (The harness also redacts personal data first; gold questions contain none.)
    """
    spelled = correct_spelling(corpus, question)
    return spelled.query if spelled.fixes else question


def abstention_cases(corpus: Corpus, gold: Iterable[GoldQuery]) -> list[AbstentionCase]:
    """The best BM25 score and linked entities for every gold question (probes included)."""
    cases = []
    for g in gold:
        resolved = resolve_question(corpus, g.query)
        hits = bm25_search(corpus, resolved, k=1).hits
        cases.append(
            AbstentionCase(
                id=g.id,
                query=g.query,
                resolved=resolved,
                answerable=g.answerable,
                best_score=hits[0].score if hits else 0.0,
                entities=tuple(e.node for e in corpus.link_entities(resolved)),
            )
        )
    return cases


def abstention_study(corpus: Corpus, gold: Sequence[GoldQuery]) -> dict[str, Any]:
    """Calibrate the refusal threshold on the gold questions and report how it behaves."""
    cases = abstention_cases(corpus, gold)
    chosen, outcomes = choose_threshold(cases)
    threshold = chosen.threshold if chosen else None
    return {
        "rule": ABSTENTION_RULE,
        "threshold": threshold,
        "feasible": bool(chosen and chosen.false_abstentions == 0),
        "answerable": sum(1 for c in cases if c.answerable),
        "unanswerable": sum(1 for c in cases if not c.answerable),
        "correctAbstentions": chosen.correct_abstentions if chosen else 0,
        "falseAbstentions": chosen.false_abstentions if chosen else 0,
        "unavoidableFalseAbstentions": unavoidable_refusals(cases, outcomes),
        "candidates": [
            {
                "threshold": o.threshold,
                "correctAbstentions": o.correct_abstentions,
                "falseAbstentions": o.false_abstentions,
            }
            for o in outcomes
        ],
        "queries": [
            {
                "id": c.id,
                "query": c.query,
                "resolved": c.resolved,
                "answerable": c.answerable,
                "bestScore": c.best_score,
                "entities": list(c.entities),
                "abstains": threshold is not None and c.abstains(threshold),
            }
            for c in cases
        ],
    }


def evaluate(corpus: Corpus, gold: Sequence[GoldQuery]) -> dict[str, Any]:
    """The content of src/data/eval.reference.json."""
    return {
        "note": (
            "Reference results from pipeline/evaluate.py. Rankings are top 10; recall and precision at 5, "
            "nDCG at 10; unanswerable probes are excluded from the quality metrics."
        ),
        "k": RANK_DEPTH,
        "cutoff": K,
        "strategies": [run_strategy(corpus, gold, s) for s in STRATEGY_IDS],
        "abstention": abstention_study(corpus, gold),
    }


# ------------------------------------------------------------------- parity


def parity_table(corpus: Corpus, queries: Iterable[str] = PARITY_QUERIES) -> dict[str, Any]:
    """The content of src/engine/parity.fixtures.json: what the reference engine returns per query."""
    rows = []
    for query in queries:
        strategies = {}
        for s in STRATEGY_IDS:
            res = retrieve(corpus, s, query, k=RANK_DEPTH)
            strategies[s] = {
                "ids": res.ids,
                "scores": [h.score for h in res.hits],
                "why": [list(h.why) for h in res.hits],
                "calls": res.calls,
                "rewrites": list(res.rewrites),
            }
        rows.append(
            {
                "query": query,
                "tokens": tokenize(query),
                "entities": [e.node for e in corpus.link_entities(query)],
                "strategies": strategies,
            }
        )
    return {
        "note": (
            "Generated by `python3 -m pipeline.build --parity-only` from src/engine/fixtures.json. "
            "src/engine/parity.test.ts checks that the TypeScript engine reproduces it."
        ),
        "queries": rows,
    }
