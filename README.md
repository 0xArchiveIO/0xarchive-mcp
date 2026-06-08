# 0xArchive MCP Server

<a href="https://glama.ai/mcp/servers/@0xArchiveIO/0xarchive-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@0xArchiveIO/0xarchive-mcp/badge" />
</a>

Typed 0xArchive market data tools for MCP-capable clients.

> **Recommended:** Use the hosted MCP at <https://mcp.0xarchive.io> for most setups (zero install, OAuth, always current). This repository is the self-hosted package. Reach for it when you need stdio transport (Claude Desktop, certain IDE plugins), run in an air-gapped environment, or have compliance requirements that prevent a hosted intermediary.

0xArchive is granular market data infrastructure for Hyperliquid and Lighter.xyz. Hyperliquid includes core perps, HIP-3 builder perps, HIP-4 outcome markets, and Hyperliquid Spot; Lighter.xyz is the second top-level venue API. This server exposes 111 typed tools for order books, trades, candles, funding, open interest, liquidations, L4/L3 order-level data, outcome markets, spot pairs, TWAP statuses, data quality, and wallet-managed auth.

Use MCP when you want typed tools or shared client config across any client that supports MCP, including Claude Code, Claude Desktop, Cursor, ChatGPT Codex setups with MCP enabled, and other agent clients. Claude Code and ChatGPT Codex are equal first-class coding-agent paths: use this server wherever MCP is available, and use the same API key with the CLI, SDKs, skills, `llms.txt`, OpenAPI, and markdown docs wherever shell, repo, or file context is the better route.

## First Tool Result

Install the MCP server package in the project or agent workspace where the MCP client will run:

```bash
npm install @0xarchive/mcp-server

export OXARCHIVE_API_KEY="0xa_your_api_key"

# Claude Code command mechanics
claude mcp add 0xarchive -s user -t stdio \
  -e OXARCHIVE_API_KEY="$OXARCHIVE_API_KEY" \
  -- npx -y @0xarchive/mcp-server
```

The `claude mcp add` line is a Claude Code setup mechanic. ChatGPT Codex users with MCP enabled should register the same stdio command in their Codex MCP config: `npx -y @0xarchive/mcp-server`. Ask one narrow question first:

> What's BTC's current funding rate?

Expected result: the client invokes a concrete 0xArchive MCP tool and returns live venue data or a direct auth/configuration error.

## Agent Integration Requirements

| Agent surface | Requirement | Setup mechanic |
| --- | --- | --- |
| Claude Code | Claude Code MCP support and Node 18+ | `claude mcp add ... -- npx -y @0xarchive/mcp-server` |
| Claude Desktop | Desktop MCP JSON config | Add the stdio server to `claude_desktop_config.json` (command: `npx`, args: `["-y", "@0xarchive/mcp-server"]`) |
| ChatGPT Codex | ChatGPT Codex with MCP enabled | Configure Codex MCP to run the same `npx -y @0xarchive/mcp-server` stdio command; if MCP is unavailable, use the CLI, SDKs, skills, `llms.txt`, OpenAPI, or markdown docs |
| Other MCP clients | Local stdio MCP support | Run `npx -y @0xarchive/mcp-server` with `OXARCHIVE_API_KEY` in the environment |

## Choose This Or Another Agent Path

