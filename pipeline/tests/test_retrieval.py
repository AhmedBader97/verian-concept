"""Retrieval strategies (mirrors the "retrieval" block of src/engine/engine.test.ts)."""

from __future__ import annotations

import dataclasses

from pipeline.engine import (
    GRAPH_FALLBACK_NOTE,
    RRF_K,
    STRATEGY_IDS,
    Corpus,
    Filters,
    Hit,
    agentic_search,
    bm25_search,
    correct_spelling,
    decompose,
    fuse,
    graph_search,
    hybrid_search,
    keyword_search,
    rank_hits,
    related_topics,
    retrieve,
)


def test_keyword_baseline_counts_shared_words(corpus: Corpus) -> None:
    res = keyword_search(corpus, "household finances survey")
    assert res.hits[0].id == "household-finances"
    assert res.hits[0].score == 3
    assert res.hits[0].why == ("words: household, financ, survey",)


def test_bm25_ranks_the_most_specific_match_first(corpus: Corpus) -> None:
    assert bm25_search(corpus, "smoking near building entrances").hits[0].id == "smoke-free"


def test_graph_search_reaches_items_through_linked_topics(corpus: Corpus) -> None:
    res = graph_search(corpus, "children")
    assert "Youth and Family" in [e.label for e in res.entities]
    ids = res.ids
    assert {"youth-preparedness", "families-first"} <= set(ids)
    assert res.hits[ids.index("youth-preparedness")].why[0] == "linked: Youth and Family"


def test_graph_search_falls_back_to_bm25_when_nothing_links(corpus: Corpus) -> None:
    res = graph_search(corpus, "household finances")
    assert res.rewrites == (GRAPH_FALLBACK_NOTE,)
    assert "fell back" in res.rewrites[0]
    assert res.ids == bm25_search(corpus, "household finances").ids


def test_hybrid_fusion_is_deterministic(corpus: Corpus) -> None:
    a = hybrid_search(corpus, "trust police Norway").ids
    b = hybrid_search(corpus, "trust police Norway").ids
    assert a == b
    assert a[0] == "policing-trust"


def test_agentic_search_fixes_spelling(corpus: Corpus) -> None:
    fixed = correct_spelling(corpus, "preparedniss index")
    assert fixed.fixes == ("preparedniss → preparedness",)
    assert fixed.query == "preparedness index"
    res = agentic_search(corpus, "preparedniss index")
    assert res.hits[0].id == "preparedness-index"
    assert "spelling" in " ".join(res.rewrites)


def test_spelling_repair_leaves_short_and_real_words_alone(corpus: Corpus) -> None:
    # Words under eight letters are never "corrected", so "wealth" cannot become "health".
    assert correct_spelling(corpus, "household wealth and boiling point").fixes == ()
    assert correct_spelling(corpus, "preparednes index").fixes == ("preparednes → preparedness",)


def test_agentic_search_splits_comparisons(corpus: Corpus) -> None:
    assert len(decompose("Compare policing in Norway vs smoking in Australia")) == 2
    assert len(decompose("young people and trust")) == 1
    res = agentic_search(corpus, "compare policing trust versus smoke-free areas")
    assert {"policing-trust", "smoke-free"} <= set(res.ids)
    assert res.calls >= 2
    assert res.rewrites[0] == "split into: “policing trust” and “smoke-free areas”"


def test_agentic_search_retries_weak_matches_with_topic_names(corpus: Corpus) -> None:
    res = agentic_search(corpus, "survey")
    assert res.calls == 2
    assert res.rewrites == ("weak match for “survey”, retried with topic names and the topic graph",)


def test_agentic_verifier_drops_unsupported_hits(corpus: Corpus) -> None:
    res = agentic_search(corpus, "smoking near building entrances")
    assert res.ids == ["smoke-free"]


def test_filters_apply_after_ranking(corpus: Corpus) -> None:
    res = bm25_search(corpus, "survey", filters=Filters(countries=("Spain",)))
    assert res.ids == ["household-finances"]
    recent = bm25_search(corpus, "survey", filters=Filters(since="2026-05-01"))
    assert all(corpus.by_id[i].date >= "2026-05-01" for i in recent.ids)


def test_every_strategy_honours_k_and_returns_positive_scores(corpus: Corpus) -> None:
    for strategy in STRATEGY_IDS:
        res = retrieve(corpus, strategy, "young people trust police preparedness", k=2)
        assert len(res.hits) <= 2
        assert all(h.score > 0 for h in res.hits)


def test_ties_break_by_newest_date_then_id(corpus: Corpus) -> None:
    hits = [Hit("reykjavik-index", 1.0), Hit("smoke-free", 1.0), Hit("policing-trust", 2.0), Hit("ai-attitudes", 1.0)]
    # policing-trust scores highest; the rest are dated 2026-07-26, 2026-05-26 and 2025-11-10
    ranked = [h.id for h in rank_hits(corpus, hits)]
    assert ranked == ["policing-trust", "ai-attitudes", "smoke-free", "reykjavik-index"]
    twins = Corpus([dataclasses.replace(corpus.by_id["policing-trust"], id=i) for i in ("twin-b", "twin-a")])
    assert [h.id for h in rank_hits(twins, [Hit("twin-b", 1.0), Hit("twin-a", 1.0)])] == ["twin-a", "twin-b"]


def test_reciprocal_rank_fusion_sums_reciprocal_ranks(corpus: Corpus) -> None:
    a = [Hit("smoke-free", 3.0, ("terms: smok",)), Hit("policing-trust", 1.0)]
    b = [Hit("policing-trust", 0.9, ("linked: Crime & Justice",)), Hit("ai-attitudes", 0.0)]
    fused = {h.id: h for h in fuse(corpus, [a, b])}
    assert set(fused) == {"smoke-free", "policing-trust"}  # zero scores are left out
    assert fused["smoke-free"].score == 1 / (RRF_K + 1)
    assert fused["policing-trust"].score == 1 / (RRF_K + 2) + 1 / (RRF_K + 1)
    assert fused["policing-trust"].why == ("linked: Crime & Justice",)


def test_related_topics_counts_co_occurring_tags(corpus: Corpus) -> None:
    assert related_topics(corpus, "Youth and Family") == [("Policy Development & Evaluation", 1)]
    assert related_topics(corpus, "Atlantis") == []
