"""Strict validation of the library YAML and the gold questions.

The library is curated by hand (and by a research step) from veriangroup.com,
so the build refuses anything it cannot vouch for and reports every problem at
once, with the item's position and id, instead of stopping at the first.

Library rules (one YAML list of mappings):

* keys: ``id, kind, title, date, url, topics, country, summary`` and optionally
  ``summary_basis``; nothing else, and no key twice;
* ``id`` is a unique slug (``lower-case-words-and-digits``);
* ``kind`` is one of case-study, insight, news, event, webinar, report;
* ``date`` is a real ISO calendar date (``yyyy-mm-dd``);
* ``url`` is ``https://`` on www.veriangroup.com or veriangroup.com;
* ``topics`` lists Verian topic tags from ``src/engine/lexicon/aliases.json``
  (its ``topics`` and ``formatTags``), each at most once;
* ``title`` and ``summary`` are non-empty; ``summary`` is at most 40 words;
* ``summary_basis`` is teaser, page or title-only.

Records with the same URL as an earlier record are dropped with a warning
(URLs are compared ignoring "www.", a trailing slash and any #fragment). A
country the lexicon does not know is allowed but warned about, because queries
cannot link to it.

The same module validates the gold questions and the source-site notes, whose
item ids must all exist in the library.
"""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import yaml

from pipeline.engine import COUNTRIES, FORMAT_TAGS, KINDS, TOPICS, Item
from pipeline.evaluate import GoldQuery

ALLOWED_HOSTS: tuple[str, ...] = ("www.veriangroup.com", "veriangroup.com")
ALLOWED_TOPICS: frozenset[str] = frozenset(TOPICS) | FORMAT_TAGS
SUMMARY_BASES: tuple[str, ...] = ("teaser", "page", "title-only")
MAX_SUMMARY_WORDS = 40

REQUIRED_KEYS: tuple[str, ...] = ("id", "kind", "title", "date", "url", "topics", "country", "summary")
OPTIONAL_KEYS: tuple[str, ...] = ("summary_basis",)
GOLD_REQUIRED_KEYS: tuple[str, ...] = ("id", "query", "relevant")
GOLD_OPTIONAL_KEYS: tuple[str, ...] = ("note",)

_SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
_WHITESPACE = re.compile(r"\s+")


class ValidationFailed(Exception):
    """Raised with every problem found, so one run shows the whole list."""

    def __init__(self, source: str, problems: Sequence[str]) -> None:
        self.source = source
        self.problems = list(problems)
        super().__init__(self.report())

    def report(self) -> str:
        count = len(self.problems)
        lines = [f"{self.source}: {count} problem{'s' if count != 1 else ''}"]
        lines.extend(f"  - {p}" for p in self.problems)
        return "\n".join(lines)


@dataclass(frozen=True, slots=True)
class ValidatedLibrary:
    items: list[Item]
    warnings: list[str] = field(default_factory=list)


# ------------------------------------------------------------------ loading


class _StrictLoader(yaml.SafeLoader):
    """A SafeLoader that rejects duplicate mapping keys instead of keeping the last one."""


def _construct_mapping(loader: _StrictLoader, node: yaml.MappingNode, deep: bool = False) -> dict[Any, Any]:
    loader.flatten_mapping(node)
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping", node.start_mark, f"found duplicate key {key!r}", key_node.start_mark
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_StrictLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping)


def load_yaml(path: Path, source: str | None = None) -> Any:
    """Parse a YAML file safely, failing on duplicate keys. ``source`` labels errors."""
    try:
        with path.open(encoding="utf-8") as fh:
            return yaml.load(fh, Loader=_StrictLoader)  # noqa: S506 - a SafeLoader subclass
    except yaml.YAMLError as exc:
        raise ValidationFailed(source or str(path), [f"not valid YAML: {exc}"]) from exc


# ------------------------------------------------------------------ library


