#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { domains } from "./domains/index.js";

const server = new McpServer({
  name: "nst-mcp",
  version: "0.1.0",
});

// Register all domain tools
for (const register of domains) {
  register(server);
}

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
