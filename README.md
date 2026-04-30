# 0xArchive MCP Server

<a href="https://glama.ai/mcp/servers/@0xArchiveIO/0xarchive-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@0xArchiveIO/0xarchive-mcp/badge" />
</a>

Typed 0xArchive market data tools for MCP-capable clients.

0xArchive is granular market data infrastructure for Hyperliquid and Lighter.xyz. HIP-3 builder perps live under the Hyperliquid namespace. This server exposes 79 typed tools for order books, trades, candles, funding, open interest, liquidations, L4/L3 order-level data, data quality, and wallet-managed auth.

Use MCP when you want typed tools or shared client config across any client that supports MCP, including Claude Code, Claude Desktop, Cursor, Codex CLI or IDE setups with MCP enabled, and other agent clients. Claude Code and GPT Codex are equal first-class coding-agent paths: use this server wherever MCP is available, and use the same API key with the CLI, SDKs, skills, `llms.txt`, OpenAPI, and markdown docs wherever shell, repo, or file context is the better route.

## First Tool Result

This repository currently builds the MCP server from source. A published-package install path is blocked until the package dependency cleanup from public PR #6 is verified and released.

```bash
git clone https://github.com/0xArchiveIO/0xarchive-mcp.git
cd 0xarchive-mcp
npm install
npm run build

export OXARCHIVE_API_KEY="0xa_your_api_key"

# Claude Code command mechanics
claude mcp add 0xarchive -s user -t stdio \
  -e OXARCHIVE_API_KEY="$OXARCHIVE_API_KEY" \
  -- node "$(pwd)/build/index.js"
```

The `claude mcp add` line is a Claude Code setup mechanic. Codex CLI or IDE users with MCP enabled should register the same stdio command in their Codex MCP config: `node /absolute/path/to/0xarchive-mcp/build/index.js`. Ask one narrow question first:

> What's BTC's current funding rate?

Expected result: the client invokes a concrete 0xArchive MCP tool and returns live venue data or a direct auth/configuration error.

## Agent Integration Requirements

| Agent surface | Requirement | Setup mechanic |
| --- | --- | --- |
| Claude Code | Claude Code MCP support and a local Node build | `claude mcp add ... -- node /absolute/path/to/build/index.js` |
| Claude Desktop | Desktop MCP JSON config | Add the stdio server to `claude_desktop_config.json` |
| GPT Codex | Codex CLI or IDE extension with MCP enabled | Configure Codex MCP to run the same stdio command; if MCP is unavailable, use the CLI, SDKs, skills, `llms.txt`, OpenAPI, or markdown docs |
| Other MCP clients | Local stdio MCP support | Run `node /absolute/path/to/0xarchive-mcp/build/index.js` with `OXARCHIVE_API_KEY` in the environment |

## Choose This Or Another Agent Path

