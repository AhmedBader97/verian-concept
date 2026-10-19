"""Strict validation of the library, source notes and gold questions."""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any

import pytest

from pipeline.validate import (
    MAX_SUMMARY_WORDS,
    ValidationFailed,
    load_yaml,
    url_key,
    validate_gold,
    validate_library,
    validate_source_notes,
)


def record(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": "policing-trust",
        "kind": "case-study",
        "title": "Understanding trust and confidence in policing",
        "date": "2026-09-17",
        "url": "https://www.veriangroup.com/case-studies/policing-trust",
        "topics": ["Crime & Justice", "Evidence"],
        "country": "Norway",
        "summary": "A long-running survey of how safe people feel and how much they trust the police.",
    }
    base.update(overrides)
    return base


def problems_for(*records: dict[str, Any]) -> list[str]:
    with pytest.raises(ValidationFailed) as caught:
        validate_library(list(records))
    return caught.value.problems


def test_accepts_a_valid_library_and_tidies_text() -> None:
    lib = validate_library(
        [
            record(summary="Two decades of\n  measuring trust. ", summary_basis="teaser"),
            record(id="other", url="https://veriangroup.com/news-and-insights/other", date=dt.date(2025, 1, 2)),
        ]
    )
    first, second = lib.items
    assert first.summary == "Two decades of measuring trust."
    assert first.summary_basis == "teaser"
    assert second.date == "2025-01-02"  # an unquoted YAML date
    assert lib.warnings == []


def test_rejects_a_url_outside_veriangroup_com() -> None:
    (problem,) = problems_for(record(url="https://www.example.com/case-studies/policing-trust"))
    assert "url host must be www.veriangroup.com or veriangroup.com" in problem
    assert "'www.example.com'" in problem


def test_rejects_plain_http() -> None:
    (problem,) = problems_for(record(url="http://www.veriangroup.com/case-studies/policing-trust"))
    assert "https" in problem


def test_rejects_an_unknown_topic() -> None:
    (problem,) = problems_for(record(topics=["Crime & Justice", "Astrology"]))
    assert "unknown topic 'Astrology'" in problem


def test_rejects_a_duplicate_id() -> None:
    (problem,) = problems_for(record(), record(url="https://www.veriangroup.com/case-studies/another-page"))
    assert problem == 'item 2: duplicate id "policing-trust" (first used by item 1)'


def test_rejects_a_long_summary() -> None:
    (problem,) = problems_for(record(summary=" ".join(["word"] * (MAX_SUMMARY_WORDS + 1))))
    assert f"summary has {MAX_SUMMARY_WORDS + 1} words; the limit is {MAX_SUMMARY_WORDS}" in problem


def test_accepts_a_summary_at_the_limit() -> None:
    validate_library([record(summary=" ".join(["word"] * MAX_SUMMARY_WORDS))])


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"kind": "podcast"}, "kind must be one of"),
        ({"date": "2026-02-30"}, "not a real calendar date"),
        ({"date": "17/09/2026"}, "ISO date"),
        ({"id": "Policing Trust"}, "id must be a slug"),
        ({"title": "   "}, "title must be non-empty"),
        ({"summary": ""}, "summary must be non-empty"),
        ({"topics": "Crime & Justice"}, "topics must be a list"),
        ({"topics": ["Evidence", "Evidence"]}, "topic listed more than once"),
        ({"summary_basis": "guess"}, "summary_basis must be one of"),
        ({"author": "someone"}, "unknown field author"),
    ],
)
def test_rejects_other_bad_fields(overrides: dict[str, Any], expected: str) -> None:
    (problem,) = problems_for(record(**overrides))
    assert expected in problem


def test_reports_every_problem_at_once_with_positions() -> None:
    bad_host = record(id="a", url="https://example.org/a")
    missing = {k: v for k, v in record(id="b").items() if k != "summary"}
    problems = problems_for(bad_host, missing, "not a mapping")
    assert problems[0].startswith('item 1 (id "a"): url host')
    assert problems[1] == 'item 2 (id "b"): missing summary'
    assert problems[2].startswith("item 3: must be a mapping")
    report = ValidationFailed("library.yaml", problems).report()
    assert report.splitlines()[0] == "library.yaml: 3 problems"


