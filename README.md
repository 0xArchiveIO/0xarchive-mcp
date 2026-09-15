# 0xArchive MCP

Hyperliquid and Lighter market data for MCP clients. Read order books, trades, candles, funding, open interest, and data coverage through the hosted server.

## Connect

Add this URL as a remote MCP server in a client that supports **Streamable HTTP and OAuth**:

```text
https://mcp.0xarchive.io/mcp
```

Sign in to 0xArchive through the client's OAuth flow and approve `mcp:market.read`. No 0xArchive API key or local server installation is required.

### Claude Code

```bash
claude mcp add --transport http 0xarchive https://mcp.0xarchive.io/mcp
```

Complete the client's OAuth sign-in when prompted. For other clients and connection troubleshooting, see the [MCP setup guide](https://docs.0xarchive.io/mcp-server).

## Try a first request

- “Get a BTC market summary on Hyperliquid.”
- “Fetch ETH one-hour Hyperliquid candles for the last 24 hours.”
- “Fetch current BTC funding separately for Hyperliquid and Lighter. Report each source's units and timestamp.”
- “Show recent data incidents or coverage gaps.”

The tools read market data; they do not place orders or change account settings. Review the discovered tools before enabling them in your client.

## Documentation and support

- [MCP setup and tool examples](https://docs.0xarchive.io/mcp-server)
- [API documentation](https://docs.0xarchive.io)
- [Service status](https://0xarchive.io/status)
- [Report a connection or documentation issue](https://github.com/0xArchiveIO/0xarchive-mcp/issues)
- [Contact 0xArchive](https://0xarchive.io/contact)

Do not include access tokens, API keys, or private account information in prompts or public issues.
