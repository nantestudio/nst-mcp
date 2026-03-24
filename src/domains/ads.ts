import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNst } from "../lib/shell.js";

export function register(server: McpServer): void {
  server.tool(
    "nst_ads_copy_validate",
    'Validate ad copy JSON against Google Ads RSA character limits. Takes copy JSON with headlines/descriptions, checks char limits per language (CJK uses display-width). Claude Code should generate the copy itself, then use this tool to validate.',
    {
      copy_json: z
        .string()
        .describe(
          'Ad copy JSON with headlines and descriptions arrays. Each item needs "text" and "angle" fields.',
        ),
      lang: z
        .string()
        .optional()
        .describe("Language for char limit rules: en, ko, ja, zh (default en)"),
      strict: z
        .boolean()
        .optional()
        .describe(
          "Fail if any character limit violations found (default false)",
        ),
    },
    async ({ copy_json, lang, strict }) => {
      const args = ["ads", "copy", "validate", "--json"];
      if (lang) args.push("--lang", lang);
      if (strict) args.push("--strict");
      return runNst(args, { stdin: copy_json });
    },
  );

  server.tool(
    "nst_ads_copy_save",
    "Save validated ad copy JSON to a file. Use after nst_ads_copy_validate to persist the results.",
    {
      copy_json: z
        .string()
        .describe(
          "Ad copy JSON to save (validated output from nst_ads_copy_validate)",
        ),
      file: z
        .string()
        .describe("Output file path (e.g. ads-copy-braintalk.json)"),
    },
    async ({ copy_json, file }) =>
      runNst(["ads", "copy", "save", "--file", file], { stdin: copy_json }),
  );

  server.tool(
    "nst_ads_generate_image",
    "Generate ad images with AI backgrounds and programmatic text compositing. Exports to all Google Ads sizes.",
    {
      app: z
        .string()
        .optional()
        .describe("App name (auto-detected from context if omitted)"),
      image_model: z
        .string()
        .optional()
        .describe("Image model: gpt-image-1, flux-pro, flux-dev"),
      style: z
        .string()
        .optional()
        .describe("Visual style (e.g. warm, vibrant, minimal)"),
      variants: z
        .number()
        .optional()
        .describe("Number of background variants (default 3)"),
      sizes: z
        .string()
        .optional()
        .describe(
          "Size set: responsive, static, or all (default responsive)",
        ),
      headline: z
        .string()
        .optional()
        .describe("Headline text for the ad"),
      cta: z
        .string()
        .optional()
        .describe("CTA button text (default 'Download Free')"),
    },
    async ({ app, image_model, style, variants, sizes, headline, cta }) => {
      const args = ["ads", "generate", "image"];
      if (app) args.push("--app", app);
      if (image_model) args.push("--image-model", image_model);
      if (style) args.push("--style", style);
      if (variants) args.push("--variants", variants.toString());
      if (sizes) args.push("--sizes", sizes);
      if (headline) args.push("--headline", headline);
      if (cta) args.push("--cta", cta);
      return runNst(args, { timeout: 120_000 });
    },
  );

  server.tool(
    "nst_ads_context_show",
    "Show the resolved app context used for ad generation. Returns app name, description, brand config, target personas, and feature mappings.",
    {},
    async () => runNst(["ads", "generate", "context", "show", "--json"]),
  );

  server.tool(
    "nst_ads_links_create",
    "Create batch tracked links with UTM parameters for ad campaigns.",
    {
      app: z.string().describe("App name (used in link key prefix)"),
      campaign: z
        .string()
        .describe("Campaign name (used in UTM params and link tags)"),
      url: z
        .string()
        .describe("Destination URL (e.g. Play Store listing)"),
      variants: z
        .number()
        .optional()
        .describe("Number of tracked link variants (default 1)"),
      utm_source: z
        .string()
        .optional()
        .describe("UTM source (defaults to campaign name)"),
      utm_medium: z
        .string()
        .optional()
        .describe("UTM medium (defaults to 'cpc')"),
      ios_url: z.string().optional().describe("iOS-specific redirect URL"),
      android_url: z
        .string()
        .optional()
        .describe("Android-specific redirect URL"),
    },
    async ({
      app,
      campaign,
      url,
      variants,
      utm_source,
      utm_medium,
      ios_url,
      android_url,
    }) => {
      const args = [
        "ads",
        "links",
        "create",
        "--app",
        app,
        "--campaign",
        campaign,
        "--url",
        url,
      ];
      if (variants) args.push("--variants", variants.toString());
      if (utm_source) args.push("--utm-source", utm_source);
      if (utm_medium) args.push("--utm-medium", utm_medium);
      if (ios_url) args.push("--ios-url", ios_url);
      if (android_url) args.push("--android-url", android_url);
      return runNst(args);
    },
  );
}
