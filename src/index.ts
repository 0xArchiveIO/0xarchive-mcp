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
  `API key not configured. To use 0xArchive tools:\n\n` +
  `1. Sign up at https://0xarchive.io and go to Dashboard to create an API key\n` +
  `2. Reconfigure the MCP server with your key:\n\n` +
  `   claude mcp remove 0xarchive\n` +
  `   claude mcp add 0xarchive -s user -t stdio -e OXARCHIVE_API_KEY=0xa_your_key -- node /path/to/build/index.js\n\n` +
  `3. Start a new Claude Code session\n\n` +
  `Free tier includes BTC historical data. Upgrade at https://0xarchive.io/pricing for all coins.`;

const server = new McpServer({
  name: "0xarchive",
  version: "1.0.0",
});

// All tools are read-only API queries to an external service
const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
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
    "HIP-3 coin symbol (CASE-SENSITIVE), e.g. 'km:US500', 'km:TSLA'. Use get_hip3_instruments to list available symbols."
  );

const LighterCoinParam = z
  .string()
  .describe("Lighter.xyz coin symbol, e.g. 'BTC', 'ETH'");

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
// C. Smart Defaults
// ---------------------------------------------------------------------------

function toUnixMs(ts: number | string): number {
  if (typeof ts === "number") return ts;
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

type McpContent = { content: Array<{ type: "text"; text: string }> };

function formatError(error: unknown): McpContent & { isError: true } {
  if (error instanceof OxArchiveError) {
    let text: string;

    switch (error.code) {
      case 403:
        text =
          `Access denied: ${error.message}\n\n` +
          `This endpoint may require a higher tier. Pricing:\n` +
          `  - Build: $49/mo — REST API, 25 WS subs, 50x replay\n` +
          `  - Pro: $199/mo — Full orderbook depth, 100 WS subs, 100x replay\n` +
          `  - Enterprise: $499/mo — Tick data, 200 WS subs, 1000x replay\n\n` +
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
            `Upgrade your plan to access more coins and features:\n` +
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
  return { content: [{ type: "text", text }] };
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

function normalizeLighterCoin(coin: string): string {
  return coin.toUpperCase();
}

// ---------------------------------------------------------------------------
// G. Tool Registration Helpers
// ---------------------------------------------------------------------------

function registerTool(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
  handler: (params: any) => Promise<McpContent>
): void {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
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
      } catch (error) {
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
  registerTool(name, description, {}, async () => {
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
  registerTool(name, description, { coin: coinSchema }, async (params) => {
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

  registerTool(name, description, schema, async (params) => {
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

// 2. Current Orderbook
registerOrderbookTool(
  "get_orderbook",
  "Get the current Hyperliquid L2 orderbook snapshot for a coin. Returns bids, asks, mid price, and spread. Optionally specify depth (price levels per side). Requires Pro tier or higher for full depth.",
  (coin, params) => api().hyperliquid.orderbook.get(coin, params),
  CoinParam,
  normalizeHLCoin
);

// 3. Orderbook History
registerHistoryTool(
  "get_orderbook_history",
  "Get historical Hyperliquid orderbook snapshots (~1.2s resolution). Returns L2 snapshots with bids/asks over a time range. Data available from April 2023. Requires Pro tier.",
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
  "Get Hyperliquid funding rate history for a coin over a time range. Returns timestamped funding rates and premiums. Data available from May 2023.",
  (coin, params) =>
    api().hyperliquid.funding.history(coin, params as any),
  CoinParam,
  normalizeHLCoin
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
  "Get Hyperliquid open interest history for a coin over a time range. Returns timestamped OI snapshots with mark/oracle prices. Data available from May 2023.",
  (coin, params) =>
    api().hyperliquid.openInterest.history(coin, params as any),
  CoinParam,
  normalizeHLCoin
);

// 10. Liquidations
registerHistoryTool(
  "get_liquidations",
  "Get Hyperliquid liquidation history for a coin over a time range. Returns liquidated/liquidator addresses, price, size, side, and PnL. Data available from April 2023.",
  (coin, params) =>
    api().hyperliquid.liquidations.history(coin, params as any),
  CoinParam,
  normalizeHLCoin
);

// ---------------------------------------------------------------------------
// Tool Registration — HIP-3
// ---------------------------------------------------------------------------

// 11. HIP-3 Instruments
registerInstrumentsTool(
  "get_hip3_instruments",
  "List all available HIP-3 builder perp instruments on Hyperliquid. HIP-3 symbols are CASE-SENSITIVE (e.g. 'km:US500', 'km:TSLA'). Use this to discover valid symbols before querying HIP-3 data.",
  () => api().hyperliquid.hip3.instruments.list()
);

// 12. HIP-3 Orderbook
registerOrderbookTool(
  "get_hip3_orderbook",
  "Get the current HIP-3 orderbook snapshot. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns bids, asks, mid price. Requires Pro tier for full depth.",
  (coin, params) => api().hyperliquid.hip3.orderbook.get(coin, params),
  Hip3CoinParam,
  normalizeHip3Coin
);

// 13. HIP-3 Trades
registerHistoryTool(
  "get_hip3_trades",
  "Get HIP-3 trade history. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns trades with price, size, side, and timestamps over a time range. Supports cursor pagination.",
  (coin, params) =>
    api().hyperliquid.hip3.trades.list(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// 14. HIP-3 Candles
registerCandleTool(
  "get_hip3_candles",
  "Get HIP-3 OHLCV candle data. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Intervals: 1m to 1w (default 1h). Returns open, high, low, close, volume.",
  (coin, params) =>
    api().hyperliquid.hip3.candles.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// 15. HIP-3 Funding
registerHistoryTool(
  "get_hip3_funding",
  "Get HIP-3 funding rate history. Symbols are CASE-SENSITIVE (e.g. 'km:US500'). Returns timestamped funding rates over a time range. Supports cursor pagination.",
  (coin, params) =>
    api().hyperliquid.hip3.funding.history(coin, params as any),
  Hip3CoinParam,
  normalizeHip3Coin
);

// ---------------------------------------------------------------------------
// Tool Registration — Lighter.xyz
// ---------------------------------------------------------------------------

// 16. Lighter Instruments
registerInstrumentsTool(
  "get_lighter_instruments",
  "List all available Lighter.xyz instruments with market IDs, fees, size/price decimals, and active status. Use this to discover valid Lighter symbols.",
  () => api().lighter.instruments.list()
);

// 17. Lighter Orderbook
registerOrderbookTool(
  "get_lighter_orderbook",
  "Get the current Lighter.xyz orderbook snapshot for a coin. Returns bids, asks, mid price, and spread. Optionally specify depth. Requires Pro tier for full depth.",
  (coin, params) => api().lighter.orderbook.get(coin, params),
  LighterCoinParam,
  normalizeLighterCoin
);

// 18. Lighter Trades
registerHistoryTool(
  "get_lighter_trades",
  "Get Lighter.xyz trade history for a coin over a time range. Returns price, size, side, and timestamps. Supports cursor pagination.",
  (coin, params) =>
    api().lighter.trades.list(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin
);

// 19. Lighter Candles
registerCandleTool(
  "get_lighter_candles",
  "Get Lighter.xyz OHLCV candle data for a coin. Intervals: 1m to 1w (default 1h). Returns open, high, low, close, volume.",
  (coin, params) =>
    api().lighter.candles.history(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin
);

// 20. Lighter Funding
registerHistoryTool(
  "get_lighter_funding",
  "Get Lighter.xyz funding rate history for a coin over a time range. Returns timestamped funding rates. Supports cursor pagination.",
  (coin, params) =>
    api().lighter.funding.history(coin, params as any),
  LighterCoinParam,
  normalizeLighterCoin
);

// ---------------------------------------------------------------------------
// Tool Registration — Data Quality
// ---------------------------------------------------------------------------

const ExchangeParam = z
  .string()
  .optional()
  .describe("Exchange name: 'hyperliquid', 'lighter', or 'hip3'");

const IncidentStatusParam = z
  .enum(["open", "investigating", "identified", "monitoring", "resolved"])
  .optional()
  .describe("Filter incidents by status");

// 21. System Status
registerTool(
  "get_data_quality_status",
  "Get the current system status for all exchanges and data types. Returns overall health (operational/degraded/outage), per-exchange status with latency, per-data-type completeness, and active incident count.",
  {},
  async () => {
    const data = await api().dataQuality.status();
    return formatResponse(data);
  }
);

// 22. Coverage Overview
registerTool(
  "get_data_coverage",
  "Get data coverage across all exchanges. Returns earliest/latest timestamps, total records, symbol count, resolution, lag, and completeness per data type per exchange.",
  {},
  async () => {
    const data = await api().dataQuality.coverage();
    return formatResponse(data);
  }
);

// 23. Symbol Coverage
registerTool(
  "get_symbol_coverage",
  "Get detailed data coverage for a specific symbol on an exchange. Returns per-data-type coverage with earliest/latest, total records, completeness, detected data gaps, and cadence metrics.",
  {
    exchange: z.string().describe("Exchange: 'hyperliquid', 'lighter', or 'hip3'"),
    symbol: z.string().describe("Symbol, e.g. 'BTC', 'ETH', 'km:US500'"),
    from: TimestampParam.describe("Start of gap detection window (Unix ms or ISO). Defaults to 30 days ago."),
    to: TimestampParam.describe("End of gap detection window (Unix ms or ISO). Defaults to now."),
  },
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

// 24. Incidents
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

// 25. Latency
registerTool(
  "get_data_latency",
  "Get current latency metrics for all exchanges. Returns WebSocket latency (current, 1h avg, 24h avg), REST API latency, and data freshness lag per data type (orderbook, fills, funding, OI).",
  {},
  async () => {
    const data = await api().dataQuality.latency();
    return formatResponse(data);
  }
);

// 26. SLA
registerTool(
  "get_data_sla",
  "Get SLA compliance report for a given month. Returns uptime, data completeness, API latency P99 — each with target vs actual and met/missed status. Also shows incident count and total downtime.",
  {
    year: z.number().optional().describe("Year (defaults to current year)"),
    month: z.number().optional().describe("Month 1-12 (defaults to current month)"),
  },
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
