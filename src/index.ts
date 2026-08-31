#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OxArchive, OxArchiveError } from "@0xarchive/sdk";
import { z, type ZodRawShape } from "zod";

// ---------------------------------------------------------------------------
// A. API Key Validation + Client Setup
// ---------------------------------------------------------------------------

const apiKey = process.env.OXARCHIVE_API_KEY;
if (!apiKey) {
  console.error("Warning: OXARCHIVE_API_KEY not set. Server will start but all tools will return setup instructions.");
}

const client = apiKey ? new OxArchive({ apiKey, timeout: 60000 }) : null;

// Safe accessor — only called from tool handlers after the null guard in registerTool
function api(): OxArchive {
  return client!;
}

const MISSING_KEY_MESSAGE =
  `API key not configured.\n\n` +
  `This self-hosted package is retired. The hosted MCP needs no install and no API key:\n\n` +
  `   claude mcp remove 0xarchive\n` +
  `   claude mcp add --transport http 0xarchive https://mcp.0xarchive.io/mcp\n\n` +
  `Setup guide: https://docs.0xarchive.io/mcp-server\n\n` +
  `To keep using this package instead:\n\n` +
  `1. Sign up at https://0xarchive.io and create an API key from the Dashboard\n` +
  `2. Reconfigure this server with it:\n\n` +
  `   claude mcp remove 0xarchive\n` +
  `   claude mcp add 0xarchive -s user -t stdio -e OXARCHIVE_API_KEY=0xa_your_api_key -- node /path/to/build/index.js\n\n` +
  `Start a new Claude Code session after configuring.\n\n` +
  `Free tier includes all markets; history covers the most recent rolling 30 days (30-day span per request). Build and above keep the full archive.`;

const server = new McpServer({
  name: "0xarchive",
  version: "1.9.4",
});

// All tools are read-only, idempotent API queries to an external service
const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

// ---------------------------------------------------------------------------
// B. Shared Zod Schemas
// ---------------------------------------------------------------------------

const CoinParam = z
  .string()
  .describe("Coin/market symbol, e.g. 'BTC', 'ETH', 'SOL'");

const Hip3CoinParam = z
  .string()
  .describe(
    "HIP-3 coin symbol (CASE-SENSITIVE). 125+ markets across 6 builders: xyz, flx, hyna, km, vntl, cash. Examples: 'km:US500', 'xyz:GOLD', 'hyna:BTC', 'vntl:SPACEX', 'flx:TSLA', 'cash:NVDA'. Use get_hip3_instruments to list all."
  );

const Hip4CoinParam = z
  .string()
  .describe(
    "HIP-4 outcome-market coin symbol. Canonical form is the bare numeric '<10*outcome_id + side>' (e.g. '0' for outcome 0 Yes, '1' for outcome 0 No, '10' for outcome 1 Yes). The legacy '#0' and '%230' forms are also accepted. Use get_hip4_instruments to list all."
  );

const Hip4OutcomeIdParam = z
  .union([z.number(), z.string()])
  .describe("HIP-4 outcome_id (integer). Each outcome has two sides: '<10*id>' (Yes) and '<10*id+1>' (No).");

const LighterCoinParam = z
  .string()
  .describe("Lighter.xyz coin symbol, e.g. 'BTC', 'ETH'");

const SpotCoinParam = z
  .string()
  .describe(
    "Hyperliquid Spot dashed canonical pair symbol (e.g. 'HYPE-USDC', 'PURR-USDC'). 294 pairs available. The server resolves the dashed form to Hyperliquid's wire format ('PURR/USDC', '@107') internally. Use get_spot_pairs to list all."
  );

const TimestampParam = z
  .union([z.number(), z.string()])
  .optional()
  .describe("Timestamp as Unix milliseconds or ISO 8601 string");

const LimitParam = z
  .number()
  .optional()
  .describe("Max records to return (default 100, max 1000)");

const CursorParam = z
  .string()
  .optional()
  .describe("Pagination cursor from previous response's nextCursor");

const DepthParam = z
  .number()
  .optional()
  .describe("Orderbook depth — number of price levels per side");

const IntervalParam = z
  .enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"])
  .optional()
  .describe("Candle interval (default '1h')");

const AggregationIntervalParam = z
  .enum(["5m", "15m", "30m", "1h", "4h", "1d"])
  .optional()
  .describe("Aggregation interval. Omit for raw ~1 min data.");

const HistoryParams = {
  start: TimestampParam.describe(
    "Start timestamp (Unix ms or ISO). Defaults to 24h ago."
  ),
  end: TimestampParam.describe(
    "End timestamp (Unix ms or ISO). Defaults to now."
  ),
  limit: LimitParam,
  cursor: CursorParam,
};

// ---------------------------------------------------------------------------
// B2. Output Schemas (structuredContent)
// ---------------------------------------------------------------------------

// For tools that return arrays (instruments, history, candles, etc.)
const ListOutputSchema: ZodRawShape = {
  records: z.array(z.record(z.unknown())).describe("Array of result records"),
  count: z.number().describe("Total number of records in the full result set"),
  nextCursor: z
    .string()
    .optional()
    .describe("Cursor for next page, if more results available"),
};

// For tools that return a single object (current snapshots, orderbooks, data quality)
const ObjectOutputSchema: ZodRawShape = {
  data: z.record(z.unknown()).describe("Result data object"),
};

// ---------------------------------------------------------------------------
// C. Smart Defaults
// ---------------------------------------------------------------------------

function toUnixMs(ts: number | string): number {
  if (typeof ts === "number") return ts;
  // MCP/JSON-RPC may deliver numeric timestamps as strings
  if (/^\d+$/.test(ts)) return Number(ts);
  const parsed = Date.parse(ts);
  if (isNaN(parsed)) throw new Error(`Invalid timestamp: "${ts}"`);
  return parsed;
}

function resolveTimeRange(
  start?: number | string,
  end?: number | string
): { start: number; end: number } {
  return {
    start: start != null ? toUnixMs(start) : Date.now() - 24 * 60 * 60 * 1000,
    end: end != null ? toUnixMs(end) : Date.now(),
  };
}

function resolveLimit(limit?: number): number {
  return limit ?? 100;
}

// ---------------------------------------------------------------------------
// D. Error Handling
// ---------------------------------------------------------------------------

type McpContent = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
};

