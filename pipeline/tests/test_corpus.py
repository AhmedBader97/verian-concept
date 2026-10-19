"""The indexed corpus (mirrors the "corpus" block of src/engine/engine.test.ts)."""

from __future__ import annotations

import math

import pytest

from pipeline.engine import (
    BM25_B,
    BM25_K1,
    Corpus,
    Item,
    contains_sequence,
    document_tokens,
    js_order,
    tokenize,
)


def test_links_topics_and_countries_from_aliases(corpus: Corpus) -> None:
    linked = [e.node for e in corpus.link_entities("How do young people in Norway feel about the police?")]
    assert "topic:Youth and Family" in linked
    assert "topic:Crime & Justice" in linked
    assert "country:Norway" in linked


def test_links_each_entity_once_through_its_first_matching_alias(corpus: Corpus) -> None:
    linked = corpus.link_entities("young people, youth and children")
    assert [(e.node, e.via) for e in linked] == [("topic:Youth and Family", "youth")]


def test_ignores_entities_that_have_no_items(corpus: Corpus) -> None:
    assert corpus.link_entities("misinformation online") == []


def test_personalised_pagerank_keeps_total_mass_at_one(corpus: Corpus) -> None:
    ppr = corpus.personalised_pagerank(["topic:Youth and Family"])
    total = math.fsum(ppr.values())
    assert total == pytest.approx(1, abs=5e-11)
    assert max(ppr, key=ppr.__getitem__) == "topic:Youth and Family"


def test_personalised_pagerank_needs_a_seed_in_the_graph(corpus: Corpus) -> None:
    assert corpus.personalised_pagerank(["topic:Atlantis"]) == {}
    assert corpus.personalised_pagerank([]) == {}


def test_finds_contiguous_token_sequences_only() -> None:
    assert contains_sequence(["a", "b", "c"], ["b", "c"])
    assert not contains_sequence(["a", "b", "c"], ["a", "c"])
    assert not contains_sequence(["a"], [])
    assert not contains_sequence(["a"], ["a", "b"])


def test_field_boosts_repeat_tokens() -> None:
    item = Item(
        id="x",
        kind="report",
        title="Smoking",
        date="2026-01-01",
        url="https://www.veriangroup.com/x",
        topics=("Public Health", "News"),
        country="Norway",
        summary="Vaping",
    )
    toks = document_tokens(item)
    # title x2, subject topic x2 (format tag "News" ignored), summary, country, kind label
    assert toks == ["smok", "smok", "public", "health", "public", "health", "vap", "norway", "report"]


def test_global_items_get_no_country_tokens() -> None:
    item = Item(id="g", kind="news", title="T", date="2026-01-01", url="u", topics=(), country="Global", summary="")
    assert document_tokens(item) == ["news"]


def test_bm25_matches_the_textbook_formula(corpus: Corpus) -> None:
    i = corpus.index["smoke-free"]
    term = "smok"
    f = corpus.tf[i][term]
    df = corpus.df[term]
    idf = math.log(1 + (corpus.N - df + 0.5) / (df + 0.5))
    expected = idf * f * (BM25_K1 + 1) / (f + BM25_K1 * (1 - BM25_B + BM25_B * corpus.dl[i] / corpus.avgdl))
    assert corpus.bm25(i, [term]) == pytest.approx(expected, rel=1e-12)
    assert corpus.bm25(i, ["absent"]) == 0


def test_graph_is_sorted_and_skips_format_tags(corpus: Corpus) -> None:
    assert corpus.nodes == sorted(corpus.nodes, key=js_order)
    assert all(nbrs == sorted(nbrs, key=js_order) for nbrs in corpus.neighbours.values())
    assert "item:ai-attitudes" in corpus.nodes  # items without topics are still nodes
    assert corpus.neighbours["country:Spain"] == ["item:household-finances"]
    assert not any(n.startswith("topic:News") for n in corpus.nodes)


def test_plain_tokens_are_unboosted_title_and_summary(corpus: Corpus) -> None:
    it = corpus.by_id["household-finances"]
    assert corpus.plain_tokens[corpus.index[it.id]] == frozenset(tokenize(f"{it.title} {it.summary}"))


def test_surface_words_are_sorted_and_unstemmed(corpus: Corpus) -> None:
    assert corpus.surface == sorted(corpus.surface)
    assert "preparedness" in corpus.surface
