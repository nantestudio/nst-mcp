import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNst } from "../lib/shell.js";

export function register(server: McpServer): void {
  server.tool(
    "nst_appstore_apps_list",
    "List all apps in App Store Connect",
    {},
    async () => runNst(["appstore", "apps", "list", "--json"]),
  );

  server.tool(
    "nst_appstore_apps_get",
    "Get app details from App Store Connect by bundle ID",
    {
      bundle_id: z
        .string()
        .describe("Bundle ID (e.g. com.nantestudio.piximo)"),
    },
    async ({ bundle_id }) =>
      runNst(["appstore", "apps", "get", "--bundle-id", bundle_id, "--json"]),
  );

  server.tool(
    "nst_appstore_screenshots_generate",
    "Generate store listing screenshots with AI captions and device frames (iOS/Android, multi-locale)",
    {
      input: z
        .string()
        .optional()
        .describe(
          "Path to directory containing raw screenshots. Auto-detected if omitted.",
        ),
      output: z
        .string()
        .optional()
        .describe(
          "Output directory for composited screenshots (default: ./screenshots-output)",
        ),
      locales: z
        .string()
        .optional()
        .describe(
          "Comma-separated locale codes for captions (e.g. en-US,ko,ja). Default: en-US",
        ),
      platform: z
        .string()
        .optional()
        .describe("Platform: ios or android (auto-detected if omitted)"),
      bundle_id: z
        .string()
        .optional()
        .describe("Bundle ID for app context (auto-detected if omitted)"),
      bg_color: z
        .string()
        .optional()
        .describe("Background color hex (e.g. #1a1a2e). Overrides style preset."),
      caption_color: z
        .string()
        .optional()
        .describe("Caption text color hex (e.g. #ffffff). Overrides style preset."),
      frame_color: z
        .string()
        .optional()
        .describe(
          "Device frame color: black, silver, gold, or hex. Overrides style preset.",
        ),
      style: z
        .string()
        .optional()
        .describe(
          "Style preset name (from nst appstore screenshots style list)",
        ),
      no_ai: z
        .boolean()
        .optional()
        .describe(
          "Skip AI caption generation and use existing manifest captions",
        ),
    },
    async (params) => {
      const args = ["appstore", "screenshots", "generate"];
      if (params.input) args.push("--input", params.input);
      if (params.output) args.push("--output", params.output);
      if (params.locales) args.push("--locales", params.locales);
      if (params.platform) args.push("--platform", params.platform);
      if (params.bundle_id) args.push("--bundle-id", params.bundle_id);
      if (params.bg_color) args.push("--bg-color", params.bg_color);
      if (params.caption_color)
        args.push("--caption-color", params.caption_color);
      if (params.frame_color) args.push("--frame-color", params.frame_color);
      if (params.style) args.push("--style", params.style);
      if (params.no_ai) args.push("--no-ai");
      return runNst(args, { timeout: 120_000 });
    },
  );

  server.tool(
    "nst_appstore_screenshots_style_list",
    "List available screenshot style presets",
    {},
    async () =>
      runNst(["appstore", "screenshots", "style", "list", "--json"]),
  );
}
