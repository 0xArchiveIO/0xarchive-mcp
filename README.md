# 0xArchive MCP Server

MCP (Model Context Protocol) server that exposes 0xArchive's market data API as tools for Claude Desktop, Claude Code, and other MCP-compatible clients.

Query historical and real-time orderbooks, trades, candles, funding rates, open interest, liquidations, and data quality metrics across **Hyperliquid**, **HIP-3**, and **Lighter.xyz** via natural language.

## Setup

### 1. Install & Build

```bash
git clone https://github.com/0xArchiveIO/0xarchive-mcp.git
cd 0xarchive-mcp
npm install
npm run build
```

### 2. Get an API Key

Sign up at [0xarchive.io](https://0xarchive.io) and generate an API key in Dashboard.

### 3. Add to Claude Code

```bash
claude mcp add 0xarchive -s user -t stdio -e OXARCHIVE_API_KEY=0xa_your_key_here -- node /absolute/path/to/0xarchive-mcp/build/index.js
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
        "OXARCHIVE_API_KEY": "0xa_your_key_here"
      }
    }
  }
}
```

## Available Tools (26)

### Hyperliquid

| Tool | Description |
|------|-------------|
| `get_instruments` | List all Hyperliquid perp/spot instruments |
| `get_orderbook` | Current L2 orderbook snapshot |
| `get_orderbook_history` | Historical orderbook snapshots |
| `get_trades` | Trade/fill history |
| `get_candles` | OHLCV candle data |
| `get_funding_current` | Current funding rate |
| `get_funding_history` | Funding rate history |
| `get_open_interest` | Current open interest |
| `get_open_interest_history` | Open interest history |
| `get_liquidations` | Liquidation history |

### HIP-3 (Builder Perps)

| Tool | Description |
|------|-------------|
| `get_hip3_instruments` | List HIP-3 instruments |
| `get_hip3_orderbook` | Current HIP-3 orderbook |
| `get_hip3_trades` | HIP-3 trade history |
| `get_hip3_candles` | HIP-3 candle data |
| `get_hip3_funding` | HIP-3 funding history |

### Lighter.xyz

| Tool | Description |
|------|-------------|
| `get_lighter_instruments` | List Lighter instruments |
| `get_lighter_orderbook` | Current Lighter orderbook |
| `get_lighter_trades` | Lighter trade history |
| `get_lighter_candles` | Lighter candle data |
| `get_lighter_funding` | Lighter funding history |

### Data Quality

| Tool | Description |
|------|-------------|
| `get_data_quality_status` | System health across all exchanges |
| `get_data_coverage` | Data coverage (earliest/latest, records, completeness) |
| `get_symbol_coverage` | Per-symbol coverage with gap detection |
| `get_data_incidents` | Outage and degradation history |
| `get_data_latency` | WebSocket/REST latency and data freshness |
| `get_data_sla` | Monthly SLA compliance report |

## Pricing Tiers

Some endpoints require a paid plan. The server returns clear error messages with upgrade guidance when tier limits are hit.

| Tier | Price | Access |
|------|-------|--------|
| Free | $0/mo | BTC-only historical data |
| Build | $49/mo | All coins, REST API, 25 WS subs |
| Pro | $199/mo | Full orderbook depth, 100 WS subs |
| Enterprise | $499/mo | Tick data, 200 WS subs |

Upgrade at [0xarchive.io/pricing](https://0xarchive.io/pricing).

## Tool Annotations

All 26 tools carry MCP annotations so clients can reason about safety and retry behavior:

| Annotation | Value | Meaning |
|------------|-------|---------|
| `readOnlyHint` | `true` | Tools never modify data |
| `destructiveHint` | `false` | No destructive side effects |
| `idempotentHint` | `true` | Safe to retry on failure |
| `openWorldHint` | `true` | Queries an external API |

All tools also declare an `outputSchema` so clients can validate structured responses.

## Smart Defaults

- **Time range**: Defaults to last 24 hours if not specified
- **Limit**: Defaults to 100 records
- **Interval**: Defaults to 1h for candles
- **Pagination**: Returns cursor for next page when more data available
- **Timestamps**: Accepts both Unix milliseconds and ISO 8601 strings

## Example Queries

Once configured, ask Claude things like:

- "What instruments are available on Hyperliquid?"
- "Show me BTC's current orderbook"
- "Get ETH trades from the last hour"
- "Get SOL 4h candles for the past week"
- "What's the current funding rate for BTC?"
- "Show me liquidations on ETH in the last 24 hours"
- "List all available HIP-3 instruments"
- "Get km:US500 candles on HIP-3"
- "Are there any data quality issues right now?"
- "Show me the SLA report for January 2026"
- "What's the data latency across exchanges?"
