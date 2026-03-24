import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNst } from "../lib/shell.js";

export function register(server: McpServer): void {
  server.tool(
    "nst_passwords_list",
    "List password entries (passwords not included for security). Supports search and tag filtering.",
    {
      query: z
        .string()
        .optional()
        .describe("Search query (matches title, username, url)"),
      tag: z.string().optional().describe("Filter by tag"),
    },
    async ({ query, tag }) => {
      const args = ["passwords", "list", "--json"];
      if (query) args.push("--query", query);
      if (tag) args.push("--tag", tag);
      return runNst(args);
    },
  );

  server.tool(
    "nst_passwords_get",
    "Get a specific password entry by title, username, URL, or UUID",
    {
      query: z
        .string()
        .describe("Entry title, username, URL, or UUID to look up"),
    },
    async ({ query }) =>
      runNst(["passwords", "get", query, "--json", "--no-copy"]),
  );

  server.tool(
    "nst_passwords_totp",
    "Generate a TOTP code for a password entry",
    {
      query: z
        .string()
        .describe(
          "Entry title, username, or UUID to generate TOTP code for",
        ),
    },
    async ({ query }) =>
      runNst(["passwords", "totp", query, "--json"]),
  );

  server.tool(
    "nst_passwords_generate",
    "Generate a random password",
    {
      length: z.number().optional().describe("Password length (default 20)"),
      no_symbols: z
        .boolean()
        .optional()
        .describe("Exclude symbols, alphanumeric only (default false)"),
    },
    async ({ length, no_symbols }) => {
      const args = ["passwords", "generate", "--json"];
      if (length) args.push("--length", length.toString());
      if (no_symbols) args.push("--no-symbols");
      return runNst(args);
    },
  );
}
