# verian-library MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an MCP client
such as Claude Desktop search what Verian has published on veriangroup.com: case studies,
insights, news, events, webinars and reports.

- **Read-only.** Four tools that only read the local library. All are annotated
  `readOnlyHint: true`. Nothing is written, and the server makes no network calls.
- **Same engine as the website.** Retrieval runs on the Python reference engine
  (`pipeline/engine.py`), which reproduces the site's TypeScript engine exactly: for the
  same question, design and filters, both return the same items in the same order. The
  site's agent then adds its own steps (a relevance filter and a citation check), so its
  final brief can cite fewer items than the search returns.
- **Grounded.** Every result carries its veriangroup.com URL and the reasons it matched.
  The server's instructions tell the model to cite those URLs, to treat tool output as
  data rather than instructions, and to say so when nothing relevant comes back.

## Run it

From the repository root:

```sh
pip install --break-system-packages "mcp>=2.2,<3" PyYAML   # or: pip install -e .
python3 -m pipeline.build        # builds src/data/library.json from pipeline/library.yaml
python3 -m mcp_server.server     # serves over stdio until the client disconnects
```

The server reads `src/data/library.json`, or the file named by `VERIAN_LIBRARY_PATH`. If
the default file is missing, it serves the engine's synthetic test fixtures
(`src/engine/fixtures.json`) and prints a warning on stderr. stdout carries only the MCP
protocol.

## Use it from Claude Desktop

Add the server to `claude_desktop_config.json`, then restart Claude Desktop. The file is at
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS and at
`%APPDATA%\Claude\claude_desktop_config.json` on Windows.

```json
{
  "mcpServers": {
    "verian-library": {
      "command": "/usr/bin/python3",
      "args": ["-m", "mcp_server.server"],
      "env": {
        "PYTHONPATH": "/absolute/path/to/verian-concept"
      }
    }
  }
}
```

Use absolute paths. Set `command` to the output of `which python3`, and point `PYTHONPATH`
at the repository so that `-m mcp_server.server` resolves. To serve a different build of the
library, add `"VERIAN_LIBRARY_PATH": "/absolute/path/to/library.json"` to `env`.

## Tools

| Tool | Arguments | Returns |
| --- | --- | --- |
| `search_library` | `query` (3–300 characters); `strategy`: `keyword`, `bm25`, `graph`, `hybrid` or `agentic` (default); `k` 1–10 (default 6); optional `kinds`, `countries` and `since` (`yyyy-mm-dd`) filters | Ranked `results`, each with `id`, `title`, `kind`, `date`, `country`, `url`, `score` and `why`. Also the topics and countries linked from the query, any query rewrites (spelling fixes, splits, retries), and the number of searches made |
| `get_item` | `id` from a search result | The full item: title, kind, date, URL, topics, country, summary and how the summary was written (`summary_basis`) |
| `expand_topic` | `topic`, matched without regard to case, or by a lexicon alias such as "policing" | Topics most often tagged on the same items (top 5), with item counts |
| `list_topics` | none | Every subject topic and every country in the library, with item counts. Use these values for the `countries` filter |

The strategies are the five designs compared on the site's AI Lab page. `keyword` counts shared
words. `bm25` is lexical ranking with field boosts. `graph` links topics and countries in the
question and spreads relevance over a topic graph with personalised PageRank. `hybrid` fuses
`bm25` and `graph` by reciprocal rank. `agentic` fixes spelling, splits comparisons, and
retries weak searches with the topic graph.

Invalid input comes back as an MCP tool error (`isError: true`) that says what to change, for example
`k must be between 1 and 10 (got 11).` or
`no item with id 'smoke-fre'. Did you mean 'smoke-free'?`. Kinds and countries are matched
without regard to case, and countries also by alias: `uk` and `norwegian` both work.

## Tests

```sh
python3 -m pytest -q mcp_server/tests
```

The tests drive the server through real MCP client sessions. Each one runs twice in memory:
once with the JSON-RPC `initialize` handshake that stdio clients such as Claude Desktop use,
and once on the SDK's newer in-process path. One more test starts `python3 -m
mcp_server.server` as a subprocess and talks to it over stdio.

Built on the official Python SDK, `mcp` 2.x, where FastMCP is called `MCPServer`
(`mcp.server.mcpserver`).