| Need | Best first path |
| --- | --- |
| Typed tools or shared MCP config | This MCP server |
| Fast local agent setup | [AI Clients guide](https://www.0xarchive.io/docs/ai-clients) |
| Claude Code, ChatGPT Codex, or other shell-first coding-agent work | [CLI](https://www.0xarchive.io/docs/cli) |
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
| "List active HIP-4 outcome markets" | `get_hip4_outcomes` |
| "Show me the SLA report for January 2026" | `get_data_sla` |

## Setup

### 1. Install

```bash
npm install @0xarchive/mcp-server
```

### 2. Get an API Key

Create an account at [0xArchive signup](https://www.0xarchive.io/signup), generate an API key, and set `OXARCHIVE_API_KEY`. Or use the `web3_challenge` and `web3_signup` tools to get a free API key with just an Ethereum wallet, no browser needed.

### 3. Add to an MCP client

Claude Code command mechanics:

```bash
claude mcp add 0xarchive -s user -t stdio \
  -e OXARCHIVE_API_KEY=0xa_your_api_key \
  -- npx -y @0xarchive/mcp-server
```

### 4. Add to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "0xarchive": {
      "command": "npx",
      "args": ["-y", "@0xarchive/mcp-server"],
      "env": {
        "OXARCHIVE_API_KEY": "0xa_your_api_key"
      }
    }
  }
}
```

For ChatGPT Codex and other agent workflows, use this same stdio server command wherever your client supports local MCP servers. If MCP is not available there, route the same API key through the CLI, SDKs, skills, markdown docs, `llms.txt`, or OpenAPI. The acquisition path is shared: make one authenticated request, then expand into replay, SDKs, Data Catalog exports, or agent tooling.

## Available Tools (111)

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

### HIP-4 (Outcome Markets)

HIP-4 coins use the bare numeric format `<10*outcome_id + side>` (e.g. `0` for outcome 0 Yes, `1` for outcome 0 No). Legacy `#0` / `%230` forms are still accepted. `mark_price` for HIP-4 is an implied probability in [0,1], not a USD price. HIP-4 has no funding, no liquidations, and no candles by design. Listen for the WebSocket `outcome_settled` event to be notified when an outcome resolves.

| Tool | Description |
|------|-------------|
| `get_hip4_instruments` | List HIP-4 outcome-market instruments (one row per side) |
| `get_hip4_instrument` | Get a single HIP-4 instrument by coin (e.g. `0`) |
| `get_hip4_outcomes` | List HIP-4 outcomes (filter `is_settled` optional) |
| `get_hip4_outcome` | Single outcome detail including `aggregated_oi` |
| `get_hip4_orderbook` | Current HIP-4 L2 orderbook (Pro+ tier) |
| `get_hip4_orderbook_history` | Historical HIP-4 L2 orderbook snapshots (Pro+ tier) |
| `get_hip4_trades` | HIP-4 trade history |
| `get_hip4_trades_recent` | Most recent HIP-4 trades |
| `get_hip4_open_interest` | HIP-4 per-side open interest history |
| `get_hip4_open_interest_current` | Current HIP-4 per-side open interest |
| `get_hip4_freshness` | Per-coin HIP-4 data freshness and lag |
| `get_hip4_summary` | Combined HIP-4 24h summary (probability, volume, OI) |
| `get_hip4_prices` | HIP-4 mid-price (implied probability) history |
| `get_hip4_order_history` | HIP-4 order lifecycle events (Pro+ tier) |
| `get_hip4_order_flow` | HIP-4 aggregated order placement/cancel/fill metrics (Pro+ tier) |
| `get_hip4_tpsl` | HIP-4 TP/SL order history (Pro+ tier) |
| `get_hip4_l4_orderbook` | HIP-4 L4 orderbook reconstruction (Pro+ tier) |
| `get_hip4_l4_diffs` | HIP-4 raw order-level changes over a time range (Pro+ tier) |
| `get_hip4_l4_orderbook_history` | HIP-4 periodic L4 orderbook checkpoints (Build+ tier) |

### Hyperliquid Spot

Spot pairs use dashed canonical symbols (e.g. `HYPE-USDC`, `PURR-USDC`); the server resolves to Hyperliquid's wire format (`PURR/USDC`, `@107`) internally. 294 pairs covered. Spot has no funding, no open interest, no liquidations, and no candles by design (those are perp-only constructs). Coverage: trades from 2025-03-22 (HL S3 backfill); orderbook, L4, and TWAP statuses live from 2026-05-05.

