"""Text processing (mirrors the "text" block of src/engine/engine.test.ts)."""

from __future__ import annotations

import pytest

from pipeline.engine import edit_distance, estimate_tokens, normalize, stem, tokenize, words


def test_normalises_accents_case_and_punctuation() -> None:
    assert normalize("Reykjavík Index — 2026!") == "reykjavik index 2026"


def test_normalize_folds_compatibility_characters() -> None:
    assert normalize("ﬁnance Ⅻ") == "finance xii"
    assert normalize("   ") == ""


def test_words_drop_single_characters() -> None:
    # "e.g." becomes "e g": punctuation splits words, and single letters go.
    assert words("A survey of 5 UK cities, e.g. Leeds") == ["survey", "of", "uk", "cities", "leeds"]
    assert words("!!!") == []


@pytest.mark.parametrize(
    ("word", "expected"),
    [
        ("policies", "policy"),
        ("families", "family"),
        ("policing", "polic"),
        ("police", "polic"),
        ("smoking", "smok"),
        ("smoke", "smok"),
        ("evaluations", "evaluat"),
        ("evaluate", "evaluat"),
        ("evaluating", "evaluat"),
        ("preparedness", "prepar"),
        ("prepared", "prepar"),
        ("news", "news"),
        ("crisis", "crisis"),
        ("process", "process"),
        ("2026", "2026"),
    ],
)
def test_stems_predictably_and_keeps_short_words(word: str, expected: str) -> None:
    assert stem(word) == expected


@pytest.mark.parametrize(
    ("a", "b"),
    [
        ("evaluations", "evaluate"),
        ("evaluating", "evaluate"),
        ("policing", "police"),
        ("smoking", "smoke"),
        ("preparedness", "prepared"),
    ],
)
def test_related_forms_share_a_stem(a: str, b: str) -> None:
    assert stem(a) == stem(b)


def test_stemming_stops_after_four_passes() -> None:
    # Each pass strips one trailing "e"; the fifth would leave "aaaa".
    assert stem("aaaaeeeee") == "aaaae"


def test_drops_stopwords_and_verians_own_name() -> None:
    assert tokenize("What has Verian published about the police?") == ["publish", "polic"]


def test_measures_edit_distance_with_transpositions() -> None:
    assert edit_distance("polcie", "police") == 1
    assert edit_distance("survey", "survey") == 0
    assert edit_distance("abc", "xyzuvw", 2) > 2


def test_edit_distance_stops_early_once_past_the_cap() -> None:
    assert edit_distance("abcdef", "uvwxyz", 2) == 3
    assert edit_distance("kitten", "sitting") == 3


def test_estimates_four_characters_per_token() -> None:
    assert [estimate_tokens(t) for t in ("", "abcd", "abcde")] == [0, 1, 2]
    assert estimate_tokens("🙂🙂") == 1  # JavaScript counts UTF-16 code units: 4 of them
