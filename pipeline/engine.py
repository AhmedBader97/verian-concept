"""Reference implementation of the evidence engine (a Python port of ``src/engine``).

The TypeScript engine in ``src/engine`` runs in the browser. This module is the
reference it is checked against, so it reproduces the TypeScript semantics
exactly: the same tokens, the same BM25 and PageRank arithmetic in the same
order, the same tie-breaks and the same human-readable "why" strings. Both
implementations produce identical rankings, and scores that agree to the bit.

Where JavaScript and Python differ, this port follows JavaScript:

* ``Math.log`` and ``Math.log2`` come from :mod:`pipeline.jsmath` (V8's
  fdlibm algorithms) rather than the C library.
* Floating-point totals are accumulated left to right. Since Python 3.12 the
  built-in :func:`sum` uses compensated summation for floats, which gives
  different last bits from ``Array.prototype.reduce``, so it is not used on
  floats here.
* Strings are ordered by UTF-16 code units, as JavaScript's ``sort()`` and
  ``<`` do (:func:`js_order`).
* Regular expressions use JavaScript's ``\\s`` (:data:`JS_WHITESPACE`) and
  ASCII-only ``\\b``.

Sections mirror the TypeScript files:

=========  ===========================================================
text.ts    :func:`normalize`, :func:`words`, :func:`stem`, :func:`tokenize`,
           :func:`estimate_tokens`, :func:`edit_distance`
corpus.ts  :class:`Corpus` (BM25 statistics, knowledge graph, entity
           linking, personalised PageRank)
retrieve   the five strategies and :func:`retrieve`
metrics    :func:`recall_at`, :func:`precision_at`, :func:`reciprocal_rank`,
           :func:`ndcg_at`, :func:`mean`, :func:`percentile`
harness    :func:`related_topics` (``relatedTopics`` in agent/harness.ts)
=========  ===========================================================
"""

from __future__ import annotations

import dataclasses
import json
import math
import re
import unicodedata
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pipeline.jsmath import js_log, js_log2

# --------------------------------------------------------------------- paths

REPO_ROOT = Path(__file__).resolve().parent.parent
ENGINE_DIR = REPO_ROOT / "src" / "engine"
LEXICON_DIR = ENGINE_DIR / "lexicon"
FIXTURES_PATH = ENGINE_DIR / "fixtures.json"


def _load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


# ------------------------------------------------------------------- lexicon
# Shared with the TypeScript engine: always read from src/engine/lexicon.

STOPWORDS: frozenset[str] = frozenset(_load_json(LEXICON_DIR / "stopwords.json"))
LEXICON: dict[str, Any] = _load_json(LEXICON_DIR / "aliases.json")
FORMAT_TAGS: frozenset[str] = frozenset(LEXICON["formatTags"])
#: Canonical topic labels, in lexicon order.
TOPICS: tuple[str, ...] = tuple(LEXICON["topics"])
#: Canonical country labels, in lexicon order.
COUNTRIES: tuple[str, ...] = tuple(LEXICON["countries"])

KIND_LABEL: dict[str, str] = {
    "case-study": "case study",
    "insight": "insight",
    "news": "news",
    "event": "event",
    "webinar": "webinar",
    "report": "report",
}
KINDS: tuple[str, ...] = tuple(KIND_LABEL)
STRATEGY_IDS: tuple[str, ...] = ("keyword", "bm25", "graph", "hybrid", "agentic")

# ------------------------------------------------------- JavaScript helpers

#: The characters JavaScript's ``\s`` and ``String.prototype.trim`` treat as
#: white space (WhiteSpace plus LineTerminator). Python's ``\s`` and
#: ``str.strip()`` use a different set (they include U+001C-U+001F and U+0085
#: but not U+FEFF).
JS_WHITESPACE = "\t\n\v\f\r   " + "".join(map(chr, range(0x2000, 0x200B))) + "    　﻿"
_JS_WS_RUN = re.compile("[" + re.escape(JS_WHITESPACE) + "]+")


def js_order(text: str) -> bytes:
    """Sort key matching JavaScript's default string order (UTF-16 code units).

    Python compares strings by code point, which differs from JavaScript for
    characters outside the Basic Multilingual Plane.
    """
    return text.encode("utf-16-be", "surrogatepass")


def js_trim(text: str) -> str:
    """``String.prototype.trim``."""
    return text.strip(JS_WHITESPACE)


def js_length(text: str) -> int:
    """``String.prototype.length``: the number of UTF-16 code units."""
    return len(text.encode("utf-16-le", "surrogatepass")) // 2


