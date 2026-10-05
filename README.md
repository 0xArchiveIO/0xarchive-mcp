# 0xArchive MCP

Query Hyperliquid and Lighter market data from your agent. Get current and historical order books, trades, candles, funding, open interest, and data coverage through read-only market-data tools, and manage webhooks when you grant webhook access.

[Connect](#connect) · [Agents and clients](#agents-and-clients) · [Data](#what-you-can-query) · [Examples](#example-requests) · [Troubleshooting](#troubleshooting)

## Connect

**Server URL**

```text
https://mcp.0xarchive.io/mcp
```

Add the URL as a remote HTTP MCP server, then sign in with your 0xArchive account through the client's OAuth flow. Approve the `mcp:market.read` permission when prompted; approve `mcp:webhooks.read` and `mcp:webhooks.write` as well if you want the webhook tools. No 0xArchive API key or local MCP server installation is required.

Start with:

> Get a BTC market summary on Hyperliquid.

## Agents and clients

If you already have MCP servers configured, add 0xArchive without replacing the other entries.

<details open>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add --transport http 0xarchive https://mcp.0xarchive.io/mcp
```

In Claude Code, run `/mcp`, select `0xarchive`, and choose **Authenticate**. Complete the browser sign-in, then ask for a BTC market summary.

[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Claude web, Desktop, and Cowork</strong></summary>

1. Open **Customize → Connectors** in Claude.
2. Click **+ → Add custom connector**.
3. Name it `0xArchive` and enter `https://mcp.0xarchive.io/mcp`.
4. Add the connector, click **Connect**, and complete the OAuth sign-in.
5. Enable it from **+ → Connectors** in your conversation.

For Team and Enterprise workspaces, an owner first adds the connector in **Organization settings → Connectors**; each member then connects their own account.

[Claude custom connector guide](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)

</details>

<details>
<summary><strong>ChatGPT</strong></summary>

1. Enable **Developer mode** in **Settings → Security & Login**.
2. Open **Plugins** and use the **+** button to add an MCP connection.
3. Name it `0xArchive`, enter `https://mcp.0xarchive.io/mcp`, and complete OAuth authentication.
4. Start a new conversation and select the connection from **+ → More**.

[ChatGPT MCP connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)

</details>

<details>
<summary><strong>Codex CLI and IDE extension</strong></summary>

```bash
codex mcp add 0xarchive --url https://mcp.0xarchive.io/mcp
```

Complete the OAuth sign-in. To start authentication separately, run:

```bash
codex mcp login 0xarchive
```

The CLI and IDE extension share MCP configuration. Use `/mcp` in the Codex terminal interface to check the connection.

[Codex MCP documentation](https://developers.openai.com/codex/mcp/)

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add this entry to `.cursor/mcp.json` in your project. For a user-wide connection, use `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "0xarchive": {
      "url": "https://mcp.0xarchive.io/mcp"
    }
  }
}
```

Open Cursor's MCP settings, connect `0xarchive`, and complete the OAuth sign-in. Enable the server's tools for Agent.

[Cursor MCP documentation](https://cursor.com/docs/context/mcp)

</details>

<details>
<summary><strong>VS Code and GitHub Copilot</strong></summary>

Run **MCP: Add Server** from the Command Palette, choose an HTTP server, and enter `https://mcp.0xarchive.io/mcp`.

Or add it to `.vscode/mcp.json`:

```json
{
  "servers": {
    "0xarchive": {
      "type": "http",
      "url": "https://mcp.0xarchive.io/mcp"
    }
  }
}
```

Start the server and complete the browser OAuth flow. Use **MCP: List Servers** to check its status, then enable the tools you need in chat.

[VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

<details>
<summary><strong>Antigravity CLI and Gemini CLI</strong></summary>

**Antigravity CLI** is the current choice for personal Google accounts. Add this to `.agents/mcp_config.json` in your project:

```json
{
  "mcpServers": {
    "0xarchive": {
      "serverUrl": "https://mcp.0xarchive.io/mcp"
    }
  }
}
```

Open `/mcp` in Antigravity CLI to reload the configuration and check the server. Complete its OAuth authentication prompt. Use `serverUrl`, not Gemini CLI's `httpUrl` field.

**Gemini CLI** remains available with Gemini Code Assist Standard/Enterprise licenses or paid Google API access. From your project directory:

```bash
gemini mcp add --transport http 0xarchive https://mcp.0xarchive.io/mcp
```

Start Gemini and run:

```text
/mcp auth 0xarchive
```

Complete the browser OAuth flow. `/mcp` shows the server and its available tools.

[Antigravity MCP documentation](https://antigravity.google/docs/cli/mcp) · [Gemini CLI MCP documentation](https://geminicli.com/docs/tools/mcp-server/) · [Google client availability](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli)

</details>

<details>
<summary><strong>Grok web and Grok Build</strong></summary>

**Grok web**

1. Open [Grok Connectors](https://grok.com/connectors).
2. Choose **New Connector → Custom**.
3. Enter `https://mcp.0xarchive.io/mcp` and complete the OAuth sign-in.
4. Ask for 0xArchive market data in your conversation.

For Business and Enterprise organizations, a team admin first provisions the connector.

**Grok Build**

```bash
grok mcp add --transport http 0xarchive https://mcp.0xarchive.io/mcp
```

Grok starts the OAuth flow when the server is first used. In the terminal interface, `/mcps` opens the MCP settings; `i` starts authentication for the selected server.

[Grok connectors](https://docs.x.ai/grok/connectors) · [Grok Build MCP documentation](https://docs.x.ai/build/features/mcp-servers)

</details>

<details>
<summary><strong>Hermes Agent</strong></summary>

```bash
hermes mcp add --url https://mcp.0xarchive.io/mcp --auth oauth 0xarchive
```

Authenticate with your 0xArchive account:

```bash
hermes mcp login 0xarchive
```

Run `hermes mcp test 0xarchive` to check the connection. If prompted to choose tools, enable the markets and data you need.

[Hermes MCP documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)

</details>

<details>
<summary><strong>OpenClaw</strong></summary>

Add the remote server with OAuth:

```bash
openclaw mcp set 0xarchive '{
  "url": "https://mcp.0xarchive.io/mcp",
  "transport": "streamable-http",
  "auth": "oauth",
  "oauth": {"scope": "mcp:market.read"}
}'
```

Then sign in:

```bash
openclaw mcp login 0xarchive
```

Run `openclaw mcp doctor 0xarchive --probe` to check the connection. Use OpenClaw's MCP tool controls to choose which agents or sessions can use it.

[OpenClaw MCP guide](https://docs.openclaw.ai/tools/mcp) · [OAuth setup](https://docs.openclaw.ai/cli/mcp/transports)

</details>

<details>
<summary><strong>OpenCode</strong></summary>

Add this entry to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "0xarchive": {
      "type": "remote",
      "url": "https://mcp.0xarchive.io/mcp",
      "enabled": true
    }
  }
}
```

Authenticate:

```bash
opencode mcp auth 0xarchive
```

Complete the browser sign-in. `opencode mcp list` shows the authentication status.

[OpenCode MCP documentation](https://opencode.ai/docs/mcp-servers/)

</details>

<details>
<summary><strong>Windsurf and Devin</strong></summary>

**Devin Local and Devin CLI**

Devin Local, the default agent for new editor tabs, uses the Devin MCP configuration. From your project directory:

```bash
devin mcp add 0xarchive https://mcp.0xarchive.io/mcp
```

Then authenticate:

```bash
devin mcp login 0xarchive
```

**Cascade**

If you use Cascade, add this to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "0xarchive": {
      "serverUrl": "https://mcp.0xarchive.io/mcp"
    }
  }
}
```

Open Cascade's MCP settings, enable the server, and complete its OAuth sign-in. Select the tools you need if you reach the client's tool limit. Sign in separately in each client you use.

[Devin MCP configuration](https://docs.devin.ai/cli/extensibility/mcp/configuration) · [Windsurf/Cascade MCP settings](https://docs.windsurf.com/windsurf/cascade/mcp)

</details>

<details>
<summary><strong>Cline</strong></summary>

1. Open Cline's **MCP Servers** panel and the **Remote Servers** tab.
2. Enter `0xarchive` as the name and `https://mcp.0xarchive.io/mcp` as the URL.
3. Choose **Streamable HTTP** and click **Add Server**.
4. Click **Authenticate** when the server requests OAuth, then finish the browser sign-in.

If **Authenticate** is missing, update Cline before connecting.

[Cline MCP documentation](https://docs.cline.bot/mcp/mcp-overview)

</details>

### Other MCP clients

Use the same server URL with a client that supports **Streamable HTTP and OAuth**. Let the client discover the authorization server and complete sign-in. Do not substitute an API key or a manually pasted bearer token.

For custom integrations, the server publishes [OAuth resource metadata](https://mcp.0xarchive.io/.well-known/oauth-protected-resource). See the [MCP authorization specification](https://modelcontextprotocol.io/specification/latest/basic/authorization) for the client flow.

## What you can query

- **Hyperliquid core perps:** market summaries, prices, trades, candles, CVD, funding, open interest, liquidations, L2 and L4 order books, order history, order flow, trigger orders, market breadth, and wallet classification.
- **Hyperliquid Spot:** pair discovery, trades, candles, order books, L4 snapshots and diffs, order history, TWAP records, and freshness.
- **HIP-3 builder perps:** market discovery and summaries, trades, candles, CVD, funding, open interest, liquidations, L2 and L4 books, orders, market breadth, oracle external prices and discovery bounds, and wallet classification. Builder-prefixed symbols such as `xyz:SP500` identify the market.
- **HIP-4 outcome markets:** instruments, outcomes and questions, prices, candles, trades, open interest, order history, and L2 and L4 books.
- **Lighter (mainnet and Robinhood Chain):** market discovery and summaries, trades, candles, funding, open interest, liquidations, and order books; L3 order books on mainnet.
- **Account positions:** current and historical positions, position changes, and account summaries by Hyperliquid wallet or Lighter account index, plus per-market position listings.
- **Webhooks:** endpoints, subscriptions, estimate and dry-run previews, watched wallets, and the delivery log, when your client connects with webhook access.

Hyperliquid core and HIP-3 also expose projected forced-liquidation price levels and trigger-price levels. Data-quality tools provide coverage, freshness (including account positions), incident, latency, and status information.

Examples include `get_summary`, `get_hip3_instruments`, `get_spot_pairs`, `get_hip4_outcomes`, `get_lighter_l3_orderbook`, and `get_symbol_coverage`. Your client discovers the available tools and their input schemas when it connects.

[Venue and dataset coverage](https://docs.0xarchive.io/venue-coverage) · [MCP tool examples](https://docs.0xarchive.io/mcp-server) · [Data quality](https://docs.0xarchive.io/data-quality)

## Example requests

**Market summary**
> Get a BTC market summary on Hyperliquid. Include the source timestamp.

**Funding across venues**
> Fetch current BTC funding separately for Hyperliquid and Lighter. Show each source's units and timestamp before comparing the values.

**Historical candles**
> Fetch ETH one-hour Hyperliquid candles for the last 24 hours. Summarize the price range and trading volume.

**Builder markets**
> Find the HIP-3 market `xyz:SP500` and get its current summary and order book.

**Spot markets**
> Find Hyperliquid Spot pairs for HYPE, then fetch recent trades for the matching pair.

**Outcome markets**
> List unsettled HIP-4 outcomes. Show the question and current price for one of them.

**Order-level data**
> Fetch the current BTC L3 order book on Lighter and show the top bids and asks.

**Historical coverage**
> Check BTC coverage on Hyperliquid for the last 24 hours and list any recorded data incidents in that window.

## Working with historical data

Specify the venue, market, and UTC interval. For longer histories, use smaller windows and follow pagination when a cursor is returned. If a response is too large, narrow the request rather than treating the returned portion as the complete dataset.

Keep timestamps and source units with the values, especially when comparing funding across venues. Use market discovery to resolve symbols, and coverage tools to find available history.

For bulk Parquet files, use the [Data Catalog](https://docs.0xarchive.io/data-catalog). For continuous market-data streams, use the [WebSocket API](https://docs.0xarchive.io/websocket).

## Account and access

Sign in with your 0xArchive account. Data access and usage limits follow your [0xArchive plan](https://0xarchive.io/pricing); your AI client's own subscription and custom-connector permissions are separate.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| The client opens documentation or reports an invalid server response | Use the full URL `https://mcp.0xarchive.io/mcp`, including `/mcp`, and choose HTTP rather than stdio. |
| Sign-in fails or the server returns `401` | Reconnect through the client's OAuth flow. Remove manually configured API-key or authorization headers. |
| The client says 0xArchive already exists | Edit or reconnect the existing server entry instead of adding a duplicate. |
| The connection succeeds but tools are unavailable | Check the client's MCP enablement and tool selection, then refresh or restart it after configuration changes. |
| A market is not found | Use the relevant instrument, Spot-pair, or outcome discovery tool. Preserve builder prefixes and symbol case. |
| A historical request is empty or rejected | Check the market's recorded coverage and your plan's history window. |
| A request times out or returns too much data | Shorten the interval, reduce the requested page size where available, or use a Parquet export for a bulk dataset. |
| Requests are rate-limited | Allow the retry interval to pass and check your plan's usage limits before retrying. |

## Help

- [MCP setup and reference](https://docs.0xarchive.io/mcp-server)
- [Service status](https://0xarchive.io/status)
- [Report a connection or documentation issue](https://github.com/0xArchiveIO/0xarchive-mcp/issues)
- [Contact 0xArchive](https://0xarchive.io/contact)

Keep access tokens, API keys, and private account information out of prompts and public issues.
