# 0xArchive MCP Server

Query crypto market data across Hyperliquid, HIP-3, and Lighter.xyz using natural language in Claude.

57 tools covering orderbooks, trades, candles, funding rates, open interest, liquidations, data quality metrics, and wallet-based authentication — from April 2023 to real-time.

## Quick Start (30 seconds)

```bash
git clone https://github.com/0xArchiveIO/0xarchive-mcp.git
cd 0xarchive-mcp && npm install && npm run build
claude mcp add 0xarchive -s user -t stdio -e OXARCHIVE_API_KEY=0xa_your_api_key -- node $(pwd)/build/index.js
```

Then ask Claude: **"What's BTC's current funding rate?"**

## Usage Examples

| Ask Claude... | Tool that fires |
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

## Setup (detailed)

### 1. Install & Build

```bash
git clone https://github.com/0xArchiveIO/0xarchive-mcp.git
cd 0xarchive-mcp
npm install
npm run build
```

### 2. Get an API Key

Sign up at [0xarchive.io](https://0xarchive.io) and generate an API key in Dashboard. Or use the `web3_challenge` and `web3_signup` tools to get a free API key with just an Ethereum wallet — no browser needed.

### 3. Add to Claude Code

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

## Available Tools (57)

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
| `get_hip3_freshness` | Per-coin HIP-3 data freshness and lag |
| `get_hip3_summary` | Combined HIP-3 market summary |
| `get_hip3_price_history` | HIP-3 mark/oracle/mid price history |

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

### Data Quality

| Tool | Description |
|------|-------------|
| `get_data_quality_status` | System health across all exchanges |
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

All 57 tools carry MCP annotations so clients can reason about safety and retry behavior.

**Market data tools (52):**

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
