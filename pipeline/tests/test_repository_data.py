"""The committed data files are exactly what the pipeline produces from the committed sources.

If one of these fails, run ``python3 -m pipeline.build`` and commit the result.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.build import DEFAULT_GOLD, DEFAULT_LIBRARY, DEFAULT_SOURCE_NOTES, Outputs, build, to_json
from pipeline.engine import STRATEGY_IDS, Corpus, load_fixture_items, tokenize
from pipeline.evaluate import PARITY_QUERIES, parity_table


def test_parity_fixtures_are_current() -> None:
    committed = Outputs.default().parity
    assert committed.is_file(), "src/engine/parity.fixtures.json is missing: run python3 -m pipeline.build"
    expected = to_json(parity_table(Corpus(load_fixture_items())))
    assert committed.read_text(encoding="utf-8") == expected, "stale parity file: run python3 -m pipeline.build"


def test_parity_fixtures_have_the_shape_parity_test_ts_reads() -> None:
    data = json.loads(Outputs.default().parity.read_text(encoding="utf-8"))
    assert [q["query"] for q in data["queries"]] == list(PARITY_QUERIES)
    for row in data["queries"]:
        assert row["tokens"] == tokenize(row["query"])
        assert set(row["strategies"]) == set(STRATEGY_IDS)
        for result in row["strategies"].values():
            assert len(result["ids"]) == len(result["scores"]) <= 10


@pytest.mark.skipif(not DEFAULT_LIBRARY.is_file(), reason="pipeline/library.yaml has not been adopted yet")
def test_committed_data_matches_a_fresh_build(tmp_path: Path) -> None:
    fresh = Outputs.under(tmp_path)
    build(DEFAULT_LIBRARY, DEFAULT_GOLD, fresh, notes_path=DEFAULT_SOURCE_NOTES)
    committed = Outputs.default()
    for field in ("library", "quality", "reference"):
        ours, theirs = getattr(fresh, field), getattr(committed, field)
        assert theirs.is_file() and ours.read_bytes() == theirs.read_bytes(), (
            f"{theirs.name} is stale: run python3 -m pipeline.build"
        )
