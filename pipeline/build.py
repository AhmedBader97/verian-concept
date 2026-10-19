"""Build the site's data files from the curated library.

Usage::

    python3 -m pipeline.build [--library PATH] [--gold PATH]
    python3 -m pipeline.build --parity-only

Steps:

1. Read the library YAML (default ``pipeline/library.yaml``). On the first run,
   when that file does not exist yet, it is copied from the research workspace
   next to this repository (``../research/library.yaml``).
2. Validate every record strictly (:mod:`pipeline.validate`). Any problem stops
   the build with a full report, and nothing is written.
3. Write ``src/data/library.json`` (newest first) and ``src/data/quality.json``.
4. Evaluate every retrieval strategy on the gold questions
   (``src/data/gold.json``) and calibrate the refusal threshold:
   ``src/data/eval.reference.json``.
5. Record the reference engine's results on the shared test fixtures:
   ``src/engine/parity.fixtures.json``.

The outputs contain no timestamps or machine-specific paths, so rebuilding from
the same inputs gives byte-identical files (and unchanged files are not
rewritten).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pipeline.engine import (
    KINDS,
    REPO_ROOT,
    TOPICS,
    Corpus,
    Item,
    load_fixture_items,
    topic_tags,
)
from pipeline.evaluate import GoldQuery, evaluate, parity_table
from pipeline.validate import (
    ValidationFailed,
    load_yaml,
    validate_gold,
    validate_library,
    validate_source_notes,
)

DEFAULT_LIBRARY = REPO_ROOT / "pipeline" / "library.yaml"
#: Where the research step writes the library before it is adopted into the repository.
RESEARCH_LIBRARY = REPO_ROOT.parent / "research" / "library.yaml"
#: Optional notes on problems found on the source site, copied into quality.json.
DEFAULT_SOURCE_NOTES = REPO_ROOT / "pipeline" / "source_notes.yaml"
DEFAULT_GOLD = REPO_ROOT / "src" / "data" / "gold.json"
ANSWER_TS = REPO_ROOT / "src" / "engine" / "answer.ts"


class BuildError(Exception):
    """A problem with the build's inputs that is not a validation failure (e.g. a missing file)."""


@dataclass(frozen=True, slots=True)
class Outputs:
    """Where the build writes. Tests point this at a temporary directory."""

    library: Path
    quality: Path
    reference: Path
    parity: Path

    @classmethod
    def default(cls) -> Outputs:
        data = REPO_ROOT / "src" / "data"
        return cls(
            library=data / "library.json",
            quality=data / "quality.json",
            reference=data / "eval.reference.json",
            parity=REPO_ROOT / "src" / "engine" / "parity.fixtures.json",
        )

    @classmethod
    def under(cls, directory: Path) -> Outputs:
        return cls(
            library=directory / "library.json",
            quality=directory / "quality.json",
            reference=directory / "eval.reference.json",
            parity=directory / "parity.fixtures.json",
        )


@dataclass(slots=True)
class BuildReport:
    """What a build did, for the console summary (and for tests)."""

    library_source: Path | None = None
    items: int = 0
    gold_questions: int = 0
    probes: int = 0
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    written: list[tuple[Path, bool]] = field(default_factory=list)
    strategies: list[dict[str, Any]] = field(default_factory=list)
    abstention: dict[str, Any] | None = None

    def summary(self) -> str:
        lines: list[str] = []
        if self.library_source is not None:
            lines.append(f"Library: {self.items} items from {display_path(self.library_source)}")
        lines.extend(f"note: {n}" for n in self.notes)
        lines.extend(f"warning: {w}" for w in self.warnings)
        if self.strategies:
            lines.append(
                f"Evaluation on {self.gold_questions - self.probes} answerable questions "
                f"({self.probes} unanswerable probes kept for the abstention study):"
            )
            lines.append(f"  {'strategy':<10}{'nDCG@10':>9}{'recall@5':>10}{'MRR':>8}{'calls':>7}")
            for s in self.strategies:
                lines.append(
                    f"  {s['strategy']:<10}{s['ndcg']:>9.3f}{s['recall']:>10.3f}{s['mrr']:>8.3f}{s['calls']:>7.2f}"
                )
        if self.abstention and self.abstention.get("threshold") is not None:
            a = self.abstention
            lines.append(
                f"Abstention: threshold {a['threshold']} refuses {a['correctAbstentions']} of "
                f"{a['unanswerable']} probes and {a['falseAbstentions']} of {a['answerable']} answerable questions"
                + ("" if a["feasible"] else f" ({len(a['unavoidableFalseAbstentions'])} unavoidable)")
            )
            current = current_abstain_below()
            if current is not None and current != a["threshold"]:
                lines.append(
                    f"  src/engine/answer.ts has ABSTAIN_BELOW = {current}; set it to {a['threshold']} "
                    "(src/engine/parity.test.ts checks that they match)"
                )
        for path, changed in self.written:
            lines.append(f"{'wrote' if changed else 'unchanged'} {display_path(path)}")
        return "\n".join(lines)