def _uniq(xs: Iterable[str]) -> list[str]:
    """``[...new Set(xs)]``: drop repeats, keep first-seen order."""
    return list(dict.fromkeys(xs))


# ====================================================================== text

_COMBINING_MARKS = re.compile("[̀-ͯ]")
_NON_ALNUM = re.compile("[^a-z0-9]+")
_ALL_DIGITS = re.compile("[0-9]+")


def normalize(text: str) -> str:
    """NFKD, drop combining marks, lowercase, every non ``[a-z0-9]`` run to one space, trim.

    Matches ``normalize`` in text.ts for every code point assigned in the Unicode
    version of Python's ``unicodedata`` (15.1 in Python 3.13). Node 22 uses
    Unicode 16, which adds 36 compatibility characters that fold to ASCII
    (U+1CCD6-U+1CCF9, outlined Latin letters and digits); this function drops
    them instead.
    """
    text = unicodedata.normalize("NFKD", text)
    text = _COMBINING_MARKS.sub("", text).lower()
    return _NON_ALNUM.sub(" ", text).strip(" ")


def words(text: str) -> list[str]:
    """Raw words after normalisation, before stopwords and stemming (length >= 2)."""
    normalised = normalize(text)
    if not normalised:
        return []
    return [w for w in normalised.split(" ") if len(w) >= 2]


#: ``(suffix, replacement, min)``. The first rule that applies wins; ``min`` is
#: the length the remaining stem must keep, which stops "news" -> "new".
RULES: tuple[tuple[str, str, int], ...] = (
    ("ational", "ate", 3),
    ("ization", "ize", 3),
    ("isation", "ise", 3),
    ("iveness", "ive", 3),
    ("fulness", "ful", 3),
    ("ousness", "ous", 3),
    ("ements", "ement", 3),
    ("ments", "ment", 3),
    ("ities", "ity", 3),
    ("ating", "ate", 3),
    ("ation", "ate", 3),
    ("ings", "", 3),
    ("ing", "", 3),
    ("ies", "y", 3),
    ("sses", "ss", 2),
    ("ness", "", 4),
    ("ches", "ch", 3),
    ("shes", "sh", 3),
    ("xes", "x", 2),
    ("ers", "er", 3),
    ("ed", "", 4),
    ("s", "", 4),
    ("e", "", 4),
)

#: Endings that keep their final "s" ("process", "crisis", "census", "famous").
KEEP_S: tuple[str, ...] = ("ss", "us", "is", "ous")

#: The stemmer stops after this many passes even if a rule still applies.
MAX_STEM_PASSES = 4


def _stem_once(word: str) -> str:
    if len(word) <= 3 or _ALL_DIGITS.fullmatch(word):
        return word
    for suffix, replacement, min_len in RULES:
        if not word.endswith(suffix):
            continue
        base = word[: len(word) - len(suffix)]
        if len(base) < min_len:
            continue
        if suffix == "s" and any(word.endswith(k) for k in KEEP_S):
            return word
        return base + replacement
    return word


def stem(word: str) -> str:
    """Apply the suffix rules until nothing changes, at most four passes.

    So "evaluations" -> "evaluation" -> "evaluate" -> "evaluat", and "police"
    and "policing" both become "polic". Expects a normalised word.
    """
    current = word
    for _ in range(MAX_STEM_PASSES):
        following = _stem_once(current)
        if following == current:
            break
        current = following
    return current


def is_stopword(word: str) -> bool:
    return word in STOPWORDS


def tokenize(text: str) -> list[str]:
    """Tokens used for indexing and querying: words minus stopwords, stemmed."""
    return [stem(w) for w in words(text) if w not in STOPWORDS]


def estimate_tokens(text: str) -> int:
    """Rough model-token estimate (about four characters per token), as in TypeScript."""
    return (js_length(text) + 3) // 4


def edit_distance(a: str, b: str, cap: int = 3) -> int:
    """Damerau-Levenshtein distance (optimal string alignment), capped for speed.

    Returns ``cap + 1`` as soon as the distance is known to exceed ``cap``.
    """
    if a == b:
        return 0
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    m, n = len(a), len(b)
    prev2 = [0] * (n + 1)
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [0] * (n + 1)
        cur[0] = i
        row_min = cur[0]
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            v = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                v = min(v, prev2[j - 2] + 1)
            cur[j] = v
            if v < row_min:
                row_min = v
        if row_min > cap:
            return cap + 1
        prev2 = prev
        prev = cur
    return prev[n]


# ==================================================================== corpus

