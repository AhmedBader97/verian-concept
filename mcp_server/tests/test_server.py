"""The MCP server, exercised through a real MCP client session."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest
from mcp import Client, StdioServerParameters

from mcp_server.server import Library, load_library
from pipeline.engine import REPO_ROOT, Filters, load_fixture_items, retrieve

pytestmark = pytest.mark.anyio

TOOLS = {"search_library", "get_item", "expand_topic", "list_topics"}


async def call(client: Client, tool: str, **arguments: Any) -> dict[str, Any]:
    result = await client.call_tool(tool, arguments)
    assert not result.is_error, result.content[0].text
    assert json.loads(result.content[0].text) == result.structured_content  # text mirrors the data
    return result.structured_content


async def error(client: Client, tool: str, **arguments: Any) -> str:
    result = await client.call_tool(tool, arguments)
    assert result.is_error
    return result.content[0].text


async def test_lists_the_four_read_only_tools(client: Client) -> None:
    listing = await client.list_tools()
    assert {t.name for t in listing.tools} == TOOLS
    for tool in listing.tools:
        assert tool.annotations is not None and tool.annotations.read_only_hint
        assert tool.annotations.destructive_hint is False
        assert tool.description
        assert tool.output_schema is not None
    search = next(t for t in listing.tools if t.name == "search_library")
    props = search.input_schema["properties"]
    assert search.input_schema["required"] == ["query"]
    assert (props["k"]["minimum"], props["k"]["maximum"], props["k"]["default"]) == (1, 10, 6)
    assert props["strategy"]["enum"] == ["keyword", "bm25", "graph", "hybrid", "agentic"]
    assert (props["query"]["minLength"], props["query"]["maxLength"]) == (3, 300)


async def test_search_returns_ranked_results(client: Client, library: Library) -> None:
    data = await call(client, "search_library", query="trust police Norway")
    assert data["strategy"] == "agentic"
    first = data["results"][0]
    assert first["id"] == "policing-trust"
    assert set(first) == {"id", "title", "kind", "date", "country", "url", "score", "why"}
    assert first["url"].startswith("https://www.veriangroup.com/")
    assert data["linked_entities"] == ["Crime & Justice", "Norway"]
    expected = retrieve(library.corpus, "agentic", "trust police Norway", k=6)
    assert [r["id"] for r in data["results"]] == expected.ids
    assert [r["score"] for r in data["results"]] == [h.score for h in expected.hits]


async def test_search_supports_every_strategy_and_reports_rewrites(client: Client) -> None:
    data = await call(client, "search_library", query="preparedniss index", strategy="agentic", k=2)
    assert data["results"][0]["id"] == "preparedness-index"
    assert data["rewrites"] == ["spelling: preparedniss → preparedness"]
    assert len(data["results"]) <= 2
    for strategy in ("keyword", "bm25", "graph"):
        assert (await call(client, "search_library", query="survey", strategy=strategy))["results"]


async def test_search_filters(client: Client, library: Library) -> None:
    by_kind = await call(client, "search_library", query="preparedness index", kinds=["Report"])
    assert by_kind["results"] and all(r["kind"] == "report" for r in by_kind["results"])
    by_country = await call(client, "search_library", query="survey trust", countries=["norwegian"])
    assert by_country["results"] and all(r["country"] == "Norway" for r in by_country["results"])
    recent = await call(client, "search_library", query="survey trust", since="2026-08-01", strategy="bm25")
    expected = retrieve(library.corpus, "bm25", "survey trust", k=6, filters=Filters(since="2026-08-01"))
    assert [r["id"] for r in recent["results"]] == expected.ids


@pytest.mark.parametrize(
    ("arguments", "message"),
    [
        ({"query": "hi"}, "query is too short"),
        ({"query": "x" * 301}, "the limit is 300"),
        ({"query": "trust", "k": 0}, "k must be between 1 and 10"),
        ({"query": "trust", "k": 11}, "k must be between 1 and 10"),
        ({"query": "trust", "strategy": "magic"}, "unknown strategy 'magic'"),
        ({"query": "trust", "kinds": ["podcast"]}, "unknown kind 'podcast'"),
        ({"query": "trust", "countries": ["Narnia"]}, "no items for country 'Narnia'"),
        ({"query": "trust", "since": "last week"}, "since must be an ISO date"),
        ({"query": "trust", "k": "many"}, "validation error"),
    ],
)
async def test_search_rejects_bad_input_with_a_helpful_error(
    client: Client, arguments: dict[str, Any], message: str
) -> None:
    assert message in await error(client, "search_library", **arguments)


async def test_get_item(client: Client) -> None:
    item = await call(client, "get_item", id="smoke-free")
    assert item["title"] == "Community and business engagement with smoke-free areas"
    assert item["topics"] == ["Public Health", "Behavioural & Communications"]
    assert item["summary"].startswith("Research on smoking")
    text = await error(client, "get_item", id="smoke-fre")
    assert "no item with id 'smoke-fre'" in text and "Did you mean 'smoke-free'" in text


async def test_expand_topic(client: Client) -> None:
    data = await call(client, "expand_topic", topic="youth and family")
    assert data == {
        "topic": "Youth and Family",
        "items": 2,
        "related": [{"topic": "Policy Development & Evaluation", "items": 1}],
    }
    via_alias = await call(client, "expand_topic", topic="policing")
    assert via_alias["topic"] == "Crime & Justice"
    assert "unknown topic 'Astrology'" in await error(client, "expand_topic", topic="Astrology")
    assert "format tag" in await error(client, "expand_topic", topic="News")


async def test_list_topics(client: Client) -> None:
    data = await call(client, "list_topics")
    assert data["total_items"] == 8
    topics = {t["topic"]: t["items"] for t in data["topics"]}
    assert topics["Youth and Family"] == 2
    assert topics["Policy Development & Evaluation"] == 2
    assert data["topics"][0]["items"] >= data["topics"][-1]["items"]
    countries = {c["country"]: c["items"] for c in data["countries"]}
    assert countries == {"Norway": 2, "Australia": 2, "Global": 2, "Spain": 1, "United Kingdom": 1}


async def test_unknown_tool_is_an_error(client: Client) -> None:
    assert "Unknown tool" in await error(client, "delete_everything")


async def test_runs_over_stdio_as_claude_desktop_would(tmp_path: Path) -> None:
    library_json = tmp_path / "library.json"
    library_json.write_text(json.dumps([it.to_dict() for it in load_fixture_items()]), encoding="utf-8")
    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "mcp_server.server"],
        cwd=str(REPO_ROOT),
        env={"VERIAN_LIBRARY_PATH": str(library_json)},
    )
    async with Client(params, mode="legacy") as session:
        assert session.server_info is not None and session.server_info.name == "verian-library"
        assert {t.name for t in (await session.list_tools()).tools} == TOOLS
        data = await call(session, "search_library", query="smoking near building entrances", strategy="bm25")
        assert data["results"][0]["id"] == "smoke-free"


def test_falls_back_to_fixtures_with_a_warning(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import mcp_server.server as server_module

    monkeypatch.delenv("VERIAN_LIBRARY_PATH", raising=False)
    monkeypatch.setattr(server_module, "DEFAULT_LIBRARY", tmp_path / "missing.json")
    library = load_library()
    assert library.corpus.N == 8
    assert "serving the synthetic test fixtures" in capsys.readouterr().err
    monkeypatch.setenv("VERIAN_LIBRARY_PATH", str(tmp_path / "also-missing.json"))
    with pytest.raises(SystemExit, match="library file not found"):
        load_library()