# ------------------------------------------------------------------ helpers


def display_path(path: Path) -> str:
    """A path relative to the repository when it is inside it."""
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def to_json(value: Any) -> str:
    """Stable JSON text: UTF-8 (not \\u escapes), two-space indent, trailing newline."""
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def write_if_changed(path: Path, text: str) -> bool:
    """Atomically write ``text`` to ``path`` unless it already holds it. Returns True if written."""
    data = text.encode("utf-8")
    if path.is_file() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return True


def current_abstain_below(answer_ts: Path = ANSWER_TS) -> float | None:
    """The ``ABSTAIN_BELOW`` constant in answer.ts, read for the build summary only."""
    try:
        match = re.search(r"export const ABSTAIN_BELOW\s*=\s*([0-9.]+)", answer_ts.read_text(encoding="utf-8"))
    except OSError:
        return None
    return float(match.group(1)) if match else None


# ------------------------------------------------------------------- inputs


def find_library(explicit: Path | None, report: BuildReport | None = None) -> Path:
    """Locate the library YAML, adopting the research copy on the first run."""
    if explicit is not None:
        if not explicit.is_file():
            raise BuildError(f"library file not found: {explicit}")
        return explicit
    if DEFAULT_LIBRARY.is_file():
        if (
            report is not None
            and RESEARCH_LIBRARY.is_file()
            and RESEARCH_LIBRARY.read_bytes() != DEFAULT_LIBRARY.read_bytes()
        ):
            report.notes.append(
                f"{RESEARCH_LIBRARY} differs from {display_path(DEFAULT_LIBRARY)}; "
                "the build uses the repository copy (copy the research file over to adopt it)"
            )
        return DEFAULT_LIBRARY
    if RESEARCH_LIBRARY.is_file():
        DEFAULT_LIBRARY.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(RESEARCH_LIBRARY, DEFAULT_LIBRARY)
        if report is not None:
            report.notes.append(f"copied {RESEARCH_LIBRARY} to {display_path(DEFAULT_LIBRARY)}")
        return DEFAULT_LIBRARY
    raise BuildError(
        f"no library YAML: expected {display_path(DEFAULT_LIBRARY)} (or {RESEARCH_LIBRARY} to adopt). "
        "Run `python3 -m pipeline.build --parity-only` to refresh the fixture parity file without a library."
    )


def load_gold(path: Path, items: Sequence[Item]) -> list[GoldQuery]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValidationFailed(display_path(path), [f"not valid JSON: {exc}"]) from exc
    return validate_gold(data, frozenset(it.id for it in items), source=display_path(path))


# ------------------------------------------------------------------ outputs


def library_records(items: Sequence[Item]) -> list[dict[str, Any]]:
    """library.json: newest first, then by id."""
    ordered = sorted(items, key=lambda it: it.id)
    ordered.sort(key=lambda it: it.date, reverse=True)
    return [it.to_dict() for it in ordered]


def _by_count(counter: Counter[str]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda kv: (-kv[1], kv[0])))


def quality_report(
    items: Sequence[Item], warnings: Sequence[str] = (), source_notes: Sequence[dict[str, Any]] = ()
) -> dict[str, Any]:
    """quality.json: coverage counts and the gaps that affect retrieval. No timestamps, by design.

    ``byTopic`` counts every tag, format tags (News, Webinar) included;
    ``itemsWithoutTopics`` counts items with no subject topic, so format tags
    do not count there (such items are unreachable by topic browsing or the graph).
    """
    topic_counts: Counter[str] = Counter(t for it in items for t in it.topics)
    for topic in TOPICS:
        topic_counts.setdefault(topic, 0)
    basis: Counter[str] = Counter(it.summary_basis or "unspecified" for it in items)
    untagged = sorted(it.id for it in items if not topic_tags(it))
    dates = sorted(it.date for it in items)
    return {
        "total": len(items),
        "byKind": {kind: sum(1 for it in items if it.kind == kind) for kind in KINDS},
        "byTopic": _by_count(topic_counts),
        "byCountry": _by_count(Counter(it.country for it in items)),
        "byYear": dict(sorted(Counter(it.date[:4] for it in items).items(), reverse=True)),
        "summaryBasis": _by_count(basis),
        "titleOnlySummaries": basis.get("title-only", 0),
        "itemsWithoutTopics": {"count": len(untagged), "ids": untagged},
        "topicsWithoutItems": sorted(t for t in TOPICS if topic_counts[t] == 0),
        "dateRange": {"first": dates[0], "last": dates[-1]} if dates else None,
        "warnings": list(warnings),
        "sourceNotes": list(source_notes),
    }