function formatError(error: unknown): McpContent & { isError: true } {
  if (error instanceof OxArchiveError) {
    let text: string;

    switch (error.code) {
      case 403:
        text =
          `Access denied: ${error.message}\n\n` +
          `All markets, schemas, and full served depth are available on every tier; Free history covers ` +
          `the most recent rolling 30 days (30-day span per request), and Build and above keep the full archive. ` +
          `A 403 means a plan limit was hit (credits, RPS, concurrency, WebSocket cap, export, or Free's 30-day history window). Pricing:\n` +
          `  - Free: $0 — 50,000 credits/mo, 15 RPS, 10 WS subs, 10x replay\n` +
          `  - Build: $49/mo — 80M credits/mo, 50 RPS, 500 WS subs, 50x replay\n` +
          `  - Pro: $199/mo — 400M credits/mo, 150 RPS, 3,000 WS subs, 100x replay\n` +
          `  - Scale: $799/mo — 2B credits/mo, 500 RPS, 20,000 WS subs, 300x replay\n` +
          `  - Enterprise: Custom — unlimited credits, RPS from 1,000, replay from 500x\n\n` +
          `Upgrade at https://0xarchive.io/pricing`;
        break;

      case 429:
        text =
          `Rate limited: ${error.message}\n\n` +
          `Wait a moment and retry. If you hit limits frequently, consider upgrading:\n` +
          `https://0xarchive.io/pricing`;
        break;

      case 404:
        text =
          `Not found: ${error.message}\n\n` +
          `Check the coin symbol is correct. Use get_instruments, get_hip3_instruments, ` +
          `or get_lighter_instruments to list available markets.`;
        break;

      default:
        // Detect tier-gate errors that come as 400 instead of 403
        if (
          error.code === 400 &&
          /plan only allows|upgrade|tier/i.test(error.message)
        ) {
          text =
            `${error.message}\n\n` +
            `Upgrade your plan for higher limits (credits, RPS, concurrency, WebSocket scale):\n` +
            `https://0xarchive.io/pricing`;
        } else {
          text = `API error (${error.code}): ${error.message}`;
          if (error.requestId) {
            text += `\nRequest ID: ${error.requestId}`;
          }
        }
    }

    return { content: [{ type: "text", text }], isError: true };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// E. Response Formatting
// ---------------------------------------------------------------------------

// Truncation limit for paginated responses to prevent LLM context bloat.
// Non-paginated responses (e.g. instrument lists) are never truncated.
const MAX_PAGINATED_ITEMS = 50;

function formatResponse(
  data: unknown,
  meta?: { nextCursor?: string; paginated?: boolean }
): McpContent {
  let header = "";
  let body: unknown = data;

  if (Array.isArray(data)) {
    header = `Returned ${data.length} record${data.length !== 1 ? "s" : ""}`;
    // Only truncate paginated endpoints — the user can cursor for more.
    // Non-paginated results (instruments, current snapshots) return everything.
    if (meta?.paginated && data.length > MAX_PAGINATED_ITEMS) {
      header += ` (showing first ${MAX_PAGINATED_ITEMS}; use cursor to get more)`;
      body = data.slice(0, MAX_PAGINATED_ITEMS);
    }
  }

  if (meta?.nextCursor) {
    header += header
      ? `\nNext page cursor: "${meta.nextCursor}"`
      : `Use cursor: "${meta.nextCursor}" to get the next page`;
  }

  const json = JSON.stringify(body, null, 2);
  const text = header ? `${header}\n\n${json}` : json;

  // Build structuredContent matching ListOutputSchema or ObjectOutputSchema
  const structuredContent: Record<string, unknown> = Array.isArray(data)
    ? {
        records: body,
        count: data.length,
        ...(meta?.nextCursor && { nextCursor: meta.nextCursor }),
      }
    : { data };

  return { content: [{ type: "text", text }], structuredContent };
}

function formatCursorResponse(result: {
  data: unknown;
  nextCursor?: string;
}): McpContent {
  return formatResponse(result.data, {
    nextCursor: result.nextCursor,
    paginated: true,
  });
}

// ---------------------------------------------------------------------------
// F. Coin Normalization
// ---------------------------------------------------------------------------

function normalizeHLCoin(coin: string): string {
  return coin.toUpperCase();
}

function normalizeHip3Coin(coin: string): string {
  return coin; // Case-sensitive
}

// HIP-4 path encoding: the canonical form is the bare numeric `0`, `1`, `42`.
// The legacy `#0` / `%230` forms are still accepted by the API. We normalize to
// the bare form when possible (avoids URL-fragment ambiguity entirely).
function normalizeHip4Coin(coin: string): string {
  const trimmed = String(coin).trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const stripped = trimmed.replace(/^(#|%23)/i, "");
  if (/^\d+$/.test(stripped)) return stripped;
  // Unknown shape — fall back to URL-encoding the original.
  return encodeURIComponent(trimmed);
}

function normalizeLighterCoin(coin: string): string {
  return coin.toUpperCase();
}

function normalizeSpotCoin(coin: string): string {
  return coin.toUpperCase();
}

// ---------------------------------------------------------------------------
// G. Tool Registration Helpers
// ---------------------------------------------------------------------------

function registerTool(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  outputSchema: ZodRawShape,
  handler: (params: any) => Promise<McpContent>
): void {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      outputSchema,
      annotations: TOOL_ANNOTATIONS,
    },
    async (params: any) => {
      if (!client) {
        return {
          content: [{ type: "text" as const, text: MISSING_KEY_MESSAGE }],
          isError: true,
        };
      }
      try {
        return await handler(params);
      } catch (err) {
        const error = err instanceof OxArchiveError ? err : new OxArchiveError(String(err), 500);
        return formatError(error);
      }
    }
  );
}

// Pattern 1: Instrument list (no params)
function registerInstrumentsTool(
  name: string,
  description: string,
  sdkCall: () => Promise<unknown[]>
): void {
  registerTool(name, description, {}, ListOutputSchema, async () => {
    const data = await sdkCall();
    return formatResponse(data);
  });
}

// Pattern 2: Current snapshot (coin only)
function registerCurrentTool(
  name: string,
  description: string,
  sdkCall: (coin: string) => Promise<unknown>,
  coinSchema: z.ZodString,
  normFn: (coin: string) => string
): void {
  registerTool(name, description, { coin: coinSchema }, ObjectOutputSchema, async (params) => {
    const data = await sdkCall(normFn(params.coin));
    return formatResponse(data);
  });
}

// Pattern 3: Orderbook snapshot (coin + optional depth)
function registerOrderbookTool(
  name: string,
  description: string,
  sdkCall: (coin: string, params?: { depth?: number }) => Promise<unknown>,
  coinSchema: z.ZodString,
  normFn: (coin: string) => string
): void {
  registerTool(
    name,
    description,
    { coin: coinSchema, depth: DepthParam },
    ObjectOutputSchema,
    async (params) => {
      const sdkParams = params.depth ? { depth: params.depth } : undefined;
      const data = await sdkCall(normFn(params.coin), sdkParams);
      return formatResponse(data);
    }
  );
}

// Pattern 4: History with cursor pagination (coin + time range)
function registerHistoryTool(
  name: string,
  description: string,
  sdkCall: (coin: string, params: Record<string, unknown>) => Promise<{ data: unknown; nextCursor?: string }>,
  coinSchema: z.ZodString,
  normFn: (coin: string) => string,
  extraSchema?: ZodRawShape
): void {
  const schema: ZodRawShape = { coin: coinSchema, ...HistoryParams };
  if (extraSchema) Object.assign(schema, extraSchema);

  registerTool(name, description, schema, ListOutputSchema, async (params) => {
    const { coin, start, end, limit, cursor, ...extra } = params;

    const timeRange = resolveTimeRange(start, end);
    const sdkParams: Record<string, unknown> = {
      ...timeRange,
      limit: resolveLimit(limit),
    };

    if (cursor) sdkParams.cursor = cursor;

    // Pass through extra params (interval, side, etc.)
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) sdkParams[k] = v;
    }

    const result = await sdkCall(normFn(coin), sdkParams);
    return formatCursorResponse(result);
  });
}

// Pattern 5: Candle history (coin + time range + interval)
function registerCandleTool(
  name: string,
  description: string,
  sdkCall: (coin: string, params: Record<string, unknown>) => Promise<{ data: unknown; nextCursor?: string }>,
  coinSchema: z.ZodString,
  normFn: (coin: string) => string
): void {
  registerHistoryTool(
    name,
    description,
    sdkCall,
    coinSchema,
    normFn,
    { interval: IntervalParam }
  );
}

// ---------------------------------------------------------------------------
// Tool Registration — Hyperliquid
// ---------------------------------------------------------------------------

// 1. Instruments
registerInstrumentsTool(
  "get_instruments",
  "List all available Hyperliquid perpetual and spot instruments with leverage, decimals, and active status. Use this to discover valid coin symbols before querying other endpoints.",
  () => api().hyperliquid.instruments.list()
);

// 1b. Single Instrument
registerCurrentTool(
  "get_instrument",
  "Get details for a single Hyperliquid instrument by coin symbol. Returns leverage, decimals, and active status.",
  (coin) => api().hyperliquid.instruments.get(coin),
  CoinParam,
  normalizeHLCoin
);

// 2. Current Orderbook
registerOrderbookTool(
  "get_orderbook",
  "Get the current Hyperliquid L2 orderbook snapshot for a coin. Returns bids, asks, mid price, and spread. Optionally specify depth (price levels per side). Full depth available on every tier.",
  (coin, params) => api().hyperliquid.orderbook.get(coin, params),
  CoinParam,
  normalizeHLCoin
);

// 3. Orderbook History
registerHistoryTool(
  "get_orderbook_history",
  "Get historical Hyperliquid orderbook snapshots (~1.2s resolution). Returns L2 snapshots with bids/asks over a time range. Data available from April 2023. All symbols and full depth on every tier.",
  (coin, params) =>
    api().hyperliquid.orderbook.history(coin, params as any),
  CoinParam,
  normalizeHLCoin,
  { depth: DepthParam }
);

// 4. Trades
registerHistoryTool(
  "get_trades",
  "Get Hyperliquid trade/fill history for a coin over a time range. Returns price, size, side, timestamps, and user addresses. Data available from April 2023. Supports cursor pagination.",
  (coin, params) =>
    api().hyperliquid.trades.list(coin, params as any),
  CoinParam,
  normalizeHLCoin
);

// 5. Candles
registerCandleTool(
  "get_candles",
  "Get Hyperliquid OHLCV candle data for a coin. Intervals: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w (default 1h). Returns open, high, low, close, volume. Data available from April 2023.",
  (coin, params) =>
    api().hyperliquid.candles.history(coin, params as any),
  CoinParam,
  normalizeHLCoin
);

// 6. Funding Current
registerCurrentTool(
  "get_funding_current",
  "Get the current Hyperliquid funding rate for a coin. Returns the latest funding rate, premium, and timestamp.",
  (coin) => api().hyperliquid.funding.current(coin),
  CoinParam,
  normalizeHLCoin
);

// 7. Funding History
registerHistoryTool(
  "get_funding_history",
  "Get Hyperliquid funding rate history for a coin over a time range. Returns timestamped funding rates and premiums. Data available from May 2023. Supports aggregation intervals (5m, 15m, 30m, 1h, 4h, 1d).",
  (coin, params) =>
    api().hyperliquid.funding.history(coin, params as any),
  CoinParam,
  normalizeHLCoin,
  { interval: AggregationIntervalParam }
);

// 8. Open Interest Current
registerCurrentTool(
  "get_open_interest",
  "Get the current Hyperliquid open interest for a coin. Returns OI, mark price, oracle price, and 24h volume.",
  (coin) => api().hyperliquid.openInterest.current(coin),
  CoinParam,
  normalizeHLCoin
);

// 9. Open Interest History
registerHistoryTool(
  "get_open_interest_history",
  "Get Hyperliquid open interest history for a coin over a time range. Returns timestamped OI snapshots with mark/oracle prices. Data available from May 2023. Supports aggregation intervals (5m, 15m, 30m, 1h, 4h, 1d).",
  (coin, params) =>
    api().hyperliquid.openInterest.history(coin, params as any),
  CoinParam,
  normalizeHLCoin,
  { interval: AggregationIntervalParam }
);

// 10. Liquidations
registerHistoryTool(
  "get_liquidations",
  "Get Hyperliquid liquidation history for a coin over a time range. Returns liquidated/liquidator addresses, price, size, side, and PnL. Data available from May 2025. Real-time liquidations are also available on the WebSocket `liquidations` channel — each event is a fill row with `is_liquidation: true`, same shape as the `trades` channel.",
  (coin, params) =>
    api().hyperliquid.liquidations.history(coin, params as any),
  CoinParam,
  normalizeHLCoin
);