BM25_K1 = 1.2
BM25_B = 0.75
#: Field boosts are applied by repeating tokens, which keeps BM25 itself textbook.
FIELD_BOOST: dict[str, int] = {"title": 2, "topics": 2, "summary": 1, "country": 1, "kind": 1}


@dataclass(frozen=True, slots=True)
class Item:
    """One published item from Verian's library (``Item`` in types.ts)."""

    id: str
    kind: str
    title: str
    date: str  # ISO yyyy-mm-dd
    url: str
    topics: tuple[str, ...]
    country: str  # "Global" when not tied to one country
    summary: str
    summary_basis: str | None = None  # "teaser" | "page" | "title-only"
    fixture: bool = False  # only on synthetic test fixtures

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> Item:
        """Build an item from its JSON form (camelCase keys, as in library.json)."""
        return cls(
            id=data["id"],
            kind=data["kind"],
            title=data["title"],
            date=data["date"],
            url=data["url"],
            topics=tuple(data["topics"]),
            country=data["country"],
            summary=data["summary"],
            summary_basis=data.get("summaryBasis"),
            fixture=bool(data.get("fixture", False)),
        )

    def to_dict(self) -> dict[str, Any]:
        """The JSON form, with keys in library.json order."""
        out: dict[str, Any] = {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "date": self.date,
            "url": self.url,
            "topics": list(self.topics),
            "country": self.country,
            "summary": self.summary,
        }
        if self.summary_basis is not None:
            out["summaryBasis"] = self.summary_basis
        if self.fixture:
            out["fixture"] = True
        return out


@dataclass(frozen=True, slots=True)
class LinkedEntity:
    """A topic or country recognised in a query."""

    node: str  # e.g. "topic:Youth and Family" or "country:Norway"
    label: str
    via: str  # the alias that triggered the link

    def to_dict(self) -> dict[str, str]:
        return {"node": self.node, "label": self.label, "via": self.via}


@dataclass(frozen=True, slots=True)
class _Alias:
    node: str
    label: str
    alias: str
    tokens: tuple[str, ...]


def topic_tags(item: Item) -> list[str]:
    """The item's subject topics: its topics minus format tags such as "News"."""
    return [t for t in item.topics if t not in FORMAT_TAGS]


def document_tokens(item: Item) -> list[str]:
    """Index tokens for one item, with field boosts applied by repetition."""
    out: list[str] = []

    def add(text: str, times: int) -> None:
        toks = tokenize(text)
        for _ in range(times):
            out.extend(toks)

    add(item.title, FIELD_BOOST["title"])
    for topic in topic_tags(item):
        add(topic, FIELD_BOOST["topics"])
    add(item.summary, FIELD_BOOST["summary"])
    if item.country != "Global":
        add(item.country, FIELD_BOOST["country"])
    add(KIND_LABEL[item.kind], FIELD_BOOST["kind"])
    return out


def contains_sequence(haystack: Sequence[str], needle: Sequence[str]) -> bool:
    """True when ``needle`` occurs contiguously in ``haystack`` (and is non-empty)."""
    size = len(needle)
    if size == 0 or size > len(haystack):
        return False
    needle = list(needle)
    return any(list(haystack[i : i + size]) == needle for i in range(len(haystack) - size + 1))


def query_words(query: str) -> list[str]:
    """Words of the query, unstemmed (used for highlighting)."""
    return words(query)