def _label(position: int, record: Any) -> str:
    """``item 3 (id "foo")``, with a 1-based position in the YAML list."""
    if isinstance(record, Mapping) and isinstance(record.get("id"), str) and record["id"]:
        return f'item {position} (id "{record["id"]}")'
    return f"item {position}"


def _clean_text(value: Any) -> str | None:
    """Trim and collapse white space (YAML block scalars keep newlines); ``None`` if not text."""
    if not isinstance(value, str):
        return None
    return _WHITESPACE.sub(" ", value).strip()


def _check_date(value: Any) -> tuple[str | None, str | None]:
    """Return ``(iso_date, problem)``. YAML turns unquoted dates into ``date`` objects."""
    if isinstance(value, dt.datetime):
        return None, f"date must be a calendar date (yyyy-mm-dd), not a timestamp: {value.isoformat()}"
    if isinstance(value, dt.date):
        return value.isoformat(), None
    if not isinstance(value, str) or not _ISO_DATE.fullmatch(value):
        return None, f"date must be an ISO date (yyyy-mm-dd), got {value!r}"
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        return None, f"date {value!r} is not a real calendar date"
    return value, None


def _check_url(value: Any) -> str | None:
    """Return a problem description, or ``None`` when the URL is acceptable."""
    if not isinstance(value, str) or not value:
        return f"url must be a non-empty string, got {value!r}"
    if value != value.strip() or any(ch.isspace() for ch in value):
        return f"url must not contain white space: {value!r}"
    parts = urlsplit(value)
    if parts.scheme != "https":
        return f"url must use https, got {value!r}"
    if parts.netloc not in ALLOWED_HOSTS:
        return f"url host must be {' or '.join(ALLOWED_HOSTS)}, got {parts.netloc!r}"
    return None


def url_key(url: str) -> str:
    """The form of a URL used to spot duplicates: no "www.", trailing slash or fragment."""
    parts = urlsplit(url)
    host = parts.netloc.lower().removeprefix("www.")
    path = parts.path.rstrip("/") or "/"
    return f"{host}{path}" + (f"?{parts.query}" if parts.query else "")


def _check_record(position: int, record: Any) -> tuple[Item | None, list[str]]:
    """Validate one library record. Returns the item (if valid) and its problems."""
    label = _label(position, record)
    if not isinstance(record, Mapping):
        return None, [f"{label}: must be a mapping of fields, got {type(record).__name__}"]

    problems: list[str] = []
    missing = [k for k in REQUIRED_KEYS if k not in record]
    if missing:
        problems.append(f"{label}: missing {', '.join(missing)}")
    unknown = sorted(str(k) for k in record if k not in REQUIRED_KEYS and k not in OPTIONAL_KEYS)
    if unknown:
        problems.append(f"{label}: unknown field{'s' if len(unknown) > 1 else ''} {', '.join(unknown)}")
    if missing:
        return None, problems

    item_id = record["id"]
    if not isinstance(item_id, str) or not _SLUG.fullmatch(item_id):
        problems.append(f"{label}: id must be a slug of lower-case letters, digits and hyphens, got {item_id!r}")

    kind = record["kind"]
    if kind not in KINDS:
        problems.append(f"{label}: kind must be one of {', '.join(KINDS)}, got {kind!r}")

    title = _clean_text(record["title"])
    if not title:
        problems.append(f"{label}: title must be non-empty text")

    date, date_problem = _check_date(record["date"])
    if date_problem:
        problems.append(f"{label}: {date_problem}")

    url_problem = _check_url(record["url"])
    if url_problem:
        problems.append(f"{label}: {url_problem}")

    topics = record["topics"]
    if not isinstance(topics, list) or not all(isinstance(t, str) for t in topics):
        problems.append(f"{label}: topics must be a list of topic names, got {topics!r}")
        topics = []
    else:
        unknown_topics = [t for t in topics if t not in ALLOWED_TOPICS]
        if unknown_topics:
            problems.append(
                f"{label}: unknown topic{'s' if len(unknown_topics) > 1 else ''} "
                f"{', '.join(repr(t) for t in unknown_topics)} (allowed: the topics and formatTags "
                "in src/engine/lexicon/aliases.json)"
            )
        repeated = sorted({t for t in topics if topics.count(t) > 1})
        if repeated:
            problems.append(f"{label}: topic listed more than once: {', '.join(repeated)}")

    country = _clean_text(record["country"])
    if not country:
        problems.append(f'{label}: country must be non-empty text (use "Global" for no single country)')

    summary = _clean_text(record["summary"])
    if not summary:
        problems.append(f"{label}: summary must be non-empty text")
    elif (n_words := len(summary.split(" "))) > MAX_SUMMARY_WORDS:
        problems.append(f"{label}: summary has {n_words} words; the limit is {MAX_SUMMARY_WORDS}")

    basis = record.get("summary_basis")
    if basis is not None and basis not in SUMMARY_BASES:
        problems.append(f"{label}: summary_basis must be one of {', '.join(SUMMARY_BASES)}, got {basis!r}")

    if problems:
        return None, problems
    return (
        Item(
            id=item_id,
            kind=kind,
            title=title,
            date=date,
            url=record["url"],
            topics=tuple(topics),
            country=country,
            summary=summary,
            summary_basis=basis,
        ),
        [],
    )