// 11. Liquidations by User
registerTool(
  "get_liquidations_by_user",
  "Get Hyperliquid liquidation history for a specific user address. Returns liquidations where the user was either liquidated or was the liquidator. Filter by coin optionally.",
  {
    address: z.string().describe("User's wallet address (e.g., '0x1234...')"),
    ...HistoryParams,
    coin: CoinParam.optional().describe("Optional coin filter"),
  },
  ListOutputSchema,
  async (params) => {
    const { address, start, end, limit, cursor, coin } = params;
    const timeRange = resolveTimeRange(start, end);
    const sdkParams: Record<string, unknown> = {
      ...timeRange,
      limit: resolveLimit(limit),
    };
    if (cursor) sdkParams.cursor = cursor;
    if (coin) sdkParams.coin = coin.toUpperCase();
    const result = await api().hyperliquid.liquidations.byUser(address, sdkParams as any);
    return formatCursorResponse(result);
  }
);

// 12. Liquidation Volume
registerHistoryTool(
  "get_liquidation_volume",
  "Get aggregated liquidation volume for a coin in time-bucketed intervals. Returns total, long, and short USD volumes. Data available from May 2025.",
  (coin, params) =>
    api().hyperliquid.liquidations.volume(coin, params as any),
  CoinParam,
  normalizeHLCoin,
  { interval: z.enum(["5m", "15m", "30m", "1h", "4h", "1d"]).optional().describe("Aggregation interval: '5m', '15m', '30m', '1h', '4h', '1d'. Default '1h'") }
);

// 13. Freshness
registerCurrentTool(
  "get_freshness",
  "Get data freshness for a coin across all data types (orderbook, trades, funding, OI, liquidations). Shows when each data type was last updated and current lag.",
  (coin) => api().hyperliquid.freshness(coin),
  CoinParam,
  normalizeHLCoin
);

// 14. Summary
registerCurrentTool(
  "get_summary",
  "Get combined market summary for a coin in a single call. Returns mark price, oracle price, funding rate, open interest, 24h volume, and 24h liquidation volumes.",
  (coin) => api().hyperliquid.summary(coin),
  CoinParam,
  normalizeHLCoin
);

// 15. Price History
registerHistoryTool(
  "get_price_history",
  "Get mark/oracle price history for a coin over a time range. Returns mark_price, oracle_price, and mid_price at each timestamp. Supports aggregation intervals. Data available from May 2023.",
  (coin, params) =>
    api().hyperliquid.priceHistory(coin, params as any),
  CoinParam,
  normalizeHLCoin,
  { interval: z.enum(["5m", "15m", "30m", "1h", "4h", "1d"]).optional().describe("Aggregation interval: '5m', '15m', '30m', '1h', '4h', '1d'. Default '1h'") }
);

// ---------------------------------------------------------------------------
// Tool Registration — HIP-3
// ---------------------------------------------------------------------------

// 16. HIP-3 Instruments
registerInstrumentsTool(
  "get_hip3_instruments",
  "List all available HIP-3 builder perp instruments on Hyperliquid. HIP-3 symbols are CASE-SENSITIVE (e.g. 'km:US500', 'km:TSLA'). Use this to discover valid symbols before querying HIP-3 data.",
  () => api().hyperliquid.hip3.instruments.list()
);

// 15b. HIP-3 Single Instrument
registerCurrentTool(
  "get_hip3_instrument",
  "Get details for a single HIP-3 instrument. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns mark price, open interest, mid price, and latest timestamp.",
  (coin) => api().hyperliquid.hip3.instruments.get(coin),
  Hip3CoinParam,
  normalizeHip3Coin
);

// 17. HIP-3 Orderbook
registerOrderbookTool(
  "get_hip3_orderbook",
  "Get the current HIP-3 orderbook snapshot. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns bids, asks, mid price. All HIP-3 symbols on every tier.",
  (coin, params) => api().hyperliquid.hip3.orderbook.get(coin, params),
  Hip3CoinParam,
  normalizeHip3Coin
);

// HIP-3 Orderbook History
registerHistoryTool(
  "get_hip3_orderbook_history",
  "Get historical HIP-3 orderbook snapshots. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns L2 snapshots with bids/asks over a time range. All HIP-3 symbols on every tier.",
  (coin, params) =>
    api().hyperliquid.hip3.orderbook.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin,
  { depth: DepthParam }
);