class Corpus:
    """The indexed library: BM25 statistics, a typed knowledge graph and an entity linker.

    Built once from a list of items; every structure is deterministic (sorted
    node ids, sorted neighbour lists, lexicon-ordered aliases) because the
    TypeScript engine must reproduce it exactly.
    """

    def __init__(self, items: Iterable[Item]) -> None:
        self.items: list[Item] = list(items)
        self.by_id: dict[str, Item] = {it.id: it for it in self.items}
        #: Position of each item in ``items``, by id.
        self.index: dict[str, int] = {it.id: i for i, it in enumerate(self.items)}
        self.N: int = len(self.items)
        self.tf: list[dict[str, int]] = []
        self.dl: list[int] = []
        self.df: dict[str, int] = {}
        #: Unboosted title+summary token sets, for the naive keyword baseline.
        self.plain_tokens: list[frozenset[str]] = []
        self._idf_cache: dict[str, float] = {}

        total = 0
        for item in self.items:
            toks = document_tokens(item)
            counts: dict[str, int] = {}
            for t in toks:
                counts[t] = counts.get(t, 0) + 1
            self.tf.append(counts)
            self.dl.append(len(toks))
            total += len(toks)
            for t in counts:
                self.df[t] = self.df.get(t, 0) + 1
            self.plain_tokens.append(frozenset(tokenize(f"{item.title} {item.summary}")))
        self.avgdl: float = total / self.N if self.N else 0

        # Surface words seen in the library (normalised, unstemmed), for spelling correction.
        seen: set[str] = set()
        for item in self.items:
            seen.update(words(f"{item.title} {item.summary} {' '.join(item.topics)} {item.country}"))
        self.surface: list[str] = sorted(seen, key=js_order)

        # Knowledge graph: items <-> topics, items <-> countries.
        adjacency: dict[str, set[str]] = {}

        def link(a: str, b: str) -> None:
            adjacency.setdefault(a, set()).add(b)
            adjacency.setdefault(b, set()).add(a)

        for item in self.items:
            node = f"item:{item.id}"
            adjacency.setdefault(node, set())
            for topic in topic_tags(item):
                link(node, f"topic:{topic}")
            if item.country != "Global":
                link(node, f"country:{item.country}")
        self.nodes: list[str] = sorted(adjacency, key=js_order)
        self.neighbours: dict[str, list[str]] = {n: sorted(adjacency[n], key=js_order) for n in self.nodes}

        # Entity aliases in a fixed order: topics then countries, as listed in the
        # lexicon, each entity's own label before its aliases.
        self._aliases: list[_Alias] = []
        for kind in ("topic", "country"):
            entries: dict[str, list[str]] = LEXICON["topics" if kind == "topic" else "countries"]
            for label, aliases in entries.items():
                for alias in [label, *aliases]:
                    self._aliases.append(_Alias(f"{kind}:{label}", label, alias, tuple(tokenize(alias))))

    # ---------------------------------------------------------------- BM25

    def idf(self, term: str) -> float:
        """BM25 idf: ``ln(1 + (N - df + 0.5) / (df + 0.5))``."""
        cached = self._idf_cache.get(term)
        if cached is None:
            df = self.df.get(term, 0)
            cached = js_log(1 + (self.N - df + 0.5) / (df + 0.5))
            self._idf_cache[term] = cached
        return cached

    def bm25(self, doc_index: int, terms: Sequence[str]) -> float:
        """BM25 score of one document for a list of unique query terms."""
        tf = self.tf[doc_index]
        dl = self.dl[doc_index]
        score = 0.0
        for t in terms:
            f = tf.get(t)
            if not f:
                continue
            norm = f + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / self.avgdl)
            score += self.idf(t) * ((f * (BM25_K1 + 1)) / norm)
        return score

    def has_term(self, term: str) -> bool:
        return term in self.df

    def vocabulary(self) -> list[str]:
        return list(self.df)

    # ------------------------------------------------------ entity linking

    def link_entities(self, query: str) -> list[LinkedEntity]:
        """Topics and countries mentioned in the query.

        An alias matches when its stemmed tokens appear contiguously in the
        query's stemmed tokens. Entities with no items in the library are
        ignored, and each entity links at most once (its first matching alias).
        """
        q = tokenize(query)
        found: dict[str, LinkedEntity] = {}
        for a in self._aliases:
            if not a.tokens or a.node in found:
                continue
            if a.node not in self.neighbours:
                continue
            if contains_sequence(q, a.tokens):
                found[a.node] = LinkedEntity(a.node, a.label, a.alias)
        return list(found.values())

    # ------------------------------------------------------------ PageRank

    def personalised_pagerank(
        self, seeds: Sequence[str], alpha: float = 0.25, iterations: int = 30
    ) -> dict[str, float]:
        """Personalised PageRank from the seed nodes (restart probability ``alpha``).

        Iteration order is fixed (sorted node ids, sorted neighbours) so that the
        floating-point additions happen in the same order as in TypeScript.
        Returns an empty mapping when no seed is in the graph.
        """
        valid = [s for s in seeds if s in self.neighbours]
        if not valid:
            return {}
        restart: dict[str, float] = {}
        for s in valid:
            restart[s] = 1 / len(valid)
        rank: dict[str, float] = {n: restart.get(n, 0) for n in self.nodes}
        for _ in range(iterations):
            following = {n: alpha * restart.get(n, 0) for n in self.nodes}
            for n in self.nodes:
                r = rank[n]
                if r == 0:
                    continue
                nbrs = self.neighbours[n]
                if not nbrs:
                    continue
                share = ((1 - alpha) * r) / len(nbrs)
                for m in nbrs:
                    following[m] = following[m] + share
            rank = following
        return rank


