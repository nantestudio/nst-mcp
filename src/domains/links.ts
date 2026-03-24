import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNst } from "../lib/shell.js";

export function register(server: McpServer): void {
  server.tool(
    "nst_links_list",
    "List links from Nante Links. Supports filtering by tag or search query.",
    {
      tag: z.string().optional().describe("Filter by tag name"),
      query: z
        .string()
        .optional()
        .describe("Search query (matches key and title)"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results (default 20, max 100)"),
    },
    async ({ tag, query, limit }) => {
      const args = ["links", "list", "--json"];
      if (tag) args.push("--tag", tag);
      if (query) args.push("--query", query);
      if (limit) args.push("--limit", limit.toString());
      return runNst(args);
    },
  );

  server.tool(
    "nst_links_create",
    "Create a new short link. Requires a destination URL. Returns the short URL.",
    {
      url: z.string().describe("Destination URL (required)"),
      key: z
        .string()
        .optional()
        .describe("Custom short key (auto-generated if omitted)"),
      title: z.string().optional().describe("Link title"),
      tags: z
        .string()
        .optional()
        .describe("Tags as comma-separated string"),
      ios_url: z.string().optional().describe("iOS-specific redirect URL"),
      android_url: z
        .string()
        .optional()
        .describe("Android-specific redirect URL"),
    },
    async ({ url, key, title, tags, ios_url, android_url }) => {
      const args = ["links", "create", "--url", url, "--json"];
      if (key) args.push("--key", key);
      if (title) args.push("--title", title);
      if (tags) args.push("--tags", tags);
      if (ios_url) args.push("--ios-url", ios_url);
      if (android_url) args.push("--android-url", android_url);
      return runNst(args);
    },
  );

  server.tool(
    "nst_links_get",
    "Get detailed information about a link by its key or UUID.",
    { key: z.string().describe("Link key or UUID") },
    async ({ key }) => runNst(["links", "get", key, "--json"]),
  );

  server.tool(
    "nst_links_analytics",
    "Query link analytics. Metrics: summary, countries, platforms, timeseries, referrers. Range: 1d, 7d, 30d, 90d.",
    {
      metric: z
        .string()
        .describe(
          "Metric type: summary, countries, platforms, timeseries, or referrers",
        ),
      range: z
        .string()
        .optional()
        .describe("Time range: 1d, 7d, 30d, or 90d (default 7d)"),
      link_key: z.string().optional().describe("Filter by link key"),
      limit: z
        .number()
        .optional()
        .describe("Maximum results for countries/referrers (default 20)"),
    },
    async ({ metric, range, link_key, limit }) => {
      const args = ["links", "analytics", metric, "--json"];
      if (range) args.push("--range", range);
      if (link_key) args.push("--link-key", link_key);
      if (limit) args.push("--limit", limit.toString());
      return runNst(args);
    },
  );
}