def empty_reference(reason: str) -> dict[str, Any]:
    """eval.reference.json when there are no gold questions: well-formed, and shows nothing."""
    return {"note": reason, "strategies": [], "abstention": None}


# -------------------------------------------------------------------- build


def build_parity(outputs: Outputs, report: BuildReport | None = None) -> BuildReport:
    """Write only src/engine/parity.fixtures.json (needs no library)."""
    report = report or BuildReport()
    table = parity_table(Corpus(load_fixture_items()))
    report.written.append((outputs.parity, write_if_changed(outputs.parity, to_json(table))))
    return report


def build(
    library_path: Path,
    gold_path: Path | None,
    outputs: Outputs,
    report: BuildReport | None = None,
    notes_path: Path | None = DEFAULT_SOURCE_NOTES,
) -> BuildReport:
    """Validate the inputs, then write every output. Nothing is written if validation fails."""
    report = report or BuildReport()
    report.library_source = library_path

    library_label = display_path(library_path)
    library = validate_library(load_yaml(library_path, library_label), source=library_label)
    report.items = len(library.items)
    report.warnings.extend(library.warnings)
    item_ids = frozenset(it.id for it in library.items)

    source_notes: list[dict[str, Any]] = []
    if notes_path is not None and notes_path.is_file():
        notes_label = display_path(notes_path)
        source_notes = validate_source_notes(load_yaml(notes_path, notes_label), item_ids, source=notes_label)

    gold: list[GoldQuery] = []
    if gold_path is not None and gold_path.is_file():
        gold = load_gold(gold_path, library.items)
    elif gold_path is not None:
        report.notes.append(f"no gold questions at {display_path(gold_path)}; evaluation skipped")

    corpus = Corpus(library.items)
    if gold:
        reference = evaluate(corpus, gold)
        report.gold_questions = len(gold)
        report.probes = sum(1 for g in gold if not g.answerable)
        report.strategies = reference["strategies"]
        report.abstention = reference["abstention"]
        stuck = reference["abstention"]["unavoidableFalseAbstentions"]
        if stuck:
            report.warnings.append(
                f"abstention: every candidate threshold refuses answerable question{'s' if len(stuck) > 1 else ''} "
                f"{', '.join(stuck)} (weak BM25 match on the question as typed, nothing linked); "
                "the threshold was chosen to add no other false refusals"
            )
    else:
        reference = empty_reference("No gold questions yet: run the build after adding src/data/gold.json.")

    files = [
        (outputs.library, library_records(library.items)),
        (outputs.quality, quality_report(library.items, library.warnings, source_notes)),
        (outputs.reference, reference),
    ]
    for path, value in files:
        report.written.append((path, write_if_changed(path, to_json(value))))
    return build_parity(outputs, report)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m pipeline.build",
        description="Validate the library and build src/data/*.json and src/engine/parity.fixtures.json.",
    )
    parser.add_argument("--library", type=Path, help=f"library YAML (default: {display_path(DEFAULT_LIBRARY)})")
    parser.add_argument("--gold", type=Path, help=f"gold questions JSON (default: {display_path(DEFAULT_GOLD)})")
    parser.add_argument(
        "--source-notes",
        type=Path,
        help=f"notes on the source site, copied into quality.json (default: {display_path(DEFAULT_SOURCE_NOTES)})",
    )
    parser.add_argument("--parity-only", action="store_true", help="only refresh src/engine/parity.fixtures.json")
    args = parser.parse_args(argv)

    report = BuildReport()
    try:
        if args.parity_only:
            build_parity(Outputs.default(), report)
        else:
            for flag, path in (("gold", args.gold), ("source notes", args.source_notes)):
                if path is not None and not path.is_file():
                    raise BuildError(f"{flag} file not found: {path}")
            library_path = find_library(args.library, report)
            build(
                library_path,
                args.gold or DEFAULT_GOLD,
                Outputs.default(),
                report,
                notes_path=args.source_notes or DEFAULT_SOURCE_NOTES,
            )
    except ValidationFailed as exc:
        print(exc.report(), file=sys.stderr)
        print("Nothing was written.", file=sys.stderr)
        return 1
    except BuildError as exc:
        for note in report.notes:
            print(f"note: {note}", file=sys.stderr)
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(report.summary())
    return 0


if __name__ == "__main__":
    sys.exit(main())