def validate_library(data: Any, source: str = "library") -> ValidatedLibrary:
    """Validate parsed library YAML. Raises :class:`ValidationFailed` listing every problem."""
    if not isinstance(data, list):
        raise ValidationFailed(source, [f"the file must contain a list of items, got {type(data).__name__}"])
    if not data:
        raise ValidationFailed(source, ["the library is empty"])

    problems: list[str] = []
    warnings: list[str] = []
    kept: list[tuple[int, Item]] = []
    first_by_url: dict[str, tuple[int, Item]] = {}

    for position, record in enumerate(data, start=1):
        item, record_problems = _check_record(position, record)
        problems.extend(record_problems)
        if item is None:
            continue
        key = url_key(item.url)
        earlier = first_by_url.get(key)
        if earlier is not None:
            first_position, first = earlier
            same = "identical record" if first == item else "the records differ"
            warnings.append(
                f'{_label(position, record)} dropped: same URL as item {first_position} (id "{first.id}"); {same}'
            )
            continue
        first_by_url[key] = (position, item)
        kept.append((position, item))

    first_by_id: dict[str, int] = {}
    for position, item in kept:
        if item.id in first_by_id:
            problems.append(f'item {position}: duplicate id "{item.id}" (first used by item {first_by_id[item.id]})')
        else:
            first_by_id[item.id] = position

    if problems:
        raise ValidationFailed(source, problems)

    known_countries = set(COUNTRIES) | {"Global"}
    for country in sorted({item.country for _, item in kept} - known_countries):
        ids = [item.id for _, item in kept if item.country == country]
        warnings.append(
            f"country {country!r} is not in the lexicon, so questions cannot link to it "
            f"({len(ids)} item{'s' if len(ids) != 1 else ''}: {', '.join(ids)})"
        )
    return ValidatedLibrary(items=[item for _, item in kept], warnings=warnings)


# ------------------------------------------------------------- source notes

SOURCE_NOTE_KEYS: tuple[str, ...] = ("found", "action", "items")