// 18. HIP-3 Trades
registerHistoryTool(
  "get_hip3_trades",
  "Get HIP-3 trade history. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns trades with price, size, side, and timestamps over a time range. Supports cursor pagination.",
  (coin, params) =>
    api().hyperliquid.hip3.trades.list(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// HIP-3 Recent Trades
registerTool(
  "get_hip3_trades_recent",
  "Get most recent HIP-3 trades. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns the latest trades without needing a time range.",
  {
    coin: Hip3CoinParam,
    limit: LimitParam,
  },
  ListOutputSchema,
  async (params) => {
    const data = await api().hyperliquid.hip3.trades.recent(
      normalizeHip3Coin(params.coin),
      params.limit
    );
    return formatResponse(data);
  }
);

// 19. HIP-3 Candles
registerCandleTool(
  "get_hip3_candles",
  "Get HIP-3 OHLCV candle data. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Intervals: 1m to 1w (default 1h). Returns open, high, low, close, volume.",
  (coin, params) =>
    api().hyperliquid.hip3.candles.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// HIP-3 Funding Current
registerCurrentTool(
  "get_hip3_funding_current",
  "Get the current HIP-3 funding rate for a coin. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns the latest funding rate and timestamp.",
  (coin) => api().hyperliquid.hip3.funding.current(coin),
  Hip3CoinParam,
  normalizeHip3Coin
);

// 20. HIP-3 Funding History
registerHistoryTool(
  "get_hip3_funding",
  "Get HIP-3 funding rate history. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns timestamped funding rates over a time range. Supports cursor pagination and aggregation intervals (5m, 15m, 30m, 1h, 4h, 1d).",
  (coin, params) =>
    api().hyperliquid.hip3.funding.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin,
  { interval: AggregationIntervalParam }
);

// 21. HIP-3 Open Interest Current
registerCurrentTool(
  "get_hip3_open_interest",
  "Get the current HIP-3 open interest for a coin. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns OI, mark price, and oracle price.",
  (coin) => api().hyperliquid.hip3.openInterest.current(coin),
  Hip3CoinParam,
  normalizeHip3Coin
);

// 22. HIP-3 Open Interest History
registerHistoryTool(
  "get_hip3_open_interest_history",
  "Get HIP-3 open interest history over a time range. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns timestamped OI snapshots.",
  (coin, params) =>
    api().hyperliquid.hip3.openInterest.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin,
  { interval: AggregationIntervalParam }
);

// 21b. HIP-3 Liquidations
registerHistoryTool(
  "get_hip3_liquidations",
  "Get HIP-3 liquidation events for a coin over a time range. Returns liquidated/liquidator addresses, price, size, side, and PnL. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Data available from February 2026. Real-time HIP-3 liquidations are also available on the WebSocket `hip3_liquidations` channel — each event is a fill row with `is_liquidation: true`, same shape as the `hip3_trades` channel.",
  (coin, params) =>
    api().hyperliquid.hip3.liquidations.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// 21c. HIP-3 Liquidation Volume
registerHistoryTool(
  "get_hip3_liquidation_volume",
  "Get aggregated HIP-3 liquidation volume for a coin in time-bucketed intervals. Returns total, long, and short USD volumes. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Data available from February 2026.",
  (coin, params) =>
    api().hyperliquid.hip3.liquidations.volume(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin,
  { interval: z.enum(["5m", "15m", "30m", "1h", "4h", "1d"]).optional().describe("Aggregation interval: '5m', '15m', '30m', '1h', '4h', '1d'. Default '1h'") }
);

// ---------------------------------------------------------------------------
// Tool Registration — Lighter.xyz
// ---------------------------------------------------------------------------

// 23. Lighter Instruments
registerInstrumentsTool(
  "get_lighter_instruments",
  "List all available Lighter.xyz instruments with market IDs, fees, size/price decimals, and active status. Use this to discover valid Lighter symbols.",
  () => api().lighter.instruments.list()
);

// 22b. Lighter Single Instrument
registerCurrentTool(
  "get_lighter_instrument",
  "Get details for a single Lighter.xyz instrument by coin symbol. Returns market ID, fees, size/price decimals, and active status.",
  (coin) => api().lighter.instruments.get(coin),
  LighterCoinParam,
  normalizeLighterCoin
);

// 24. Lighter Orderbook
registerOrderbookTool(
  "get_lighter_orderbook",
  "Get the current Lighter.xyz orderbook snapshot for a coin. Returns bids, asks, mid price, and spread. Optionally specify depth. Full depth available on every tier.",
  (coin, params) => api().lighter.orderbook.get(coin, params),
  LighterCoinParam,
  normalizeLighterCoin
);

// Lighter Orderbook History
registerHistoryTool(
  "get_lighter_orderbook_history",
  "Get historical Lighter.xyz orderbook snapshots. Returns L2 snapshots with bids/asks over a time range. Supports granularity levels: checkpoint (default), 30s, 10s, 1s, tick.",
  (coin, params) =>
    api().lighter.orderbook.history(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin,
  {
    depth: DepthParam,
    granularity: z
      .enum(["checkpoint", "30s", "10s", "1s", "tick"])
      .optional()
      .describe("Orderbook resolution: 'checkpoint' (default), '30s', '10s', '1s', 'tick' (Enterprise)"),
  }
);

// 25. Lighter Trades
registerHistoryTool(
  "get_lighter_trades",
  "Get Lighter.xyz trade history for a coin over a time range. Returns price, size, side, and timestamps. Supports cursor pagination.",
  (coin, params) =>
    api().lighter.trades.list(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin
);

// Lighter Recent Trades
registerTool(
  "get_lighter_trades_recent",
  "Get most recent Lighter.xyz trades for a coin. Returns the latest trades without needing a time range.",
  {
    coin: LighterCoinParam,
    limit: LimitParam,
  },
  ListOutputSchema,
  async (params) => {
    const data = await api().lighter.trades.recent(
      normalizeLighterCoin(params.coin),
      params.limit
    );
    return formatResponse(data);
  }
);

// 26. Lighter Candles
registerCandleTool(
  "get_lighter_candles",
  "Get Lighter.xyz OHLCV candle data for a coin. Intervals: 1m to 1w (default 1h). Returns open, high, low, close, volume.",
  (coin, params) =>
    api().lighter.candles.history(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin
);

// Lighter Funding Current
registerCurrentTool(
  "get_lighter_funding_current",
  "Get the current Lighter.xyz funding rate for a coin. Returns the latest funding rate and timestamp.",
  (coin) => api().lighter.funding.current(coin),
  LighterCoinParam,
  normalizeLighterCoin
);

// 27. Lighter Funding History
registerHistoryTool(
  "get_lighter_funding",
  "Get Lighter.xyz funding rate history for a coin over a time range. Returns timestamped funding rates. Supports cursor pagination and aggregation intervals (5m, 15m, 30m, 1h, 4h, 1d).",
  (coin, params) =>
    api().lighter.funding.history(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin,
  { interval: AggregationIntervalParam }
);

// 28. Lighter Open Interest Current
registerCurrentTool(
  "get_lighter_open_interest",
  "Get the current Lighter.xyz open interest for a coin. Returns OI, mark price, and oracle price.",
  (coin) => api().lighter.openInterest.current(coin),
  LighterCoinParam,
  normalizeLighterCoin
);

// 29. Lighter Open Interest History
registerHistoryTool(
  "get_lighter_open_interest_history",
  "Get Lighter.xyz open interest history for a coin over a time range. Returns timestamped OI snapshots.",
  (coin, params) =>
    api().lighter.openInterest.history(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin,
  { interval: AggregationIntervalParam }
);

// Lighter Freshness
registerCurrentTool(
  "get_lighter_freshness",
  "Get data freshness for a Lighter.xyz coin across all data types (orderbook, trades, funding, OI). Shows when each data type was last updated and current lag.",
  (coin) => api().lighter.freshness(coin),
  LighterCoinParam,
  normalizeLighterCoin
);

// Lighter Summary
registerCurrentTool(
  "get_lighter_summary",
  "Get combined Lighter.xyz market summary for a coin in a single call. Returns mark price, oracle price, funding rate, and open interest.",
  (coin) => api().lighter.summary(coin),
  LighterCoinParam,
  normalizeLighterCoin
);

// Lighter Price History
registerHistoryTool(
  "get_lighter_price_history",
  "Get mark/oracle price history for a Lighter.xyz coin over a time range. Returns mark_price, oracle_price, and mid_price at each timestamp. Supports aggregation intervals.",
  (coin, params) =>
    api().lighter.priceHistory(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin,
  { interval: z.enum(["5m", "15m", "30m", "1h", "4h", "1d"]).optional().describe("Aggregation interval: '5m', '15m', '30m', '1h', '4h', '1d'. Default '1h'") }
);

// HIP-3 Freshness
registerCurrentTool(
  "get_hip3_freshness",
  "Get data freshness for a HIP-3 coin across all data types (orderbook, trades, funding, OI). Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Shows when each data type was last updated and current lag.",
  (coin) => api().hyperliquid.hip3.freshness(coin),
  Hip3CoinParam,
  normalizeHip3Coin
);

// HIP-3 Summary
registerCurrentTool(
  "get_hip3_summary",
  "Get combined HIP-3 market summary for a coin in a single call. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns mark price, oracle price, mid price, funding rate, and open interest.",
  (coin) => api().hyperliquid.hip3.summary(coin),
  Hip3CoinParam,
  normalizeHip3Coin
);

// HIP-3 Price History
registerHistoryTool(
  "get_hip3_price_history",
  "Get mark/oracle/mid price history for a HIP-3 coin over a time range. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns mark_price, oracle_price, and mid_price at each timestamp. Supports aggregation intervals.",
  (coin, params) =>
    api().hyperliquid.hip3.priceHistory(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin,
  { interval: z.enum(["5m", "15m", "30m", "1h", "4h", "1d"]).optional().describe("Aggregation interval: '5m', '15m', '30m', '1h', '4h', '1d'. Default '1h'") }
);

// ---------------------------------------------------------------------------
// Tool Registration — Lighter L3 Orderbook
// ---------------------------------------------------------------------------

// Lighter L3 Orderbook (current)
registerTool(
  "get_lighter_l3_orderbook",
  "Get Lighter L3 order-level orderbook. Returns individual orders with order IDs, user addresses, prices, and sizes.",
  {
    coin: LighterCoinParam,
    depth: DepthParam,
  },
  ObjectOutputSchema,
  async (params) => {
    const sdkParams = params.depth ? { depth: params.depth } : undefined;
    const data = await api().lighter.l3Orderbook.get(
      normalizeLighterCoin(params.coin),
      sdkParams
    );
    return formatResponse(data);
  }
);

// Lighter L3 Orderbook History
registerHistoryTool(
  "get_lighter_l3_orderbook_history",
  "Get historical Lighter L3 orderbook snapshots. Returns order-level snapshots with individual order IDs, user addresses, prices, and sizes over a time range.",
  (coin, params) =>
    api().lighter.l3Orderbook.history(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin,
  { depth: DepthParam }
);

// ---------------------------------------------------------------------------
// Tool Registration — Hyperliquid L4 Orders & Orderbook
// ---------------------------------------------------------------------------

const UserParam = z
  .string()
  .optional()
  .describe("User wallet address filter (e.g., '0x1234...')");

const OrderStatusParam = z
  .enum(["open", "filled", "cancelled", "expired"])
  .optional()
  .describe("Filter orders by status");

const OrderTypeParam = z
  .enum(["limit", "market", "trigger", "tpsl"])
  .optional()
  .describe("Filter orders by type");

const TriggeredParam = z
  .boolean()
  .optional()
  .describe("Filter TP/SL orders by triggered status");

// Hyperliquid Order History
registerHistoryTool(
  "get_order_history",
  "Get Hyperliquid order history with user attribution. Returns order lifecycle events including placements, fills, cancellations, and modifications with user addresses.",
  (coin, params) =>
    api().hyperliquid.orders.history(coin, params as any),
  CoinParam,
  normalizeHLCoin,
  {
    user: UserParam,
    status: OrderStatusParam,
    order_type: OrderTypeParam,
  }
);

// Hyperliquid Order Flow
registerTool(
  "get_order_flow",
  "Get Hyperliquid order flow aggregation. Returns aggregated order placement, cancellation, and fill metrics over time intervals.",
  {
    coin: CoinParam,
    ...HistoryParams,
    interval: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]).optional()
      .describe("Aggregation interval (default '1h')"),
  },
  ListOutputSchema,
  async (params) => {
    const { coin, start, end, limit, cursor, interval } = params;
    const timeRange = resolveTimeRange(start, end);
    const sdkParams: Record<string, unknown> = {
      ...timeRange,
      limit: resolveLimit(limit),
    };
    if (cursor) sdkParams.cursor = cursor;
    if (interval) sdkParams.interval = interval;
    const result = await api().hyperliquid.orders.flow(
      normalizeHLCoin(coin),
      sdkParams as any
    );
    return formatCursorResponse(result);
  }
);

// Hyperliquid TP/SL Orders
registerHistoryTool(
  "get_tpsl",
  "Get Hyperliquid TP/SL order history. Returns take-profit and stop-loss orders with trigger prices, user addresses, and triggered status.",
  (coin, params) =>
    api().hyperliquid.orders.tpsl(coin, params as any),
  CoinParam,
  normalizeHLCoin,
  {
    user: UserParam,
    triggered: TriggeredParam,
  }
);

// Hyperliquid L4 Orderbook Reconstruction
registerTool(
  "get_l4_orderbook",
  "Get Hyperliquid L4 orderbook reconstruction. Returns full order-level orderbook at a specific timestamp with individual order IDs, user addresses, prices, and sizes.",
  {
    coin: CoinParam,
    timestamp: TimestampParam.describe("Timestamp for orderbook reconstruction (Unix ms or ISO)"),
    depth: DepthParam,
  },
  ObjectOutputSchema,
  async (params) => {
    const sdkParams: Record<string, unknown> = {};
    if (params.timestamp != null) sdkParams.timestamp = toUnixMs(params.timestamp);
    if (params.depth) sdkParams.depth = params.depth;
    const data = await api().hyperliquid.l4Orderbook.get(
      normalizeHLCoin(params.coin),
      sdkParams as any
    );
    return formatResponse(data);
  }
);

// Hyperliquid L4 Orderbook Diffs
registerHistoryTool(
  "get_l4_diffs",
  "Get Hyperliquid L4 orderbook diffs. Returns raw order-level changes (new orders, modifications, cancellations, fills) over a time range.",
  (coin, params) =>
    api().hyperliquid.l4Orderbook.diffs(coin, params as any),
  CoinParam,
  normalizeHLCoin
);

// Hyperliquid L4 Orderbook History (Checkpoints)
registerHistoryTool(
  "get_l4_orderbook_history",
  "Get Hyperliquid L4 orderbook checkpoints. Returns periodic full order-level orderbook snapshots over a time range for reconstruction.",
  (coin, params) =>
    api().hyperliquid.l4Orderbook.history(coin, params as any),
  CoinParam,
  normalizeHLCoin
);

// ---------------------------------------------------------------------------
// Tool Registration — Hyperliquid L2 Full-Depth Orderbook
// ---------------------------------------------------------------------------

// Hyperliquid L2 Orderbook Snapshot
registerTool(
  "get_l2_orderbook",
  "Get Hyperliquid L2 full-depth orderbook. Returns aggregated price levels with total size and order count per level. Derived from L4 data. Data from March 2026+.",
  {
    coin: CoinParam,
    timestamp: TimestampParam.describe("Timestamp for historical state (Unix ms or ISO). Omit for current.").optional(),
    depth: DepthParam,
  },
  ObjectOutputSchema,
  async (params) => {
    const sdkParams: Record<string, unknown> = {};
    if (params.timestamp != null) sdkParams.timestamp = toUnixMs(params.timestamp);
    if (params.depth) sdkParams.depth = params.depth;
    const data = await api().hyperliquid.l2Orderbook.get(
      normalizeHLCoin(params.coin),
      sdkParams as any
    );
    return formatResponse(data);
  }
);

// Hyperliquid L2 Orderbook History
registerHistoryTool(
  "get_l2_orderbook_history",
  "Get Hyperliquid L2 full-depth orderbook checkpoints. Returns periodic aggregated orderbook snapshots over a time range.",
  (coin, params) =>
    api().hyperliquid.l2Orderbook.history(coin, params as any),
  CoinParam,
  normalizeHLCoin,
  { depth: DepthParam }
);

// Hyperliquid L2 Orderbook Diffs
registerHistoryTool(
  "get_l2_diffs",
  "Get Hyperliquid L2 tick-level orderbook diffs. Returns price-level changes over a time range.",
  (coin, params) =>
    api().hyperliquid.l2Orderbook.diffs(coin, params as any),
  CoinParam,
  normalizeHLCoin
);

// ---------------------------------------------------------------------------
// Tool Registration — HIP-3 L4 Orders & Orderbook
// ---------------------------------------------------------------------------

// HIP-3 Order History
registerHistoryTool(
  "get_hip3_order_history",
  "Get HIP-3 order history with user attribution. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns order lifecycle events with user addresses.",
  (coin, params) =>
    api().hyperliquid.hip3.orders.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin,
  {
    user: UserParam,
    status: OrderStatusParam,
    order_type: OrderTypeParam,
  }
);

// HIP-3 Order Flow
registerTool(
  "get_hip3_order_flow",
  "Get HIP-3 order flow aggregation. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns aggregated order placement, cancellation, and fill metrics.",
  {
    coin: Hip3CoinParam,
    ...HistoryParams,
    interval: z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]).optional()
      .describe("Aggregation interval (default '1h')"),
  },
  ListOutputSchema,
  async (params) => {
    const { coin, start, end, limit, cursor, interval } = params;
    const timeRange = resolveTimeRange(start, end);
    const sdkParams: Record<string, unknown> = {
      ...timeRange,
      limit: resolveLimit(limit),
    };
    if (cursor) sdkParams.cursor = cursor;
    if (interval) sdkParams.interval = interval;
    const result = await api().hyperliquid.hip3.orders.flow(
      normalizeHip3Coin(coin),
      sdkParams as any
    );
    return formatCursorResponse(result);
  }
);

// HIP-3 TP/SL Orders
registerHistoryTool(
  "get_hip3_tpsl",
  "Get HIP-3 TP/SL order history. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns take-profit and stop-loss orders with trigger prices and triggered status.",
  (coin, params) =>
    api().hyperliquid.hip3.orders.tpsl(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin,
  {
    user: UserParam,
    triggered: TriggeredParam,
  }
);

// HIP-3 L4 Orderbook Reconstruction
registerTool(
  "get_hip3_l4_orderbook",
  "Get HIP-3 L4 orderbook reconstruction. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns full order-level orderbook at a specific timestamp.",
  {
    coin: Hip3CoinParam,
    timestamp: TimestampParam.describe("Timestamp for orderbook reconstruction (Unix ms or ISO)"),
    depth: DepthParam,
  },
  ObjectOutputSchema,
  async (params) => {
    const sdkParams: Record<string, unknown> = {};
    if (params.timestamp != null) sdkParams.timestamp = toUnixMs(params.timestamp);
    if (params.depth) sdkParams.depth = params.depth;
    const data = await api().hyperliquid.hip3.l4Orderbook.get(
      normalizeHip3Coin(params.coin),
      sdkParams as any
    );
    return formatResponse(data);
  }
);

// HIP-3 L4 Orderbook Diffs
registerHistoryTool(
  "get_hip3_l4_diffs",
  "Get HIP-3 L4 orderbook diffs. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns raw order-level changes over a time range.",
  (coin, params) =>
    api().hyperliquid.hip3.l4Orderbook.diffs(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// HIP-3 L4 Orderbook History (Checkpoints)
registerHistoryTool(
  "get_hip3_l4_orderbook_history",
  "Get HIP-3 L4 orderbook checkpoints. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns periodic full order-level orderbook snapshots.",
  (coin, params) =>
    api().hyperliquid.hip3.l4Orderbook.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// ---------------------------------------------------------------------------
// Tool Registration — HIP-3 L2 Full-Depth Orderbook
// ---------------------------------------------------------------------------

// HIP-3 L2 Orderbook Snapshot
registerTool(
  "get_hip3_l2_orderbook",
  "Get HIP-3 L2 full-depth orderbook. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns aggregated price levels. Derived from L4 data.",
  {
    coin: Hip3CoinParam,
    timestamp: TimestampParam.describe("Timestamp for historical state (Unix ms or ISO). Omit for current.").optional(),
    depth: DepthParam,
  },
  ObjectOutputSchema,
  async (params) => {
    const sdkParams: Record<string, unknown> = {};
    if (params.timestamp != null) sdkParams.timestamp = toUnixMs(params.timestamp);
    if (params.depth) sdkParams.depth = params.depth;
    const data = await api().hyperliquid.hip3.l2Orderbook.get(
      normalizeHip3Coin(params.coin),
      sdkParams as any
    );
    return formatResponse(data);
  }
);

// HIP-3 L2 Orderbook History
registerHistoryTool(
  "get_hip3_l2_orderbook_history",
  "Get HIP-3 L2 full-depth orderbook checkpoints. Symbols are CASE-SENSITIVE. Returns periodic aggregated snapshots.",
  (coin, params) =>
    api().hyperliquid.hip3.l2Orderbook.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin,
  { depth: DepthParam }
);

// HIP-3 L2 Diffs
registerHistoryTool(
  "get_hip3_l2_diffs",
  "Get HIP-3 L2 tick-level orderbook diffs. Symbols are CASE-SENSITIVE. Returns price-level changes.",
  (coin, params) =>
    api().hyperliquid.hip3.l2Orderbook.diffs(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// ---------------------------------------------------------------------------
// Tool Registration — Hyperliquid Spot
// ---------------------------------------------------------------------------
// Spot has no funding, no open interest, no liquidations, and no candles by
// design (those are perp-only constructs). Symbols are dashed canonical
// (HYPE-USDC); the server resolves to wire format internally.
// Coverage: trades from 2025-03-22; orderbook + L4 + TWAP live from 2026-05-05.

// Spot Pairs (list)
registerInstrumentsTool(
  "get_spot_pairs",
  "List all Hyperliquid Spot pairs with metadata (base/quote asset, wire symbol, asset index, decimals, latest mark/mid price, active status). 294 pairs available. Symbols are dashed canonical (e.g. 'HYPE-USDC', 'PURR-USDC'). Use this to discover valid spot pair symbols before querying other spot tools.",
  () => api().spot.pairs.list()
);

// Spot Pair (single)
registerCurrentTool(
  "get_spot_pair",
  "Get details for a single Hyperliquid Spot pair by dashed canonical symbol (e.g. 'HYPE-USDC'). Returns base/quote asset, wire symbol, asset index, decimals, latest mark/mid price, and active status.",
  (coin) => api().spot.pairs.get(coin),
  SpotCoinParam,
  normalizeSpotCoin
);

// Spot Orderbook (current)
registerOrderbookTool(
  "get_spot_orderbook",
  "Get the current Hyperliquid Spot L2 orderbook snapshot for a pair. Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns bids, asks, mid price, and spread. Optionally specify depth (price levels per side). Live from 2026-05-05. Full depth available on every tier.",
  (coin, params) => api().spot.orderbook.get(coin, params),
  SpotCoinParam,
  normalizeSpotCoin
);

// Spot Orderbook History
registerHistoryTool(
  "get_spot_orderbook_history",
  "Get historical Hyperliquid Spot L2 orderbook snapshots over a time range. Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns L2 snapshots with bids/asks. Live coverage from 2026-05-05 (no historical backfill before that date because Hyperliquid does not publish historical spot orderbook data). Full depth available on every tier.",
  (coin, params) =>
    api().spot.orderbook.history(coin, params as any),
  SpotCoinParam,
  normalizeSpotCoin,
  { depth: DepthParam }
);

// Spot Trades
registerHistoryTool(
  "get_spot_trades",
  "Get Hyperliquid Spot trade/fill history for a pair over a time range. Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns price, size, side, timestamps, and user addresses. S3 backfill from 2025-03-22 (the earliest published date); live since. Supports cursor pagination and optional user wallet filter.",
  (coin, params) =>
    api().spot.trades.list(coin, params as any),
  SpotCoinParam,
  normalizeSpotCoin,
  { user: UserParam }
);

// Spot Recent Trades
registerTool(
  "get_spot_trades_recent",
  "Get the most recent Hyperliquid Spot trades for a pair. Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns the latest trades without needing a time range. Live since 2026-05-05.",
  {
    coin: SpotCoinParam,
    limit: LimitParam,
  },
  ListOutputSchema,
  async (params) => {
    const data = await api().spot.trades.recent(
      normalizeSpotCoin(params.coin),
      params.limit
    );
    return formatResponse(data);
  }
);

// Spot Order History
registerHistoryTool(
  "get_spot_order_history",
  "Get Hyperliquid Spot order lifecycle events with user attribution. Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns placements, fills, cancellations, and modifications with user addresses. Live from 2026-05-05.",
  (coin, params) =>
    api().spot.orders.history(coin, params as any),
  SpotCoinParam,
  normalizeSpotCoin,
  {
    user: UserParam,
    status: OrderStatusParam,
    order_type: OrderTypeParam,
  }
);

// Spot L4 Orderbook (current reconstruction)
registerTool(
  "get_spot_l4_orderbook",
  "Get Hyperliquid Spot L4 orderbook reconstruction at a specific timestamp. Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns the full order-level orderbook with individual order IDs, user addresses, prices, and sizes. Live from 2026-05-05.",
  {
    coin: SpotCoinParam,
    timestamp: TimestampParam.describe("Timestamp for orderbook reconstruction (Unix ms or ISO)"),
    depth: DepthParam,
  },
  ObjectOutputSchema,
  async (params) => {
    const sdkParams: Record<string, unknown> = {};
    if (params.timestamp != null) sdkParams.timestamp = toUnixMs(params.timestamp);
    if (params.depth) sdkParams.depth = params.depth;
    const data = await api().spot.l4Orderbook.get(
      normalizeSpotCoin(params.coin),
      sdkParams as any
    );
    return formatResponse(data);
  }
);

// Spot L4 Orderbook Diffs
registerHistoryTool(
  "get_spot_l4_diffs",
  "Get Hyperliquid Spot L4 orderbook diffs. Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns raw order-level changes (new orders, modifications, cancellations, fills) over a time range. Live from 2026-05-05.",
  (coin, params) =>
    api().spot.l4Orderbook.diffs(coin, params as any),
  SpotCoinParam,
  normalizeSpotCoin
);

// Spot L4 Orderbook History / Checkpoints
registerHistoryTool(
  "get_spot_l4_orderbook_history",
  "Get Hyperliquid Spot L4 orderbook checkpoints. Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns periodic full order-level orderbook snapshots over a time range for reconstruction. Live from 2026-05-05.",
  (coin, params) =>
    api().spot.l4Orderbook.history(coin, params as any),
  SpotCoinParam,
  normalizeSpotCoin
);

// Spot TWAP by Symbol
registerHistoryTool(
  "get_spot_twap_by_symbol",
  "Get Hyperliquid Spot TWAP statuses for a single pair (every TWAP touching this pair). Symbols are dashed canonical (e.g. 'HYPE-USDC'). Returns timestamped TWAP status records with twap_id, user_address, side, size, filled_size, status, and execution metadata. Sourced from the L4 order stream. Live from 2026-05-05.",
  (coin, params) =>
    api().spot.twap.bySymbol(coin, params as any),
  SpotCoinParam,
  normalizeSpotCoin
);

// Spot TWAP by User
registerTool(
  "get_spot_twap_by_user",
  "Get Hyperliquid Spot TWAP statuses for a single user wallet across every spot pair. Returns timestamped TWAP status records with coin, twap_id, side, size, filled_size, status, and execution metadata. Sourced from the L4 order stream. Live from 2026-05-05.",
  {
    address: z.string().describe("User wallet address (e.g., '0x1234...')"),
    ...HistoryParams,
  },
  ListOutputSchema,
  async (params) => {
    const { address, start, end, limit, cursor } = params;
    const timeRange = resolveTimeRange(start, end);
    const sdkParams: Record<string, unknown> = {
      ...timeRange,
      limit: resolveLimit(limit),
    };
    if (cursor) sdkParams.cursor = cursor;
    const result = await api().spot.twap.byUser(address, sdkParams as any);
    return formatCursorResponse(result);
  }
);

// Spot Freshness
registerCurrentTool(
  "get_spot_freshness",
  "Get per-pair data freshness for Hyperliquid Spot across all data types (orderbook, trades, L4, TWAP). Symbols are dashed canonical (e.g. 'HYPE-USDC'). Shows when each data type was last updated and current lag.",
  (coin) => api().spot.freshness(coin),
  SpotCoinParam,
  normalizeSpotCoin
);

// ---------------------------------------------------------------------------
// Tool Registration — HIP-4 (Outcome Markets)
// ---------------------------------------------------------------------------
// SDK 1.4.0 has no `hip4` namespace. Until it lands, HIP-4 tools call the REST
// API directly via the same auth header the SDK uses.

const HIP4_BASE_URL = "https://api.0xarchive.io";
const HIP4_BASE_PATH = "/v1/hyperliquid/hip4";

async function hip4Request(
  path: string,
  query?: Record<string, unknown>
): Promise<{ data: unknown; nextCursor?: string }> {
  const url = new URL(`${HIP4_BASE_PATH}${path}`, HIP4_BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "0xarchive-mcp/1.9.4",
  };
  if (apiKey) headers["X-API-Key"] = apiKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!response.ok) {
      const requestId =
        response.headers.get("x-request-id") || body?.meta?.requestId;
      const message =
        (body && (body.error?.message || body.error || body.message)) ||
        `HTTP ${response.status}`;
      throw new OxArchiveError(message, response.status, requestId ?? undefined);
    }
    if (body && typeof body === "object" && "data" in body) {
      return {
        data: body.data,
        nextCursor: body.meta?.nextCursor,
      };
    }
    return { data: body };
  } finally {
    clearTimeout(timeout);
  }
}

function buildHistoryQuery(
  start?: number | string,
  end?: number | string,
  limit?: number,
  cursor?: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const range = resolveTimeRange(start, end);
  const q: Record<string, unknown> = {
    start: range.start,
    end: range.end,
    limit: resolveLimit(limit),
  };
  if (cursor) q.cursor = cursor;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) q[k] = v;
    }
  }
  return q;
}

// HIP-4 Instruments (list)
registerTool(
  "get_hip4_instruments",
  "List all available HIP-4 outcome-market instruments (one row per side, e.g. '0', '1'). HIP-4 coins use the bare numeric format '<10*outcome_id + side>' (legacy '#0' / '%230' forms also accepted). Use this to discover valid HIP-4 symbols.",
  {},
  ListOutputSchema,
  async () => {
    const result = await hip4Request("/instruments");
    return formatResponse(result.data);
  }
);

// HIP-4 Single Instrument
registerTool(
  "get_hip4_instrument",
  "Get details for a single HIP-4 instrument by coin symbol (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns per-side metadata including outcome_id, side, asset_id, name, recurring class/underlying/expiry, builder address, and is_settled status.",
  { coin: Hip4CoinParam },
  ObjectOutputSchema,
  async (params) => {
    const result = await hip4Request(`/instruments/${normalizeHip4Coin(params.coin)}`);
    return formatResponse(result.data);
  }
);

// HIP-4 Outcomes (list)
registerTool(
  "get_hip4_outcomes",
  "List HIP-4 outcome markets aggregated across both sides. Optionally filter by settlement status. Each outcome groups its '<10*id>' Yes / '<10*id+1>' No sides. Listen for the WebSocket `outcome_settled` event to get notified when an outcome resolves. The list response omits aggregated_oi; use get_hip4_outcome for the OI snapshot.",
  {
    is_settled: z
      .boolean()
      .optional()
      .describe("Filter by settlement status. Omit to return all outcomes."),
    limit: LimitParam,
    cursor: CursorParam,
  },
  ListOutputSchema,
  async (params) => {
    const q: Record<string, unknown> = {};
    if (params.is_settled !== undefined) q.is_settled = params.is_settled;
    if (params.limit) q.limit = resolveLimit(params.limit);
    if (params.cursor) q.cursor = params.cursor;
    const result = await hip4Request("/outcomes", q);
    return formatCursorResponse(result);
  }
);

// HIP-4 Single Outcome
registerTool(
  "get_hip4_outcome",
  "Get a single HIP-4 outcome by outcome_id. Returns the full Hip4OutcomeAggregate including aggregated_oi (latest both-sides OI snapshot, paired set supply, parity, and currency).",
  { outcome_id: Hip4OutcomeIdParam },
  ObjectOutputSchema,
  async (params) => {
    const result = await hip4Request(`/outcomes/${encodeURIComponent(String(params.outcome_id))}`);
    return formatResponse(result.data);
  }
);

// HIP-4 Orderbook (current)
registerTool(
  "get_hip4_orderbook",
  "Get the current HIP-4 L2 orderbook snapshot for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns bids and asks. Note: mark_price for HIP-4 is an implied probability (0..1), not a USD price.",
  {
    coin: Hip4CoinParam,
    depth: DepthParam,
  },
  ObjectOutputSchema,
  async (params) => {
    const q: Record<string, unknown> = {};
    if (params.depth) q.depth = params.depth;
    const result = await hip4Request(`/orderbook/${normalizeHip4Coin(params.coin)}`, q);
    return formatResponse(result.data);
  }
);

// HIP-4 Orderbook History
registerTool(
  "get_hip4_orderbook_history",
  "Get historical HIP-4 L2 orderbook snapshots for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns L2 snapshots over a time range.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
    depth: DepthParam,
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor, {
      depth: params.depth,
    });
    const result = await hip4Request(
      `/orderbook/${normalizeHip4Coin(params.coin)}/history`,
      q
    );
    return formatCursorResponse(result);
  }
);

// HIP-4 Trades
registerTool(
  "get_hip4_trades",
  "Get HIP-4 trade/fill history for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns price, size, side, and timestamps over a time range. Supports cursor pagination.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor);
    const result = await hip4Request(`/trades/${normalizeHip4Coin(params.coin)}`, q);
    return formatCursorResponse(result);
  }
);

// HIP-4 Recent Trades
registerTool(
  "get_hip4_trades_recent",
  "Get the most recent HIP-4 trades for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns the latest trades without needing a time range.",
  {
    coin: Hip4CoinParam,
    limit: LimitParam,
  },
  ListOutputSchema,
  async (params) => {
    const q: Record<string, unknown> = {};
    if (params.limit) q.limit = resolveLimit(params.limit);
    const result = await hip4Request(
      `/trades/${normalizeHip4Coin(params.coin)}/recent`,
      q
    );
    return formatResponse(result.data);
  }
);

// HIP-4 Open Interest (history)
registerTool(
  "get_hip4_open_interest",
  "Get HIP-4 per-side open interest history for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns timestamped OI snapshots; mark_price is an implied probability (0..1). For paired-set / display OI use get_hip4_outcome.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
    interval: AggregationIntervalParam,
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor, {
      interval: params.interval,
    });
    const result = await hip4Request(
      `/openinterest/${normalizeHip4Coin(params.coin)}`,
      q
    );
    return formatCursorResponse(result);
  }
);

// HIP-4 Open Interest (current)
registerTool(
  "get_hip4_open_interest_current",
  "Get the current HIP-4 per-side open interest for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns the latest OI row; mark_price is an implied probability (0..1). For paired-set / display OI use get_hip4_outcome.",
  { coin: Hip4CoinParam },
  ObjectOutputSchema,
  async (params) => {
    const result = await hip4Request(
      `/openinterest/${normalizeHip4Coin(params.coin)}/current`
    );
    return formatResponse(result.data);
  }
);

// HIP-4 Freshness
registerTool(
  "get_hip4_freshness",
  "Get HIP-4 data freshness for a coin (e.g. '0') across all available data types (orderbook, trades, OI, L4). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Shows when each data type was last updated and current lag.",
  { coin: Hip4CoinParam },
  ObjectOutputSchema,
  async (params) => {
    const result = await hip4Request(`/freshness/${normalizeHip4Coin(params.coin)}`);
    return formatResponse(result.data);
  }
);

// HIP-4 Summary
registerTool(
  "get_hip4_summary",
  "Get a combined HIP-4 24h market summary for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns price, volume, and OI aggregates. mark_price is an implied probability (0..1), not USD.",
  { coin: Hip4CoinParam },
  ObjectOutputSchema,
  async (params) => {
    const result = await hip4Request(`/summary/${normalizeHip4Coin(params.coin)}`);
    return formatResponse(result.data);
  }
);

// HIP-4 Prices
registerTool(
  "get_hip4_prices",
  "Get HIP-4 mid-price (implied probability, 0..1) history for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns timestamped price snapshots over a time range with cursor pagination.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
    interval: z
      .enum(["5m", "15m", "30m", "1h", "4h", "1d"])
      .optional()
      .describe("Aggregation interval: '5m', '15m', '30m', '1h', '4h', '1d'. Default '1h'"),
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor, {
      interval: params.interval,
    });
    const result = await hip4Request(`/prices/${normalizeHip4Coin(params.coin)}`, q);
    return formatCursorResponse(result);
  }
);

// HIP-4 Order History
registerTool(
  "get_hip4_order_history",
  "Get HIP-4 order lifecycle events with user attribution for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns placements, fills, cancellations, modifications.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
    user: UserParam,
    status: OrderStatusParam,
    order_type: OrderTypeParam,
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor, {
      user: params.user,
      status: params.status,
      order_type: params.order_type,
    });
    const result = await hip4Request(
      `/orders/${normalizeHip4Coin(params.coin)}/history`,
      q
    );
    return formatCursorResponse(result);
  }
);

// HIP-4 Order Flow
registerTool(
  "get_hip4_order_flow",
  "Get HIP-4 order flow aggregation for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns time-bucketed order placement, cancellation, and fill metrics.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
    interval: z
      .enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d"])
      .optional()
      .describe("Aggregation interval (default '1h')"),
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor, {
      interval: params.interval,
    });
    const result = await hip4Request(
      `/orders/${normalizeHip4Coin(params.coin)}/flow`,
      q
    );
    return formatCursorResponse(result);
  }
);

