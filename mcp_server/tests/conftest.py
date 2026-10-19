"""Fixtures: an MCP server over the shared test fixtures, and real client sessions to it."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from mcp import Client

from mcp_server.server import Library, create_server
from pipeline.engine import load_fixture_items


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
def library() -> Library:
    return Library.from_items(load_fixture_items(), source="fixtures")


@pytest.fixture(params=["legacy", "auto"])
async def client(request: pytest.FixtureRequest, library: Library) -> AsyncIterator[Client]:
    """A connected MCP client, in memory.

    "legacy" runs the JSON-RPC initialize handshake over in-memory streams (what
    stdio clients such as Claude Desktop do); "auto" uses the SDK's modern
    in-process path. Every test runs against both.
    """
    async with Client(create_server(library), mode=request.param) as session:
        yield session
