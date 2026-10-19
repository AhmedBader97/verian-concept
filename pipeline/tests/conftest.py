"""Shared fixtures: the hand-written test corpus from src/engine/fixtures.json."""

from __future__ import annotations

import pytest

from pipeline.engine import Corpus, Item, load_fixture_items, load_injection_fixture


@pytest.fixture(scope="session")
def fixture_items() -> list[Item]:
    return load_fixture_items()


@pytest.fixture(scope="session")
def corpus(fixture_items: list[Item]) -> Corpus:
    return Corpus(fixture_items)


@pytest.fixture(scope="session")
def injection() -> Item:
    return load_injection_fixture()