// HIP-4 TP/SL
registerTool(
  "get_hip4_tpsl",
  "Get HIP-4 TP/SL order history for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns take-profit and stop-loss orders with trigger prices and triggered status.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
    user: UserParam,
    triggered: TriggeredParam,
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor, {
      user: params.user,
      triggered: params.triggered,
    });
    const result = await hip4Request(
      `/orders/${normalizeHip4Coin(params.coin)}/tpsl`,
      q
    );
    return formatCursorResponse(result);
  }
);

// HIP-4 L4 Orderbook (current reconstruction)
registerTool(
  "get_hip4_l4_orderbook",
  "Get HIP-4 L4 orderbook reconstruction for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns the full order-level orderbook at a specific timestamp with individual order IDs, user addresses, prices, and sizes.",
  {
    coin: Hip4CoinParam,
    timestamp: TimestampParam.describe("Timestamp for orderbook reconstruction (Unix ms or ISO)"),
    depth: DepthParam,
  },
  ObjectOutputSchema,
  async (params) => {
    const q: Record<string, unknown> = {};
    if (params.timestamp != null) q.timestamp = toUnixMs(params.timestamp);
    if (params.depth) q.depth = params.depth;
    const result = await hip4Request(
      `/orderbook/${normalizeHip4Coin(params.coin)}/l4`,
      q
    );
    return formatResponse(result.data);
  }
);