# ================================================================= retrieve

RRF_K = 60
GRAPH_LEXICAL_WEIGHT = 0.3
#: The agentic loop retries a sub-query when its best BM25 score is below this.
WEAK_SCORE = 2.0
GRAPH_FALLBACK_NOTE = "no topic or country found, so fell back to BM25"


@dataclass(frozen=True, slots=True)
class Hit:
    id: str
    score: float
    #: Human-readable reasons this item matched (terms, entities, graph paths).
    why: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "score": self.score, "why": list(self.why)}


@dataclass(frozen=True, slots=True)
class Filters:
    """Optional result filters, applied after ranking. Empty means "any"."""

    kinds: tuple[str, ...] = ()
    countries: tuple[str, ...] = ()
    topics: tuple[str, ...] = ()
    since: str | None = None  # ISO date, inclusive


@dataclass(frozen=True, slots=True)
class RetrievalResult:
    strategy: str
    query: str
    hits: tuple[Hit, ...]
    #: Topics and countries linked from the query, if any.
    entities: tuple[LinkedEntity, ...] = ()
    #: Number of retrieval calls made (the agentic strategy makes several).
    calls: int = 1
    #: Query rewrites applied (spelling fixes, decomposition, synonym retries).
    rewrites: tuple[str, ...] = ()

    @property
    def ids(self) -> list[str]:
        return [h.id for h in self.hits]

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "query": self.query,
            "hits": [h.to_dict() for h in self.hits],
            "entities": [e.to_dict() for e in self.entities],
            "calls": self.calls,
            "rewrites": list(self.rewrites),
        }


@dataclass(frozen=True, slots=True)
class SpellingFix:
    query: str
    fixes: tuple[str, ...]


def passes_filters(item: Item, filters: Filters | None) -> bool:
    """True when the item satisfies every filter that is set (``since`` is inclusive)."""
    if filters is None:
        return True
    if filters.kinds and item.kind not in filters.kinds:
        return False
    if filters.countries and item.country not in filters.countries:
        return False
    if filters.topics and not any(t in item.topics for t in filters.topics):
        return False
    return not (filters.since and js_order(item.date) < js_order(filters.since))


def rank_hits(corpus: Corpus, hits: Iterable[Hit]) -> list[Hit]:
    """Order hits by score (desc), then date (newest first), then id (asc).

    Three stable sorts, least significant key first, give exactly the order of
    the TypeScript comparator ``byScore``.
    """
    ordered = sorted(hits, key=lambda h: js_order(h.id))
    ordered.sort(key=lambda h: js_order(corpus.by_id[h.id].date), reverse=True)
    ordered.sort(key=lambda h: h.score, reverse=True)
    return ordered


def _finish(
    corpus: Corpus,
    strategy: str,
    query: str,
    hits: Iterable[Hit],
    k: int,
    filters: Filters | None,
    *,
    entities: Sequence[LinkedEntity] = (),
    calls: int | None = None,
    rewrites: Sequence[str] = (),
) -> RetrievalResult:
    """Keep positive scores that pass the filters, rank them and cut to ``k``."""
    kept = [h for h in hits if h.score > 0 and passes_filters(corpus.by_id[h.id], filters)]
    ranked = rank_hits(corpus, kept)
    return RetrievalResult(
        strategy=strategy,
        query=query,
        hits=tuple(ranked[:k]),
        entities=tuple(entities),
        calls=1 if calls is None else calls,
        rewrites=tuple(rewrites),
    )


def split_node(node: str) -> tuple[str, str]:
    """``"topic:Gender"`` -> ``("topic", "Gender")``."""
    idx = node.find(":")
    return node[:idx], node[idx + 1 :]


def _links_directly(item: Item, entity: LinkedEntity) -> bool:
    kind, label = split_node(entity.node)
    return label in topic_tags(item) if kind == "topic" else item.country == label


# ------------------------------------------------------------------ keyword


def keyword_search(corpus: Corpus, query: str, *, k: int = 10, filters: Filters | None = None) -> RetrievalResult:
    """Baseline: count the query's (stemmed) words found in title + summary."""
    terms = _uniq(tokenize(query))
    hits = []
    for i, item in enumerate(corpus.items):
        matched = [t for t in terms if t in corpus.plain_tokens[i]]
        why = (f"words: {', '.join(matched)}",) if matched else ()
        hits.append(Hit(item.id, len(matched), why))
    return _finish(corpus, "keyword", query, hits, k, filters)


# --------------------------------------------------------------------- bm25