| Need | Best first path |
| --- | --- |
| Typed tools or shared MCP config | This MCP server |
| Fast local agent setup | [AI Clients guide](https://www.0xarchive.io/docs/ai-clients) |
| Claude Code, GPT Codex, or other shell-first coding-agent work | [CLI](https://www.0xarchive.io/docs/cli) |
| Direct SDK integration | [SDK docs](https://www.0xarchive.io/docs/sdks) |
| File-based historical pulls | [Data Catalog](https://www.0xarchive.io/data) |
| Machine-readable context | [llms.txt](https://www.0xarchive.io/llms.txt), [OpenAPI](https://www.0xarchive.io/openapi.json) |

## Usage Examples

| Prompt | Tool that fires |
|---------------|-----------------|
| "Give me a BTC market summary" | `get_summary` |
| "Show ETH 4h candles for the past week" | `get_candles` |
| "What's the current funding rate for SOL?" | `get_funding_current` |
| "Compare BTC funding on Hyperliquid vs Lighter" | `get_funding_current` + `get_lighter_funding_current` |
| "Show me SOL liquidations in the last 24 hours" | `get_liquidations` |
| "Get BTC orderbook with 20 levels" | `get_orderbook` |
| "Any data incidents this month?" | `get_data_incidents` |
| "What's the km:US500 price on HIP-3?" | `get_hip3_summary` |
| "Show me the SLA report for January 2026" | `get_data_sla` |

## Setup

### 1. Install & Build

```bash
git clone https://github.com/0xArchiveIO/0xarchive-mcp.git
cd 0xarchive-mcp
npm install
npm run build
```

### 2. Get an API Key

Create an account at [0xArchive signup](https://www.0xarchive.io/signup), generate an API key, and set `OXARCHIVE_API_KEY`. Or use the `web3_challenge` and `web3_signup` tools to get a free API key with just an Ethereum wallet — no browser needed.

### 3. Add to an MCP client

Claude Code command mechanics:

```bash
claude mcp add 0xarchive -s user -t stdio -e OXARCHIVE_API_KEY=0xa_your_api_key -- node /absolute/path/to/0xarchive-mcp/build/index.js
```

### 4. Add to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "0xarchive": {
      "command": "node",
      "args": ["/absolute/path/to/0xarchive-mcp/build/index.js"],
      "env": {
        "OXARCHIVE_API_KEY": "0xa_your_api_key"
      }
    }
  }
}
```

For GPT Codex and other agent workflows, use this same stdio server command wherever your client supports local MCP servers. If MCP is not available there, route the same API key through the CLI, SDKs, skills, markdown docs, `llms.txt`, or OpenAPI. The acquisition path is shared: make one authenticated request, then expand into replay, SDKs, Data Catalog exports, or agent tooling.

## Available Tools (79)

### Hyperliquid

| Tool | Description |
|------|-------------|
| `get_instruments` | List all Hyperliquid perp/spot instruments |
| `get_instrument` | Get a single Hyperliquid instrument by coin |
| `get_orderbook` | Current L2 orderbook snapshot |
| `get_orderbook_history` | Historical orderbook snapshots |
| `get_trades` | Trade/fill history |
| `get_candles` | OHLCV candle data |
| `get_funding_current` | Current funding rate |
| `get_funding_history` | Funding rate history |
| `get_open_interest` | Current open interest |
| `get_open_interest_history` | Open interest history |
| `get_liquidations` | Liquidation history |
| `get_liquidations_by_user` | Liquidations for a specific user address |
| `get_liquidation_volume` | Aggregated liquidation volume (USD buckets) |
| `get_freshness` | Per-coin data freshness and lag |
| `get_summary` | Combined market summary (price, funding, OI, volume, liquidations) |
| `get_price_history` | Mark/oracle/mid price history |

### Hyperliquid L4 (Order-Level)

| Tool | Description |
|------|-------------|
| `get_order_history` | Order history with user attribution (Build+ tier) |
| `get_order_flow` | Aggregated order placement, cancellation, and fill metrics (Build+ tier) |
| `get_tpsl` | TP/SL order history with trigger prices and triggered status (Pro+ tier) |
| `get_l4_orderbook` | L4 orderbook reconstruction at a specific timestamp (Pro+ tier) |
| `get_l4_diffs` | Raw order-level changes (new, modified, cancelled, filled) over a time range (Pro+ tier) |
| `get_l4_orderbook_history` | Periodic full order-level orderbook checkpoints (Pro+ tier) |

### Hyperliquid L2 (Full-Depth)

| Tool | Description |
|------|-------------|
| `get_l2_orderbook` | L2 full-depth orderbook derived from L4 (Build+ tier) |
| `get_l2_orderbook_history` | Historical L2 full-depth orderbook snapshots (Build+ tier) |
| `get_l2_diffs` | L2 tick-level diffs (Pro+ tier) |

### HIP-3 (Builder Perps)

| Tool | Description |
|------|-------------|
| `get_hip3_instruments` | List HIP-3 instruments |
| `get_hip3_instrument` | Get a single HIP-3 instrument by coin |
| `get_hip3_orderbook` | Current HIP-3 orderbook |
| `get_hip3_orderbook_history` | Historical HIP-3 orderbook snapshots |
| `get_hip3_trades` | HIP-3 trade history |
| `get_hip3_trades_recent` | Most recent HIP-3 trades |
| `get_hip3_candles` | HIP-3 candle data |
| `get_hip3_funding_current` | Current HIP-3 funding rate |
| `get_hip3_funding` | HIP-3 funding history |
| `get_hip3_open_interest` | Current HIP-3 open interest |
| `get_hip3_open_interest_history` | HIP-3 open interest history |
| `get_hip3_liquidations` | HIP-3 liquidation events (Feb 2026+) |
| `get_hip3_liquidation_volume` | Aggregated HIP-3 liquidation volume (USD buckets, Feb 2026+) |
| `get_hip3_freshness` | Per-coin HIP-3 data freshness and lag |
| `get_hip3_summary` | Combined HIP-3 market summary |
| `get_hip3_price_history` | HIP-3 mark/oracle/mid price history |

### HIP-3 L4 (Order-Level)

| Tool | Description |
|------|-------------|
| `get_hip3_order_history` | HIP-3 order history with user attribution (Build+ tier) |
| `get_hip3_order_flow` | Aggregated HIP-3 order placement, cancellation, and fill metrics (Build+ tier) |
| `get_hip3_tpsl` | HIP-3 TP/SL order history with trigger prices and triggered status (Pro+ tier) |
| `get_hip3_l4_orderbook` | HIP-3 L4 orderbook reconstruction at a specific timestamp (Pro+ tier) |
| `get_hip3_l4_diffs` | HIP-3 raw order-level changes over a time range (Pro+ tier) |
| `get_hip3_l4_orderbook_history` | HIP-3 periodic full order-level orderbook checkpoints (Pro+ tier) |

### HIP-3 L2 (Full-Depth)

| Tool | Description |
|------|-------------|
| `get_hip3_l2_orderbook` | HIP-3 L2 full-depth orderbook derived from L4 (Build+ tier) |
| `get_hip3_l2_orderbook_history` | HIP-3 L2 full-depth orderbook history (Build+ tier) |
| `get_hip3_l2_diffs` | HIP-3 L2 tick-level diffs (Pro+ tier) |

### Lighter.xyz

| Tool | Description |
|------|-------------|
| `get_lighter_instruments` | List Lighter instruments |
| `get_lighter_instrument` | Get a single Lighter instrument by coin |
| `get_lighter_orderbook` | Current Lighter orderbook |
| `get_lighter_orderbook_history` | Historical Lighter orderbook snapshots |
| `get_lighter_trades` | Lighter trade history |
| `get_lighter_trades_recent` | Most recent Lighter trades |
| `get_lighter_candles` | Lighter candle data |
| `get_lighter_funding_current` | Current Lighter funding rate |
| `get_lighter_funding` | Lighter funding history |
| `get_lighter_open_interest` | Current Lighter open interest |
| `get_lighter_open_interest_history` | Lighter open interest history |
| `get_lighter_freshness` | Per-coin Lighter data freshness and lag |
| `get_lighter_summary` | Combined Lighter market summary |
| `get_lighter_price_history` | Lighter mark/oracle/mid price history |

### Lighter L3 (Order-Level)

| Tool | Description |
|------|-------------|
| `get_lighter_l3_orderbook` | Current L3 order-level orderbook with order IDs and user addresses (Pro+ tier) |
| `get_lighter_l3_orderbook_history` | Historical L3 orderbook snapshots with individual orders (Pro+ tier) |

### Data Quality

| Tool | Description |
|------|-------------|
| `get_data_quality_status` | System health across venue APIs |
| `get_data_coverage` | Data coverage (earliest/latest, records, completeness) |
| `get_exchange_coverage` | Coverage for a specific exchange |
| `get_symbol_coverage` | Per-symbol coverage with gap detection |
| `get_data_incidents` | Outage and degradation history |
| `get_incident` | Single incident details by ID |
| `get_data_latency` | WebSocket/REST latency and data freshness |
| `get_data_sla` | Monthly SLA compliance report |

### Web3 Authentication

| Tool | Description |
|------|-------------|
| `web3_challenge` | Get a SIWE challenge message for a wallet address |
| `web3_signup` | Create a free-tier account and API key with a signed SIWE message |
| `web3_list_keys` | List all API keys for a wallet |
| `web3_revoke_key` | Revoke a specific API key |
| `web3_subscribe` | Subscribe to a paid tier (build/pro) via x402 USDC payment on Base |

**Free-tier flow:** `web3_challenge` (get SIWE message) → sign with `personal_sign` (EIP-191) → `web3_signup` (submit signature) → receive API key.

**Paid-tier flow (x402):** `web3_subscribe` with tier → returns 402 with pricing → sign USDC transfer (EIP-3009 on Base) → `web3_subscribe` again with `payment_signature` → receive API key + subscription.

## Pricing Tiers

Some endpoints require a paid plan. The server returns clear error messages with upgrade guidance when tier limits are hit.

| Tier | Price | Access |
|------|-------|--------|
| Free | $0/mo | BTC-only historical data |
| Build | $49/mo | All coins, REST API, 25 WS subs |
| Pro | $199/mo | Full orderbook depth, 100 WS subs |
| Enterprise | Custom | Tick data, 200 WS subs |

Upgrade at [0xarchive.io/pricing](https://0xarchive.io/pricing).

## Tool Annotations

All 79 tools carry MCP annotations so clients can reason about safety and retry behavior.

**Market data tools (74):**

| Annotation | Value | Meaning |
|------------|-------|---------|
| `readOnlyHint` | `true` | Tools never modify data |
| `destructiveHint` | `false` | No destructive side effects |
| `idempotentHint` | `true` | Safe to retry on failure |
| `openWorldHint` | `true` | Queries an external API |

**Web3 tools (5):** `readOnlyHint: false`, `idempotentHint: false` — these create accounts, keys, and subscriptions.

All tools also declare an `outputSchema` so clients can validate structured responses.

## Smart Defaults

- **Time range**: Defaults to last 24 hours if not specified
- **Limit**: Defaults to 100 records
- **Interval**: Defaults to 1h for candles
- **Pagination**: Returns cursor for next page when more data available
- **Timestamps**: Accepts both Unix milliseconds and ISO 8601 strings

## Data Catalog

For large-scale data exports (full order books, complete trade history, etc.), use the [Data Catalog](https://www.0xarchive.io/data). It lets you choose markets, datasets, and date ranges, see a live quote, and export zstd-compressed Parquet. MCP tools are best for typed point queries and moderate data pulls; the Data Catalog is the file-export path.