// HIP-4 L4 Diffs
registerTool(
  "get_hip4_l4_diffs",
  "Get HIP-4 L4 orderbook diffs for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns raw order-level changes (new orders, modifications, cancellations, fills) over a time range.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor);
    const result = await hip4Request(
      `/orderbook/${normalizeHip4Coin(params.coin)}/l4/diffs`,
      q
    );
    return formatCursorResponse(result);
  }
);

// HIP-4 L4 Orderbook History (Checkpoints)
registerTool(
  "get_hip4_l4_orderbook_history",
  "Get HIP-4 L4 orderbook checkpoints for a coin (e.g. '0'). Bare numeric coins are canonical; legacy '#0' / '%230' forms are also accepted.Returns periodic full order-level snapshots. Hard cap limit=10 per request.",
  {
    coin: Hip4CoinParam,
    ...HistoryParams,
  },
  ListOutputSchema,
  async (params) => {
    const q = buildHistoryQuery(params.start, params.end, params.limit, params.cursor);
    const result = await hip4Request(
      `/orderbook/${normalizeHip4Coin(params.coin)}/l4/history`,
      q
    );
    return formatCursorResponse(result);
  }
);

// ---------------------------------------------------------------------------
// Tool Registration — Data Quality
// ---------------------------------------------------------------------------