def _bm25_hits(corpus: Corpus, query: str) -> list[Hit]:
    terms = _uniq(tokenize(query))
    hits = []
    for i, item in enumerate(corpus.items):
        score = corpus.bm25(i, terms)
        matched = [t for t in terms if t in corpus.tf[i]]
        why = (f"terms: {', '.join(matched)}",) if matched else ()
        hits.append(Hit(item.id, score, why))
    return hits


def bm25_search(corpus: Corpus, query: str, *, k: int = 10, filters: Filters | None = None) -> RetrievalResult:
    """Classic lexical ranking with field boosts (plain RAG retrieval)."""
    return _finish(corpus, "bm25", query, _bm25_hits(corpus, query), k, filters)


# -------------------------------------------------------------------- graph


def _graph_hits(corpus: Corpus, query: str, entities: Sequence[LinkedEntity]) -> list[Hit]:
    lexical = _bm25_hits(corpus, query)
    max_lex = max([0, *(h.score for h in lexical)])
    ppr = corpus.personalised_pagerank([e.node for e in entities])
    max_ppr = 0
    for item in corpus.items:
        max_ppr = max(max_ppr, ppr.get(f"item:{item.id}", 0))
    hits = []
    for i, item in enumerate(corpus.items):
        g = ppr.get(f"item:{item.id}", 0) / max_ppr if max_ppr > 0 else 0
        lex = lexical[i].score / max_lex if max_lex > 0 else 0
        why: list[str] = []
        direct = [e for e in entities if _links_directly(item, e)]
        if direct:
            why.append(f"linked: {', '.join(e.label for e in direct)}")
        elif g > 0:
            why.append("related through the topic graph")
        why.extend(lexical[i].why)
        hits.append(Hit(item.id, g + GRAPH_LEXICAL_WEIGHT * lex, tuple(why)))
    return hits


def graph_search(corpus: Corpus, query: str, *, k: int = 10, filters: Filters | None = None) -> RetrievalResult:
    """GraphRAG-style: link topics/countries, spread relevance with personalised PageRank.

    Falls back to BM25 (and says so in ``rewrites``) when nothing links.
    """
    entities = corpus.link_entities(query)
    if not entities:
        res = bm25_search(corpus, query, k=k, filters=filters)
        return dataclasses.replace(res, strategy="graph", rewrites=(GRAPH_FALLBACK_NOTE,))
    return _finish(corpus, "graph", query, _graph_hits(corpus, query, entities), k, filters, entities=entities)


# ------------------------------------------------------------------- hybrid


def fuse(corpus: Corpus, rankings: Iterable[Iterable[Hit]]) -> list[Hit]:
    """Reciprocal-rank fusion over full rankings (hits with score > 0 only).

    Each ranking is first put in ``rank_hits`` order; an item's fused score is
    the sum of ``1 / (RRF_K + rank)`` over the rankings it appears in.
    """
    scores: dict[str, float] = {}
    why: dict[str, list[str]] = {}
    for ranking in rankings:
        ordered = rank_hits(corpus, [h for h in ranking if h.score > 0])
        for rank, hit in enumerate(ordered):
            scores[hit.id] = scores.get(hit.id, 0) + 1 / (RRF_K + rank + 1)
            why[hit.id] = _uniq([*why.get(hit.id, []), *hit.why])
    return [Hit(item_id, score, tuple(why.get(item_id, []))) for item_id, score in scores.items()]


def hybrid_search(corpus: Corpus, query: str, *, k: int = 10, filters: Filters | None = None) -> RetrievalResult:
    """Reciprocal-rank fusion of BM25 and graph rankings."""
    entities = corpus.link_entities(query)
    lexical = _bm25_hits(corpus, query)
    lists = [lexical, _graph_hits(corpus, query, entities)] if entities else [lexical]
    return _finish(corpus, "hybrid", query, fuse(corpus, lists), k, filters, entities=entities)


# ------------------------------------------------------------------ agentic


#: Only words this long are candidates for spelling correction...
SPELL_MIN_LENGTH = 8
#: ...and only into a library word at most this many edits away.
SPELL_MAX_EDITS = 1