def validate_source_notes(
    data: Any, item_ids: set[str] | frozenset[str], source: str = "source notes"
) -> list[dict[str, Any]]:
    """Validate notes about problems found on the source site (``pipeline/source_notes.yaml``).

    Each note is ``{found, action, items?}``: two non-empty texts and an optional
    list of library item ids, every one of which must exist. Returns the notes
    with white space tidied, keys in that order and ``items`` omitted when absent.
    An empty file means no notes.
    """
    if data is None:
        return []
    if not isinstance(data, list):
        raise ValidationFailed(source, [f"the file must contain a list of notes, got {type(data).__name__}"])
    problems: list[str] = []
    notes: list[dict[str, Any]] = []
    for position, entry in enumerate(data, start=1):
        label = f"note {position}"
        if not isinstance(entry, Mapping):
            problems.append(f"{label}: must be a mapping with found, action and optional items")
            continue
        entry_problems: list[str] = []
        unknown = sorted(str(k) for k in entry if k not in SOURCE_NOTE_KEYS)
        if unknown:
            entry_problems.append(f"{label}: unknown field{'s' if len(unknown) > 1 else ''} {', '.join(unknown)}")
        note: dict[str, Any] = {}
        for key in ("found", "action"):
            text = _clean_text(entry.get(key))
            if not text:
                entry_problems.append(f"{label}: {key} must be non-empty text")
            note[key] = text
        if "items" in entry:
            ids = entry["items"]
            if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
                entry_problems.append(f"{label}: items must be a non-empty list of item ids, got {ids!r}")
            else:
                missing = [i for i in ids if i not in item_ids]
                if missing:
                    entry_problems.append(
                        f"{label}: item{'s' if len(missing) > 1 else ''} not in the library: {', '.join(missing)}"
                    )
                note["items"] = list(ids)
        if entry_problems:
            problems.extend(entry_problems)
        else:
            notes.append(note)
    if problems:
        raise ValidationFailed(source, problems)
    return notes


# --------------------------------------------------------------------- gold


def validate_gold(data: Any, item_ids: set[str] | frozenset[str], source: str = "gold") -> list[GoldQuery]:
    """Validate gold questions against the library. Raises :class:`ValidationFailed`."""
    if not isinstance(data, list):
        raise ValidationFailed(source, [f"the file must contain a list of questions, got {type(data).__name__}"])
    problems: list[str] = []
    gold: list[GoldQuery] = []
    seen: dict[str, int] = {}
    for position, entry in enumerate(data, start=1):
        label = f"question {position}"
        if not isinstance(entry, Mapping):
            problems.append(f"{label}: must be an object, got {type(entry).__name__}")
            continue
        if isinstance(entry.get("id"), str) and entry["id"]:
            label = f'question {position} (id "{entry["id"]}")'
        entry_problems: list[str] = []
        missing = [k for k in GOLD_REQUIRED_KEYS if k not in entry]
        if missing:
            entry_problems.append(f"{label}: missing {', '.join(missing)}")
        unknown = sorted(str(k) for k in entry if k not in GOLD_REQUIRED_KEYS and k not in GOLD_OPTIONAL_KEYS)
        if unknown:
            entry_problems.append(f"{label}: unknown field{'s' if len(unknown) > 1 else ''} {', '.join(unknown)}")
        if missing:
            problems.extend(entry_problems)
            continue

        qid, query, relevant, note = entry["id"], entry["query"], entry["relevant"], entry.get("note")
        if not isinstance(qid, str) or not qid.strip():
            entry_problems.append(f"{label}: id must be non-empty text")
        elif qid in seen:
            entry_problems.append(f"{label}: duplicate id (first used by question {seen[qid]})")
        else:
            seen[qid] = position
        if not isinstance(query, str) or not query.strip():
            entry_problems.append(f"{label}: query must be non-empty text")
        if note is not None and not isinstance(note, str):
            entry_problems.append(f"{label}: note must be text")
        if not isinstance(relevant, Mapping):
            entry_problems.append(f"{label}: relevant must map item ids to 1 or 2")
        else:
            for item_id, grade in relevant.items():
                if item_id not in item_ids:
                    entry_problems.append(f"{label}: relevant item {item_id!r} is not in the library")
                if isinstance(grade, bool) or grade not in (1, 2):
                    entry_problems.append(f"{label}: relevance of {item_id!r} must be 1 or 2, got {grade!r}")
        if entry_problems:
            problems.extend(entry_problems)
            continue
        gold.append(GoldQuery(id=qid, query=query, relevant=dict(relevant), note=note))
    if problems:
        raise ValidationFailed(source, problems)
    return gold
