import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNst } from "../lib/shell.js";

export function register(server: McpServer): void {
  server.tool(
    "nst_play_status",
    "Get release status across all Google Play tracks for an app",
    {
      package: z
        .string()
        .optional()
        .describe(
          "Android package name (e.g. com.nantestudio.braintalk). Auto-detected if omitted.",
        ),
      account: z
        .string()
        .optional()
        .describe(
          "Vault project for service account (default: braintalk). Use 'andyleeboo' for individual account.",
        ),
    },
    async ({ package: pkg, account }) => {
      const args = ["play", "status", "--json"];
      if (pkg) args.push("--package", pkg);
      if (account) args.push("--account", account);
      return runNst(args);
    },
  );

  server.tool(
    "nst_play_releases",
    "List releases for a specific Google Play track",
    {
      package: z
        .string()
        .optional()
        .describe("Android package name. Auto-detected if omitted."),
      account: z
        .string()
        .optional()
        .describe("Vault project for service account (default: braintalk)"),
      track: z
        .string()
        .optional()
        .describe(
          "Track name: internal, alpha, beta, production (default production)",
        ),
    },
    async ({ package: pkg, account, track }) => {
      const args = ["play", "releases", "list", "--json"];
      if (pkg) args.push("--package", pkg);
      if (account) args.push("--account", account);
      if (track) args.push("--track", track);
      return runNst(args);
    },
  );

  server.tool(
    "nst_play_reviews",
    "Get recent user reviews from Google Play",
    {
      package: z
        .string()
        .optional()
        .describe("Android package name. Auto-detected if omitted."),
      account: z
        .string()
        .optional()
        .describe("Vault project for service account (default: braintalk)"),
      limit: z
        .number()
        .optional()
        .describe("Max number of reviews (default 20)"),
    },
    async ({ package: pkg, account, limit }) => {
      const args = ["play", "reviews", "list", "--json"];
      if (pkg) args.push("--package", pkg);
      if (account) args.push("--account", account);
      if (limit) args.push("--limit", limit.toString());
      return runNst(args);
    },
  );

  server.tool(
    "nst_play_upload",
    "Upload an AAB to Google Play and assign to a track",
    {
      aab_path: z.string().describe("Absolute path to the AAB file"),
      track: z
        .string()
        .describe("Track to assign: internal, alpha, beta, production"),
      package: z
        .string()
        .optional()
        .describe("Android package name. Auto-detected if omitted."),
      account: z
        .string()
        .optional()
        .describe("Vault project for service account (default: braintalk)"),
      notes: z
        .string()
        .optional()
        .describe("Release notes text (en-US)"),
    },
    async ({ aab_path, track, package: pkg, account, notes }) => {
      const args = ["play", "upload", aab_path, "--track", track, "--json"];
      if (pkg) args.push("--package", pkg);
      if (account) args.push("--account", account);
      if (notes) args.push("--notes", notes);
      return runNst(args, { timeout: 120_000 });
    },
  );
}
