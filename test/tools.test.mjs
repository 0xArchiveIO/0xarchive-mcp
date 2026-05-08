import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(here, "..", "build", "index.js");

async function withClient(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry],
    env: { ...process.env, OXARCHIVE_API_KEY: "0xa_test_key_for_schema_validation_only" },
  });
  const client = new Client({ name: "0xarchive-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test("MCP server lists 111 tools at version 1.9.0", async () => {
  await withClient(async (client) => {
    const info = client.getServerVersion();
    assert.equal(info?.name, "0xarchive");
    assert.equal(info?.version, "1.9.0");

    const { tools } = await client.listTools();
    assert.equal(tools.length, 111, `expected 111 tools, got ${tools.length}`);
  });
});

test("HIP-4 mirror tools are registered", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));

    const expected = [
      "get_hip4_instruments",
      "get_hip4_instrument",
      "get_hip4_outcomes",
      "get_hip4_outcome",
      "get_hip4_orderbook",
      "get_hip4_orderbook_history",
      "get_hip4_trades",
      "get_hip4_trades_recent",
      "get_hip4_open_interest",
      "get_hip4_open_interest_current",
      "get_hip4_freshness",
      "get_hip4_summary",
      "get_hip4_prices",
      "get_hip4_order_history",
      "get_hip4_order_flow",
      "get_hip4_tpsl",
      "get_hip4_l4_orderbook",
      "get_hip4_l4_diffs",
      "get_hip4_l4_orderbook_history",
    ];
    for (const name of expected) {
      assert.ok(names.has(name), `missing HIP-4 tool: ${name}`);
    }
  });
});

test("HIP-4 explicitly excluded tools are NOT registered", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));

    const excluded = [
      "get_hip4_candles",
      "get_hip4_funding",
      "get_hip4_funding_current",
      "get_hip4_funding_history",
      "get_hip4_liquidations",
      "get_hip4_liquidation_volume",
    ];
    for (const name of excluded) {
      assert.ok(!names.has(name), `tool should NOT exist: ${name}`);
    }
  });
});

test("get_hip4_outcomes input schema accepts is_settled filter", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_hip4_outcomes");
    assert.ok(tool, "get_hip4_outcomes not found");
    const schema = tool.inputSchema;
    assert.equal(schema.type, "object");
    assert.ok(schema.properties.is_settled, "is_settled property missing");
    assert.equal(schema.properties.is_settled.type, "boolean");
    assert.ok(schema.properties.limit, "limit property missing");
    assert.ok(schema.properties.cursor, "cursor property missing");
  });
});

test("get_hip4_orderbook input schema requires coin and accepts depth", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_hip4_orderbook");
    assert.ok(tool, "get_hip4_orderbook not found");
    const schema = tool.inputSchema;
    assert.equal(schema.type, "object");
    assert.ok(schema.properties.coin, "coin property missing");
    assert.equal(schema.properties.coin.type, "string");
    assert.ok(
      Array.isArray(schema.required) && schema.required.includes("coin"),
      "coin should be required"
    );
    assert.ok(schema.properties.depth, "depth property missing");
    const desc = (tool.description ?? "").toLowerCase();
    assert.ok(
      desc.includes("bare numeric") || desc.includes("%23") || desc.includes("url-encoded"),
      "description should explain HIP-4 coin format (bare numeric, with legacy '#' / '%23' fallback)"
    );
    assert.ok(desc.includes("probability"),
      "orderbook description should note mark_price is implied probability for HIP-4");
  });
});

test("get_liquidations description mentions realtime WebSocket channel", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const hl = tools.find((t) => t.name === "get_liquidations");
    const hip3 = tools.find((t) => t.name === "get_hip3_liquidations");
    assert.ok(hl, "get_liquidations not found");
    assert.ok(hip3, "get_hip3_liquidations not found");
    assert.ok(/liquidations` channel/i.test(hl.description ?? ""),
      "get_liquidations should mention the realtime `liquidations` channel");
    assert.ok(/hip3_liquidations` channel/i.test(hip3.description ?? ""),
      "get_hip3_liquidations should mention the realtime `hip3_liquidations` channel");
  });
});

test("get_hip4_outcomes description mentions outcome_settled event", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_hip4_outcomes");
    assert.ok(tool, "get_hip4_outcomes not found");
    assert.ok(/outcome_settled/i.test(tool.description ?? ""),
      "get_hip4_outcomes should mention the WebSocket `outcome_settled` event");
  });
});

test("Spot tools are registered", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));

    const expected = [
      "get_spot_pairs",
      "get_spot_pair",
      "get_spot_orderbook",
      "get_spot_orderbook_history",
      "get_spot_trades",
      "get_spot_trades_recent",
      "get_spot_order_history",
      "get_spot_l4_orderbook",
      "get_spot_l4_diffs",
      "get_spot_l4_orderbook_history",
      "get_spot_twap_by_symbol",
      "get_spot_twap_by_user",
      "get_spot_freshness",
    ];
    for (const name of expected) {
      assert.ok(names.has(name), `missing Spot tool: ${name}`);
    }
  });
});

test("Spot explicitly excluded tools are NOT registered", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));

    const excluded = [
      "get_spot_candles",
      "get_spot_funding",
      "get_spot_funding_current",
      "get_spot_funding_history",
      "get_spot_open_interest",
      "get_spot_open_interest_history",
      "get_spot_liquidations",
      "get_spot_liquidation_volume",
      "get_spot_instruments",
      "get_spot_transfers",
    ];
    for (const name of excluded) {
      assert.ok(!names.has(name), `tool should NOT exist: ${name}`);
    }
  });
});

test("get_spot_orderbook input schema requires coin and accepts depth", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_spot_orderbook");
    assert.ok(tool, "get_spot_orderbook not found");
    const schema = tool.inputSchema;
    assert.equal(schema.type, "object");
    assert.ok(schema.properties.coin, "coin property missing");
    assert.equal(schema.properties.coin.type, "string");
    assert.ok(
      Array.isArray(schema.required) && schema.required.includes("coin"),
      "coin should be required"
    );
    assert.ok(schema.properties.depth, "depth property missing");
    const desc = (tool.description ?? "").toLowerCase();
    assert.ok(
      desc.includes("dashed") || desc.includes("hype-usdc"),
      "description should explain dashed canonical spot symbol format"
    );
  });
});

test("get_spot_twap_by_user input schema requires address", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_spot_twap_by_user");
    assert.ok(tool, "get_spot_twap_by_user not found");
    const schema = tool.inputSchema;
    assert.equal(schema.type, "object");
    assert.ok(schema.properties.address, "address property missing");
    assert.ok(
      Array.isArray(schema.required) && schema.required.includes("address"),
      "address should be required"
    );
  });
});

test("get_hip4_outcome input schema requires outcome_id", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_hip4_outcome");
    assert.ok(tool, "get_hip4_outcome not found");
    const schema = tool.inputSchema;
    assert.equal(schema.type, "object");
    assert.ok(schema.properties.outcome_id, "outcome_id property missing");
    assert.ok(
      Array.isArray(schema.required) && schema.required.includes("outcome_id"),
      "outcome_id should be required"
    );
    const desc = (tool.description ?? "").toLowerCase();
    assert.ok(desc.includes("aggregated_oi"),
      "description should mention aggregated_oi");
  });
});