def correct_spelling(corpus: Corpus, query: str) -> SpellingFix:
    """Replace an unknown long word (8+ letters) with a library word one edit away.

    Deliberately conservative: looser rules "correct" real words the library
    does not use (wealth to health, boiling to building). Ties prefer the more
    common stem, then the word list's order, so the result is deterministic.
    The returned query is the normalised words joined by spaces.
    """
    fixes: list[str] = []
    out: list[str] = []
    for w in words(query):
        toks = tokenize(w)
        t = toks[0] if toks else None
        if not t or len(w) < SPELL_MIN_LENGTH or corpus.has_term(t):
            out.append(w)
            continue
        best: str | None = None
        best_d = SPELL_MAX_EDITS + 1
        best_df = -1
        for v in corpus.surface:
            if abs(len(v) - len(w)) > SPELL_MAX_EDITS:
                continue
            d = edit_distance(w, v, SPELL_MAX_EDITS)
            if d > SPELL_MAX_EDITS:
                continue
            v_toks = tokenize(v)
            vt = v_toks[0] if v_toks else None
            if not vt:
                continue
            df = corpus.df.get(vt, 0)
            if d < best_d or (d == best_d and df > best_df):
                best, best_d, best_df = v, d, df
        if best:
            fixes.append(f"{w} → {best}")
            out.append(best)
        else:
            out.append(w)
    return SpellingFix(" ".join(out), tuple(fixes))


SPLITTERS: tuple[str, ...] = (" versus ", " vs ", " compared with ", " compared to ", " and ")
_SENTENCE_PUNCT = re.compile(r"[?.!]")
_COMPARE_CUE = re.compile(r"\b(compare|comparing|versus|vs|difference|differences)\b", re.ASCII)
_COMPARE_LEAD = re.compile(
    r"\b(compare|comparing|the difference between|differences between|difference between)\b", re.ASCII
)


def decompose(query: str) -> list[str]:
    """Split "A vs B" / "compare A and B" into two sub-questions; otherwise return ``[query]``."""
    lower = " " + js_trim(_JS_WS_RUN.sub(" ", _SENTENCE_PUNCT.sub(" ", query.lower()))) + " "
    if not _COMPARE_CUE.search(lower):
        return [query]
    body = _COMPARE_LEAD.sub(" ", lower)
    for splitter in SPLITTERS:
        idx = body.find(splitter)
        if idx > 0:
            a = js_trim(body[:idx])
            b = js_trim(body[idx + len(splitter) :])
            if a and b:
                return [a, b]
    return [query]


def _synonyms_for(entities: Sequence[LinkedEntity]) -> str:
    return " ".join(split_node(e.node)[1] for e in entities)


def agentic_search(corpus: Corpus, query: str, *, k: int = 10, filters: Filters | None = None) -> RetrievalResult:
    """A multi-step loop: fix spelling, split comparisons, search each part, fuse, verify.

    Each part is searched with BM25; only when its best score is weak (below
    :data:`WEAK_SCORE`) and it names a topic or country is it retried as a
    hybrid search expanded with the topic names.
    """
    rewrites: list[str] = []
    calls = 0

    spelled = correct_spelling(corpus, query)
    if spelled.fixes:
        rewrites.append(f"spelling: {', '.join(spelled.fixes)}")
    base = spelled.query if spelled.fixes else query

    parts = decompose(base)
    if len(parts) > 1:
        rewrites.append("split into: " + " and ".join(f"“{p}”" for p in parts))

    # BM25 does the work (it scored best on the evaluation questions). The topic
    # graph is only brought in when the lexical match is weak and the question
    # names a topic or country.
    lists: list[Sequence[Hit]] = []
    entities: list[LinkedEntity] = []
    for part in parts:
        part_entities = corpus.link_entities(part)
        res = bm25_search(corpus, part, k=corpus.N)
        calls += 1
        best = res.hits[0].score if res.hits else 0  # the best positive BM25 score, as in TypeScript
        if best < WEAK_SCORE and part_entities:
            expanded = f"{part} {_synonyms_for(part_entities)}"
            rewrites.append(f"weak match for “{part}”, retried with topic names and the topic graph")
            res = hybrid_search(corpus, expanded, k=corpus.N)
            part_entities = list(res.entities)
            calls += 1
        for e in part_entities:
            if not any(x.node == e.node for x in entities):
                entities.append(e)
        lists.append(res.hits)

    fused = fuse(corpus, lists) if len(lists) > 1 else list(lists[0])

    # Verifier: keep only hits with lexical overlap or a direct entity link.
    q_terms = _uniq(tokenize(base))
    before = len(fused)

    def supported(hit: Hit) -> bool:
        i = corpus.index[hit.id]
        item = corpus.items[i]
        lexical = any(t in corpus.tf[i] for t in q_terms)
        linked = any(_links_directly(item, e) for e in entities)
        return lexical or linked

    fused = [h for h in fused if supported(h)]
    if len(fused) < before:
        rewrites.append(f"verifier removed {before - len(fused)} weakly supported results")

    return _finish(corpus, "agentic", query, fused, k, filters, entities=entities, calls=calls, rewrites=rewrites)