const ExchangeParam = z
  .enum(["hyperliquid", "lighter", "hip3"])
  .optional()
  .describe("Venue scope");

const IncidentStatusParam = z
  .enum(["open", "investigating", "identified", "monitoring", "resolved"])
  .optional()
  .describe("Filter incidents by status");

// 30. System Status
registerTool(
  "get_data_quality_status",
  "Get the current system status for supported venue APIs and data types. Returns overall health (operational/degraded/outage), per-scope status with latency, per-data-type completeness, and active incident count.",
  {},
  ObjectOutputSchema,
  async () => {
    const data = await api().dataQuality.status();
    return formatResponse(data);
  }
);

// 30. Coverage Overview
registerTool(
  "get_data_coverage",
  "Get data coverage across supported venue APIs. Returns earliest/latest timestamps, total records, symbol count, resolution, lag, and completeness per data type per venue scope.",
  {},
  ObjectOutputSchema,
  async () => {
    const data = await api().dataQuality.coverage();
    return formatResponse(data);
  }
);

// Exchange Coverage
registerTool(
  "get_exchange_coverage",
  "Get data coverage for a specific venue scope. Returns earliest/latest timestamps, total records, symbol count, resolution, and completeness per data type.",
  {
    exchange: z.enum(["hyperliquid", "lighter", "hip3"]).describe("Venue scope"),
  },
  ObjectOutputSchema,
  async (params) => {
    const data = await api().dataQuality.exchangeCoverage(params.exchange);
    return formatResponse(data);
  }
);

// 31. Symbol Coverage
registerTool(
  "get_symbol_coverage",
  "Get detailed data coverage for a specific symbol on a venue scope. Returns per-data-type coverage with earliest/latest, total records, completeness, detected data gaps, and cadence metrics.",
  {
    exchange: z.enum(["hyperliquid", "lighter", "hip3"]).describe("Venue scope"),
    symbol: z.string().describe("Symbol, e.g. 'BTC', 'ETH', 'km:US500'"),
    from: TimestampParam.describe("Start of gap detection window (Unix ms or ISO). Defaults to 30 days ago."),
    to: TimestampParam.describe("End of gap detection window (Unix ms or ISO). Defaults to now."),
  },
  ObjectOutputSchema,
  async (params) => {
    const options: Record<string, unknown> = {};
    if (params.from != null) options.from = toUnixMs(params.from);
    if (params.to != null) options.to = toUnixMs(params.to);
    const data = await api().dataQuality.symbolCoverage(
      params.exchange,
      params.symbol,
      Object.keys(options).length > 0 ? options as any : undefined
    );
    return formatResponse(data);
  }
);

// 32. Incidents
registerTool(
  "get_data_incidents",
  "List data quality incidents (outages, gaps, degradations). Filter by status, exchange, or time. Returns incident details including severity, affected data types, duration, root cause, and resolution.",
  {
    status: IncidentStatusParam,
    exchange: ExchangeParam,
    since: TimestampParam.describe("Only incidents after this time (Unix ms or ISO)"),
    limit: z.number().optional().describe("Max results (default 20, max 100)"),
    offset: z.number().optional().describe("Pagination offset"),
  },
  ObjectOutputSchema,
  async (params) => {
    const sdkParams: Record<string, unknown> = {};
    if (params.status) sdkParams.status = params.status;
    if (params.exchange) sdkParams.exchange = params.exchange;
    if (params.since != null) sdkParams.since = typeof params.since === "string" ? toUnixMs(params.since) : params.since;
    if (params.limit) sdkParams.limit = params.limit;
    if (params.offset) sdkParams.offset = params.offset;
    const data = await api().dataQuality.listIncidents(
      Object.keys(sdkParams).length > 0 ? sdkParams as any : undefined
    );
    return formatResponse(data);
  }
);

