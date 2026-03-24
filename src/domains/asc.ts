import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAsc } from "../lib/shell.js";

export function register(server: McpServer): void {
  server.tool(
    "asc_run",
    "Run any asc (App Store Connect CLI) command. The --output json flag is appended automatically unless already present.",
    {
      command: z
        .string()
        .describe(
          "Full asc command arguments as a single string (e.g. 'builds list --app com.example.app')",
        ),
    },
    async ({ command }) => runAsc(command.split(/\s+/)),
  );

  server.tool(
    "asc_status",
    "Show comprehensive release pipeline dashboard for an app (builds, TestFlight, App Store, submission status)",
    {
      app: z
        .string()
        .describe(
          "App identifier: App Store Connect app ID, bundle ID, or exact app name",
        ),
      include: z
        .string()
        .optional()
        .describe(
          "Comma-separated sections: app,builds,testflight,appstore,submission,review,phased-release,links (default: all)",
        ),
    },
    async ({ app, include }) => {
      const args = ["status", "--app", app];
      if (include) args.push("--include", include);
      return runAsc(args);
    },
  );

  server.tool(
    "asc_builds_list",
    "List builds for an app in App Store Connect",
    {
      app: z.string().describe("App ID, bundle ID, or app name"),
      limit: z.number().optional().describe("Max results to return"),
    },
    async ({ app, limit }) => {
      const args = ["builds", "list", "--app", app];
      if (limit) args.push("--limit", limit.toString());
      return runAsc(args);
    },
  );

  server.tool(
    "asc_builds_latest",
    "Get the latest build for an app in App Store Connect",
    { app: z.string().describe("App ID, bundle ID, or app name") },
    async ({ app }) => runAsc(["builds", "latest", "--app", app]),
  );

  server.tool(
    "asc_testflight_groups_list",
    "List TestFlight beta groups for an app",
    { app: z.string().describe("App ID, bundle ID, or app name") },
    async ({ app }) =>
      runAsc(["testflight", "groups", "list", "--app", app]),
  );

  server.tool(
    "asc_submit_status",
    "Check App Store submission status for an app",
    { app: z.string().describe("App ID, bundle ID, or app name") },
    async ({ app }) => runAsc(["submit", "status", "--app", app]),
  );

  server.tool(
    "asc_versions_list",
    "List App Store versions for an app",
    {
      app: z.string().describe("App ID, bundle ID, or app name"),
      limit: z.number().optional().describe("Max results to return"),
    },
    async ({ app, limit }) => {
      const args = ["versions", "list", "--app", app];
      if (limit) args.push("--limit", limit.toString());
      return runAsc(args);
    },
  );

  server.tool(
    "asc_reviews_list",
    "List App Store customer reviews for an app",
    {
      app: z.string().describe("App ID, bundle ID, or app name"),
      stars: z.number().optional().describe("Filter by star rating (1-5)"),
      territory: z
        .string()
        .optional()
        .describe("Filter by territory (e.g. US, KR, JP)"),
      sort: z
        .string()
        .optional()
        .describe("Sort order (e.g. -createdDate for newest first)"),
      limit: z.number().optional().describe("Max results to return"),
    },
    async ({ app, stars, territory, sort, limit }) => {
      const args = ["reviews", "--app", app];
      if (stars) args.push("--stars", stars.toString());
      if (territory) args.push("--territory", territory);
      if (sort) args.push("--sort", sort);
      if (limit) args.push("--limit", limit.toString());
      return runAsc(args);
    },
  );

  server.tool(
    "asc_iap_list",
    "List in-app purchases for an app",
    { app: z.string().describe("App ID, bundle ID, or app name") },
    async ({ app }) => runAsc(["iap", "list", "--app", app]),
  );

  server.tool(
    "asc_subscriptions_list",
    "List subscription groups for an app",
    { app: z.string().describe("App ID, bundle ID, or app name") },
    async ({ app }) =>
      runAsc(["subscriptions", "list", "--app", app]),
  );
}