# ----------------------------------------------------------------- registry

Strategy = Callable[..., RetrievalResult]

STRATEGIES: dict[str, Strategy] = {
    "keyword": keyword_search,
    "bm25": bm25_search,
    "graph": graph_search,
    "hybrid": hybrid_search,
    "agentic": agentic_search,
}


def retrieve(
    corpus: Corpus, strategy: str, query: str, *, k: int = 10, filters: Filters | None = None
) -> RetrievalResult:
    """Run one strategy by name."""
    try:
        run = STRATEGIES[strategy]
    except KeyError:
        raise ValueError(f"unknown strategy {strategy!r}; expected one of {', '.join(STRATEGY_IDS)}") from None
    return run(corpus, query, k=k, filters=filters)


def related_topics(corpus: Corpus, topic: str, n: int = 5) -> list[tuple[str, int]]:
    """Topics that co-occur with ``topic``, with item counts (``relatedTopics`` in harness.ts)."""
    counts: dict[str, int] = {}
    for item in corpus.items:
        tags = topic_tags(item)
        if topic not in tags:
            continue
        for t in tags:
            if t != topic:
                counts[t] = counts.get(t, 0) + 1
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], js_order(kv[0])))
    return ordered[:n]


# ================================================================== metrics
# Same definitions as src/engine/eval/metrics.ts. Totals are accumulated left
# to right (see the module docstring) so the floats match TypeScript exactly.


def recall_at(ranked: Sequence[str], relevant: Mapping[str, int], k: int) -> float:
    """Share of the relevant items found in the top ``k``."""
    rel = list(relevant)
    if not rel:
        return 0.0
    top = list(ranked[:k])
    return len([item_id for item_id in rel if item_id in top]) / len(rel)


def precision_at(ranked: Sequence[str], relevant: Mapping[str, int], k: int) -> float:
    """Share of the top ``k`` that is relevant (always divided by ``k``)."""
    top = ranked[:k]
    if not top:
        return 0.0
    return len([item_id for item_id in top if item_id in relevant]) / k


def reciprocal_rank(ranked: Sequence[str], relevant: Mapping[str, int]) -> float:
    """1 / rank of the first relevant item, 0 when none is ranked."""
    for i, item_id in enumerate(ranked):
        if item_id in relevant:
            return 1 / (i + 1)
    return 0.0


def ndcg_at(ranked: Sequence[str], relevant: Mapping[str, int], k: int) -> float:
    """Graded nDCG: gain ``2**rel - 1``, discount ``log2(rank + 1)``, ideal-normalised."""
    dcg = 0.0
    for i, item_id in enumerate(ranked[:k]):
        dcg = dcg + (2 ** relevant.get(item_id, 0) - 1) / js_log2(i + 2)
    ideal = 0.0
    for i, rel in enumerate(sorted(relevant.values(), reverse=True)[:k]):
        ideal = ideal + (2**rel - 1) / js_log2(i + 2)
    return dcg / ideal if ideal > 0 else 0.0


def mean(xs: Sequence[float]) -> float:
    """Arithmetic mean, summed left to right like ``Array.prototype.reduce``."""
    if not xs:
        return 0.0
    total = 0.0
    for x in xs:
        total = total + x
    return total / len(xs)


def percentile(xs: Sequence[float], p: float) -> float:
    """Nearest-rank percentile, as in metrics.ts."""
    if not xs:
        return 0.0
    ordered = sorted(xs)
    idx = min(len(ordered) - 1, max(0, math.ceil((p / 100) * len(ordered)) - 1))
    return ordered[idx]


def js_round(x: float) -> int:
    """``Math.round``: halves round towards +infinity (Python's ``round`` rounds half to even)."""
    whole = math.floor(x)
    return whole + 1 if x - whole >= 0.5 else whole


# ================================================================ fixtures


def load_items(path: Path) -> list[Item]:
    """Load a library JSON file (an array of items with camelCase keys)."""
    return [Item.from_dict(d) for d in _load_json(path)]


def load_fixture_items() -> list[Item]:
    """The hand-written test fixtures shared with the TypeScript tests."""
    return [Item.from_dict(d) for d in _load_json(FIXTURES_PATH)["items"]]


def load_injection_fixture() -> Item:
    """The poisoned record used to test prompt-injection handling."""
    return Item.from_dict(_load_json(FIXTURES_PATH)["injection"])
