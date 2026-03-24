import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNst } from "../lib/shell.js";

export function register(server: McpServer): void {
  server.tool(
    "nst_analytics_events",
    "Query recent analytics events from nante-analytics",
    {
      app: z
        .string()
        .optional()
        .describe("Filter by app ID (e.g. braintalk, holowork)"),
      event_type: z
        .string()
        .optional()
        .describe(
          "Filter by event type (e.g. game_complete, pomodoro_started)",
        ),
      days: z
        .number()
        .optional()
        .describe("Number of days to look back (default 7)"),
      limit: z.number().optional().describe("Max results (default 50)"),
    },
    async ({ app, event_type, days, limit }) => {
      const args = ["analytics", "events", "--json"];
      if (app) args.push("--app", app);
      if (event_type) args.push("--type", event_type);
      if (days) args.push("--days", days.toString());
      if (limit) args.push("--limit", limit.toString());
      return runNst(args);
    },
  );

  server.tool(
    "nst_analytics_dau",
    "Get daily active users per app from nante-analytics",
    {
      app: z
        .string()
        .optional()
        .describe("Filter by app ID (e.g. braintalk, holowork)"),
      days: z.number().optional().describe("Number of days (default 30)"),
    },
    async ({ app, days }) => {
      const args = ["analytics", "dau", "--json"];
      if (app) args.push("--app", app);
      if (days) args.push("--days", days.toString());
      return runNst(args);
    },
  );

  server.tool(
    "nst_analytics_summary",
    "Get analytics overview across all apps from nante-analytics",
    {
      app: z
        .string()
        .optional()
        .describe("Filter by app ID (e.g. braintalk, holowork)"),
    },
    async ({ app }) => {
      const args = ["analytics", "summary", "--json"];
      if (app) args.push("--app", app);
      return runNst(args);
    },
  );

  server.tool(
    "nst_analytics_top_events",
    "Get most common event types from nante-analytics",
    {
      app: z
        .string()
        .optional()
        .describe("Filter by app ID (e.g. braintalk, holowork)"),
      days: z.number().optional().describe("Number of days (default 7)"),
      limit: z.number().optional().describe("Max results (default 10)"),
    },
    async ({ app, days, limit }) => {
      const args = ["analytics", "top-events", "--json"];
      if (app) args.push("--app", app);
      if (days) args.push("--days", days.toString());
      if (limit) args.push("--limit", limit.toString());
      return runNst(args);
    },
  );

  server.tool(
    "nst_analytics_query",
    "Run a read-only SQL query against the analytics database. Tables: events (id, app_id, event_type, anonymous_id, session_id, timestamp, properties, platform, os_version, app_version, locale, ingested_at), daily_stats (date, app_id, event_type, event_count, unique_users). Only SELECT queries allowed.",
    {
      sql: z.string().describe("Read-only SQL query"),
    },
    async ({ sql }) => runNst(["analytics", "query", sql, "--json"]),
  );
}