// Incident by ID
registerTool(
  "get_incident",
  "Get a specific data quality incident by its ID. Returns full incident details including severity, affected data types, root cause, resolution, and timeline.",
  {
    id: z.string().describe("Incident ID (e.g., 'INC-2026-001')"),
  },
  ObjectOutputSchema,
  async (params) => {
    const data = await api().dataQuality.getIncident(params.id);
    return formatResponse(data);
  }
);

// 33. Latency
registerTool(
  "get_data_latency",
  "Get current latency metrics for supported venue APIs. Returns WebSocket latency (current, 1h avg, 24h avg), REST API latency, and data freshness lag per data type (orderbook, fills, funding, OI).",
  {},
  ObjectOutputSchema,
  async () => {
    const data = await api().dataQuality.latency();
    return formatResponse(data);
  }
);

// 34. SLA
registerTool(
  "get_data_sla",
  "Get SLA compliance report for a given month. Returns uptime, data completeness, API latency P99 — each with target vs actual and met/missed status. Also shows incident count and total downtime.",
  {
    year: z.number().optional().describe("Year (defaults to current year)"),
    month: z.number().optional().describe("Month 1-12 (defaults to current month)"),
  },
  ObjectOutputSchema,
  async (params) => {
    const sdkParams: Record<string, unknown> = {};
    if (params.year) sdkParams.year = params.year;
    if (params.month) sdkParams.month = params.month;
    const data = await api().dataQuality.sla(
      Object.keys(sdkParams).length > 0 ? sdkParams as any : undefined
    );
    return formatResponse(data);
  }
);

// ---------------------------------------------------------------------------
// Tool Registration — Web3 Authentication
// ---------------------------------------------------------------------------

// Web3 tools are NOT read-only (they create accounts/keys)
const AUTH_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

// Web3 challenge — works even without API key
server.registerTool(
  "web3_challenge",
  {
    description:
      "Get a SIWE (Sign-In with Ethereum) challenge message for a wallet address. " +
      "Required first step for web3_list_keys, web3_revoke_key, and web3_subscribe: the returned " +
      "message must be signed with personal_sign (EIP-191). " +
      "This does not create an account. Free wallet signup has been retired; sign up at " +
      "https://0xarchive.io for a free key, or use web3_subscribe for paid wallet access.",
    inputSchema: {
      address: z.string().describe("Ethereum wallet address (e.g., '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18')"),
    },
    outputSchema: ObjectOutputSchema,
    annotations: AUTH_TOOL_ANNOTATIONS,
  },
  async (params: any) => {
    // This tool works even without an API key — it calls the unauthenticated challenge endpoint
    try {
      if (client) {
        const data = await api().web3.challenge(params.address);
        return formatResponse(data);
      }
      // If no client, make a direct fetch
      const response = await fetch("https://api.0xarchive.io/v1/auth/web3/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: params.address }),
      });
      const data = await response.json();
      if (!response.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${data.error || "Challenge request failed"}` }],
          isError: true,
        };
      }
      return formatResponse(data);
    } catch (err) {
      const error = err instanceof OxArchiveError ? err : new OxArchiveError(String(err), 500);
      return formatError(error);
    }
  }
);

// web3_signup was removed in 1.9.3. Free wallet signup was retired server-side on
// 2026-07-21 and POST /v1/web3/signup now returns 410, so the tool could only ever
// fail. web3_challenge, web3_list_keys, web3_revoke_key and web3_subscribe all still
// work and are unchanged.

// Web3 list keys — works even without API key
server.registerTool(
  "web3_list_keys",
  {
    description:
      "List all API keys for a wallet. Requires a fresh SIWE challenge signed with personal_sign. " +
      "Returns key IDs, prefixes, active status, and last usage timestamps.",
    inputSchema: {
      message: z.string().describe("The SIWE message from web3_challenge"),
      signature: z.string().describe("Hex-encoded signature from personal_sign (0x-prefixed, 65 bytes)"),
    },
    outputSchema: ObjectOutputSchema,
    annotations: AUTH_TOOL_ANNOTATIONS,
  },
  async (params: any) => {
    try {
      if (client) {
        const data = await api().web3.listKeys(params.message, params.signature);
        return formatResponse(data);
      }
      const response = await fetch("https://api.0xarchive.io/v1/web3/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: params.message, signature: params.signature }),
      });
      const data = await response.json();
      if (!response.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${data.error || "List keys failed"}` }],
          isError: true,
        };
      }
      return formatResponse(data);
    } catch (err) {
      const error = err instanceof OxArchiveError ? err : new OxArchiveError(String(err), 500);
      return formatError(error);
    }
  }
);

// Web3 revoke key — works even without API key
server.registerTool(
  "web3_revoke_key",
  {
    description:
      "Revoke a specific API key. Requires a fresh SIWE challenge signed with personal_sign. " +
      "Use web3_list_keys first to get the key_id to revoke.",
    inputSchema: {
      message: z.string().describe("The SIWE message from web3_challenge"),
      signature: z.string().describe("Hex-encoded signature from personal_sign (0x-prefixed, 65 bytes)"),
      key_id: z.string().describe("UUID of the API key to revoke (from web3_list_keys)"),
    },
    outputSchema: ObjectOutputSchema,
    annotations: AUTH_TOOL_ANNOTATIONS,
  },
  async (params: any) => {
    try {
      if (client) {
        const data = await api().web3.revokeKey(params.message, params.signature, params.key_id);
        return formatResponse(data);
      }
      const response = await fetch("https://api.0xarchive.io/v1/web3/keys/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: params.message, signature: params.signature, key_id: params.key_id }),
      });
      const data = await response.json();
      if (!response.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${data.error || "Revoke key failed"}` }],
          isError: true,
        };
      }
      return formatResponse(data);
    } catch (err) {
      const error = err instanceof OxArchiveError ? err : new OxArchiveError(String(err), 500);
      return formatError(error);
    }
  }
);

// Web3 subscribe — x402 payment flow, works without API key
server.registerTool(
  "web3_subscribe",
  {
    description:
      "Subscribe to a paid tier (build or pro) using x402 USDC payment on Base.\n\n" +
      "TWO-STEP FLOW:\n" +
      "Step 1: Call with just tier (omit payment_signature) → returns 402 with payment details " +
      "(amount in micro-USDC, pay_to treasury address, network, asset_address).\n" +
      "Step 2: Sign a USDC EIP-3009 transferWithAuthorization, build the x402 v2 payment payload, " +
      "base64-encode it, and call again with payment_signature.\n\n" +
      "PAYMENT PAYLOAD FORMAT (x402 v2):\n" +
      "The payment_signature must be a base64-encoded JSON string with this exact structure:\n" +
      '{\n  "x402Version": 2,\n' +
      '  "payload": {\n' +
      '    "signature": "0x<130+ hex chars — EIP-712 signature>",\n' +
      '    "authorization": {\n' +
      '      "from": "0x<your wallet address>",\n' +
      '      "to": "0x<pay_to address from step 1>",\n' +
      '      "value": "<amount from step 1, as string e.g. \'49000000\'>",\n' +
      '      "validAfter": "0",\n' +
      '      "validBefore": "<unix timestamp ~1hr from now, as string>",\n' +
      '      "nonce": "0x<64 hex chars — 32 random bytes>"\n' +
      "    }\n  }\n}\n\n" +
      "EIP-712 SIGNING:\n" +
      "Domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }\n" +
      "Type: TransferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)\n" +
      "Sign the typed data, then hex-encode the 65-byte signature with 0x prefix.\n\n" +
      "IMPORTANT: All values inside authorization (value, validAfter, validBefore) must be STRINGS, not numbers.",
    inputSchema: {
      tier: z.enum(["build", "pro"]).describe("Subscription tier: 'build' ($49/mo) or 'pro' ($199/mo)"),
      payment_signature: z.string().optional().describe(
        "Base64-encoded x402 v2 payment payload JSON. " +
        "Omit on first call to get pricing (402 response). " +
        "On second call, provide base64(JSON) where JSON has: " +
        '{ "x402Version": 2, "payload": { "signature": "0x...", "authorization": { "from", "to", "value", "validAfter", "validBefore", "nonce" } } }. ' +
        "See tool description for full format."
      ),
    },
    outputSchema: ObjectOutputSchema,
    annotations: AUTH_TOOL_ANNOTATIONS,
  },
  async (params: any) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (params.payment_signature) {
        headers["payment-signature"] = params.payment_signature;
      }
      const response = await fetch("https://api.0xarchive.io/v1/web3/subscribe", {
        method: "POST",
        headers,
        body: JSON.stringify({ tier: params.tier }),
      });
      const data = await response.json();
      if (response.status === 402) {
        // Expected first-step response with pricing info
        return formatResponse(data);
      }
      if (!response.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${data.error || "Subscribe failed"}` }],
          isError: true,
        };
      }
      return formatResponse(data);
    } catch (err) {
      const error = err instanceof OxArchiveError ? err : new OxArchiveError(String(err), 500);
      return formatError(error);
    }
  }
);

// ---------------------------------------------------------------------------
// H. Server Startup + Graceful Shutdown
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();

  const shutdown = async () => {
    console.error("Shutting down...");
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.connect(transport);
  console.error("0xArchive MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