def test_drops_duplicate_urls_with_a_warning() -> None:
    lib = validate_library(
        [
            record(),
            record(),  # the exact same record again
            record(id="variant", url="https://veriangroup.com/case-studies/policing-trust/"),
        ]
    )
    assert [it.id for it in lib.items] == ["policing-trust"]
    assert lib.warnings[0] == (
        'item 2 (id "policing-trust") dropped: same URL as item 1 (id "policing-trust"); identical record'
    )
    assert "records differ" in lib.warnings[1]


def test_url_key_ignores_www_trailing_slash_and_fragment() -> None:
    assert url_key("https://www.veriangroup.com/a/b/#top") == url_key("https://veriangroup.com/a/b")


def test_warns_about_countries_missing_from_the_lexicon() -> None:
    lib = validate_library([record(country="Atlantis")])
    assert lib.warnings == [
        "country 'Atlantis' is not in the lexicon, so questions cannot link to it (1 item: policing-trust)"
    ]


def test_rejects_an_empty_library_or_a_non_list() -> None:
    with pytest.raises(ValidationFailed):
        validate_library([])
    with pytest.raises(ValidationFailed):
        validate_library({"id": "x"})


def test_yaml_loader_rejects_duplicate_keys(tmp_path: Path) -> None:
    path = tmp_path / "library.yaml"
    path.write_text("- id: a\n  id: b\n", encoding="utf-8")
    with pytest.raises(ValidationFailed) as caught:
        load_yaml(path, "library.yaml")
    assert "duplicate key 'id'" in caught.value.problems[0]


# ------------------------------------------------------------- source notes

IDS = frozenset({"policing-trust", "smoke-free"})


def test_source_notes_keep_their_keys_and_order() -> None:
    notes = validate_source_notes(
        [
            {"found": "Two pages tell the same story.", "action": "Kept one.", "items": ["smoke-free"]},
            {"found": "Tag pages show a  stray message.", "action": "None needed."},
        ],
        IDS,
    )
    assert notes == [
        {"found": "Two pages tell the same story.", "action": "Kept one.", "items": ["smoke-free"]},
        {"found": "Tag pages show a stray message.", "action": "None needed."},
    ]
    assert validate_source_notes(None, IDS) == []


def test_source_notes_must_name_items_in_the_library() -> None:
    with pytest.raises(ValidationFailed) as caught:
        validate_source_notes([{"found": "x", "action": "y", "items": ["smoke-free", "ghost"]}], IDS)
    assert caught.value.problems == ["note 1: item not in the library: ghost"]


def test_source_notes_need_found_and_action() -> None:
    with pytest.raises(ValidationFailed) as caught:
        validate_source_notes([{"found": "x"}, {"action": "y", "extra": 1}], IDS)
    assert caught.value.problems == [
        "note 1: action must be non-empty text",
        "note 2: unknown field extra",
        "note 2: found must be non-empty text",
    ]


# --------------------------------------------------------------------- gold


def test_gold_questions_are_checked_against_the_library() -> None:
    gold = validate_gold(
        [
            {"id": "q1", "query": "trust in police", "relevant": {"policing-trust": 2}},
            {"id": "p1", "query": "boiling point of mercury", "relevant": {}, "note": "probe"},
        ],
        IDS,
    )
    assert [g.answerable for g in gold] == [True, False]
    with pytest.raises(ValidationFailed) as caught:
        validate_gold(
            [
                {"id": "q1", "query": "x", "relevant": {"ghost": 2}},
                {"id": "q1", "query": "y", "relevant": {"smoke-free": 3}},
            ],
            IDS,
        )
    assert caught.value.problems == [
        "question 1 (id \"q1\"): relevant item 'ghost' is not in the library",
        'question 2 (id "q1"): duplicate id (first used by question 1)',
        "question 2 (id \"q1\"): relevance of 'smoke-free' must be 1 or 2, got 3",
    ]
