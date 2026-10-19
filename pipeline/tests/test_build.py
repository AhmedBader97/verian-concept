"""The data build: outputs, determinism, and failing loudly."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from pipeline import build as build_module
from pipeline.build import BuildError, Outputs, build, find_library, main
from pipeline.engine import STRATEGY_IDS, Item

GOLD = [
    {"id": "q-finances", "query": "household finances survey", "relevant": {"household-finances": 2}},
    {
        "id": "q-police",
        "query": "trust in policing in Norway",
        "relevant": {"policing-trust": 2, "youth-preparedness": 1},
    },
    {"id": "q-typo", "query": "preparedniss index", "relevant": {"preparedness-index": 2}, "note": "typo"},
    {"id": "p-mercury", "query": "What is the boiling point of mercury?", "relevant": {}},
    {"id": "p-bread", "query": "Give me a recipe for sourdough bread", "relevant": {}},
]
NOTES = [
    {"found": "A case study is listed twice.", "action": "Kept one.", "items": ["smoke-free"]},
    {"found": "Tag pages show a stray message.", "action": "None needed."},
]


def as_yaml_record(item: Item) -> dict[str, Any]:
    out = item.to_dict()
    if "summaryBasis" in out:
        out["summary_basis"] = out.pop("summaryBasis")
    return out


@pytest.fixture
def inputs(tmp_path: Path, fixture_items: list[Item]) -> dict[str, Path]:
    records = [as_yaml_record(it) for it in fixture_items]
    records[0]["summary_basis"] = "page"
    records.append(  # a news item tagged only with a format tag
        {
            "id": "launch-news",
            "kind": "news",
            "title": "A launch announcement",
            "date": "2026-10-01",
            "url": "https://www.veriangroup.com/news-and-insights/launch-news",
            "topics": ["News"],
            "country": "Global",
            "summary": "A launch announcement.",
            "summary_basis": "title-only",
        }
    )
    paths = {"library": tmp_path / "library.yaml", "gold": tmp_path / "gold.json", "notes": tmp_path / "notes.yaml"}
    paths["library"].write_text(yaml.safe_dump(records, sort_keys=False, allow_unicode=True), encoding="utf-8")
    paths["gold"].write_text(json.dumps(GOLD), encoding="utf-8")
    paths["notes"].write_text(yaml.safe_dump(NOTES, sort_keys=False), encoding="utf-8")
    return paths


def run(inputs: dict[str, Path], out: Path, gold: bool = True) -> Outputs:
    outputs = Outputs.under(out)
    build(inputs["library"], inputs["gold"] if gold else out / "missing.json", outputs, notes_path=inputs["notes"])
    return outputs


def read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def test_rebuilding_gives_byte_identical_files(inputs: dict[str, Path], tmp_path: Path) -> None:
    a = run(inputs, tmp_path / "a")
    b = run(inputs, tmp_path / "b")
    for field in ("library", "quality", "reference", "parity"):
        assert getattr(a, field).read_bytes() == getattr(b, field).read_bytes(), field
    report = build(inputs["library"], inputs["gold"], a, notes_path=inputs["notes"])
    assert all(not changed for _, changed in report.written)  # unchanged files are not rewritten


def test_library_json_is_sorted_with_exact_camel_case_keys(inputs: dict[str, Path], tmp_path: Path) -> None:
    records = read(run(inputs, tmp_path).library)
    keys = ["id", "kind", "title", "date", "url", "topics", "country", "summary"]
    assert [(r["date"], r["id"]) for r in records] == sorted(
        ((r["date"], r["id"]) for r in records), key=lambda d: (-int(d[0].replace("-", "")), d[1])
    )
    for r in records:
        assert list(r) in (keys, [*keys, "summaryBasis"])
    by_id = {r["id"]: r for r in records}
    assert by_id["policing-trust"]["summaryBasis"] == "page"
    assert by_id["launch-news"]["summaryBasis"] == "title-only"
    assert "summaryBasis" not in by_id["smoke-free"]


def test_output_is_utf8_json_with_a_trailing_newline(inputs: dict[str, Path], tmp_path: Path) -> None:
    text = run(inputs, tmp_path).parity.read_text(encoding="utf-8")
    assert text.endswith("}\n")
    assert "→" in text and "\\u2192" not in text  # ensure_ascii=False


def test_quality_report(inputs: dict[str, Path], tmp_path: Path) -> None:
    quality = read(run(inputs, tmp_path).quality)
    assert quality["total"] == 9
    assert quality["byKind"] == {"case-study": 5, "insight": 1, "news": 1, "event": 0, "webinar": 0, "report": 2}
    assert quality["byCountry"]["Global"] == 3
    assert quality["byYear"] == {"2026": 8, "2025": 1}
    assert quality["titleOnlySummaries"] == 1
    # format tags such as News do not count as topics
    assert quality["itemsWithoutTopics"] == {"count": 2, "ids": ["ai-attitudes", "launch-news"]}
    assert quality["byTopic"]["News"] == 1
    assert "Misinformation" in quality["topicsWithoutItems"]
    assert quality["dateRange"] == {"first": "2025-11-10", "last": "2026-10-05"}
    assert quality["sourceNotes"] == NOTES
    assert "generatedAt" not in quality


def test_evaluation_reference(inputs: dict[str, Path], tmp_path: Path) -> None:
    reference = read(run(inputs, tmp_path).reference)
    assert [s["strategy"] for s in reference["strategies"]] == list(STRATEGY_IDS)
    for summary in reference["strategies"]:
        assert [row["id"] for row in summary["rows"]] == ["q-finances", "q-police", "q-typo"]  # probes excluded
        for row in summary["rows"]:
            assert len(row["ranked"]) == len(row["scores"]) <= 10
            assert all(0 <= row[m] <= 1 for m in ("recall", "precision", "rr", "ndcg"))
        assert 0 <= summary["ndcg"] <= 1
    abstention = reference["abstention"]
    assert (abstention["answerable"], abstention["unanswerable"]) == (3, 2)
    assert abstention["falseAbstentions"] == 0
    assert abstention["correctAbstentions"] == 2
    assert [q["id"] for q in abstention["queries"]] == [g["id"] for g in GOLD]


def test_without_gold_questions_the_reference_is_empty(inputs: dict[str, Path], tmp_path: Path) -> None:
    reference = read(run(inputs, tmp_path, gold=False).reference)
    assert reference["strategies"] == [] and reference["abstention"] is None


def test_validation_failure_writes_nothing(inputs: dict[str, Path], tmp_path: Path) -> None:
    records = yaml.safe_load(inputs["library"].read_text(encoding="utf-8"))
    records[1]["url"] = "https://www.example.com/fake"
    inputs["library"].write_text(yaml.safe_dump(records, sort_keys=False), encoding="utf-8")
    out = tmp_path / "out"
    with pytest.raises(build_module.ValidationFailed):
        build(inputs["library"], inputs["gold"], Outputs.under(out), notes_path=inputs["notes"])
    assert not out.exists()


def test_source_notes_naming_unknown_items_fail_the_build(inputs: dict[str, Path], tmp_path: Path) -> None:
    inputs["notes"].write_text(yaml.safe_dump([{"found": "x", "action": "y", "items": ["ghost"]}]), encoding="utf-8")
    with pytest.raises(build_module.ValidationFailed) as caught:
        run(inputs, tmp_path / "out")
    assert "ghost" in caught.value.report()


def test_adopts_the_research_library_on_first_run(
    inputs: dict[str, Path], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "repo" / "pipeline" / "library.yaml"
    monkeypatch.setattr(build_module, "DEFAULT_LIBRARY", target)
    monkeypatch.setattr(build_module, "RESEARCH_LIBRARY", inputs["library"])
    report = build_module.BuildReport()
    assert find_library(None, report) == target
    assert target.read_bytes() == inputs["library"].read_bytes()
    assert report.notes and report.notes[0].startswith("copied")
    monkeypatch.setattr(build_module, "RESEARCH_LIBRARY", tmp_path / "nowhere.yaml")
    assert find_library(None) == target  # the repository copy is used from then on
    target.unlink()
    with pytest.raises(BuildError, match="no library YAML"):
        find_library(None)


def test_cli_exit_codes(inputs: dict[str, Path], tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--gold", str(tmp_path / "missing.json")]) == 2
    assert "gold file not found" in capsys.readouterr().err
    bad = tmp_path / "bad.yaml"
    bad.write_text("- id: Not A Slug\n", encoding="utf-8")
    assert main(["--library", str(bad), "--gold", str(inputs["gold"])]) == 1
    err = capsys.readouterr().err
    assert "missing kind, title, date, url, topics, country, summary" in err
    assert "Nothing was written." in err


def test_fixture_items_are_valid_library_records(fixture_items: list[Item]) -> None:
    from pipeline.validate import validate_library

    assert validate_library([as_yaml_record(it) for it in fixture_items]).warnings == []