| Tool | Description |
|------|-------------|
| `get_spot_pairs` | List all 294 spot pairs with metadata (base/quote, wire symbol, decimals, latest price) |
| `get_spot_pair` | Get a single spot pair by dashed symbol (e.g. `HYPE-USDC`) |
| `get_spot_orderbook` | Current spot L2 orderbook (live from 2026-05-05; Pro+ for full depth) |
| `get_spot_orderbook_history` | Historical spot L2 orderbook snapshots (live-only from 2026-05-05; Build+) |
| `get_spot_trades` | Spot trade history with optional user filter (S3 backfill from 2025-03-22) |
| `get_spot_trades_recent` | Most recent spot trades (live from 2026-05-05) |
| `get_spot_order_history` | Spot order lifecycle events with user attribution (Pro+ tier) |
| `get_spot_l4_orderbook` | Spot L4 orderbook reconstruction at a specific timestamp (Pro+ tier) |
| `get_spot_l4_diffs` | Spot raw order-level changes over a time range (Pro+ tier) |
| `get_spot_l4_orderbook_history` | Spot periodic L4 orderbook checkpoints (Build+ tier) |
| `get_spot_twap_by_symbol` | Spot TWAP statuses for a single pair (live from 2026-05-05) |
| `get_spot_twap_by_user` | Spot TWAP statuses for a single user wallet across all pairs |
| `get_spot_freshness` | Per-pair spot data freshness and lag |

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

### Realtime WebSocket Channels

The MCP server exposes the historical REST endpoints. For realtime, point any WebSocket client at `wss://api.0xarchive.io/ws?apiKey=...` and subscribe to:

| Channel | Notes |
|---------|-------|
| `trades`, `hip3_trades`, `hip4_trades`, `lighter_trades` | Realtime + replay fills (one row per side per trade) |
| `liquidations`, `hip3_liquidations` | Realtime + replay liquidations. Each event is a fill row with `is_liquidation: true` (same shape as `trades`). |
| `orderbook`, `hip3_orderbook`, `hip4_orderbook`, `lighter_orderbook` | Realtime + replay L2 orderbook updates (~1.2 sec resolution) |
| `hip4_open_interest` | Realtime + replay HIP-4 per-side open interest snapshots |
| `hip4_l4_diffs`, `hip4_l4_orders`, `l4_diffs`, `l4_orders`, `hip3_l4_diffs`, `hip3_l4_orders` | Order-level events (Pro+, realtime only, no replay) |
| `outcome_settled` | HIP-4 outcome resolution event. Fired once per outcome when `is_settled` flips to true. |

Build+ tier required for any WebSocket access; Pro+ for L4 channels.

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

All 111 tools carry MCP annotations so clients can reason about safety and retry behavior.

**Market data tools (106):**

| Annotation | Value | Meaning |
|------------|-------|---------|
| `readOnlyHint` | `true` | Tools never modify data |
| `destructiveHint` | `false` | No destructive side effects |
| `idempotentHint` | `true` | Safe to retry on failure |
| `openWorldHint` | `true` | Queries an external API |

**Web3 tools (5):** `readOnlyHint: false`, `idempotentHint: false`. These create accounts, keys, and subscriptions.

All tools also declare an `outputSchema` so clients can validate structured responses.

## Smart Defaults

- **Time range**: Defaults to last 24 hours if not specified
- **Limit**: Defaults to 100 records
- **Interval**: Defaults to 1h for candles
- **Pagination**: Returns cursor for next page when more data available
- **Timestamps**: Accepts both Unix milliseconds and ISO 8601 strings

## Data Catalog

For large-scale data exports (full order books, complete trade history, etc.), use the [Data Catalog](https://www.0xarchive.io/data). It lets you choose markets, datasets, and date ranges, see a live quote, and export zstd-compressed Parquet. MCP tools are best for typed point queries and moderate data pulls; the Data Catalog is the file-export path.

## Links

- [API Docs](https://www.0xarchive.io/docs)
- [Python SDK](https://pypi.org/project/oxarchive/)
- [TypeScript SDK](https://npmjs.com/package/@0xarchive/sdk)
- [Rust SDK](https://crates.io/crates/oxarchive)
- [CLI](https://npmjs.com/package/@0xarchive/cli)
- [0xArchive Skill](https://github.com/0xArchiveIO/0xarchive-skill)
- [Examples](https://github.com/0xArchiveIO/examples)
