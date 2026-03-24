import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleOAuth } from "../lib/oauth.js";
import { runNst } from "../lib/shell.js";

let oauth: GoogleOAuth | null = null;
let defaultPublisherId: string | null = null;

async function init(): Promise<void> {
  if (oauth) return;
  try {
    const [oauthInstance, pubId] = await Promise.all([
      GoogleOAuth.fromVault(),
      getPublisherIdFromVault(),
    ]);
    oauth = oauthInstance;
    defaultPublisherId = pubId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `Warning: AdMob tools unavailable (${msg}). Set GOOGLE_ADS_* secrets in vault (nantestudio/prd).\n`,
    );
  }
}

async function getPublisherIdFromVault(): Promise<string | null> {
  try {
    const result = await runNst([
      "vault",
      "secrets",
      "get",
      "ADMOB_PUBLISHER_ID",
      "-p",
      "nantestudio",
      "-e",
      "prd",
    ]);
    return result.content[0].text.trim();
  } catch {
    return null;
  }
}

function resolvePublisherId(provided?: string): string {
  const id = provided || defaultPublisherId;
  if (!id)
    throw new Error(
      "AdMob publisher ID not provided and ADMOB_PUBLISHER_ID not found in vault (nantestudio/prd).",
    );
  return id;
}

async function admobRequest(
  method: string,
  path: string,
  body?: object,
): Promise<string> {
  if (!oauth)
    throw new Error(
      "AdMob not configured. Set GOOGLE_ADS_* OAuth secrets in vault (nantestudio/prd).",
    );

  const token = await oauth.getAccessToken();
  const url = `https://admob.googleapis.com/v1/${path}`;

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AdMob API error (${resp.status}): ${text}`);
  }

  return resp.text();
}

function text(data: string): {
  content: Array<{ type: "text"; text: string }>;
  [key: string]: unknown;
} {
  return { content: [{ type: "text" as const, text: data }] };
}

export function register(server: McpServer): void {
  const ensureInit = async () => {
    await init();
  };

  server.tool(
    "nst_admob_apps",
    "List all apps registered in AdMob. Publisher ID auto-loaded from vault if not provided.",
    {
      publisher_id: z
        .string()
        .optional()
        .describe(
          "AdMob publisher ID (optional — auto-loaded from vault ADMOB_PUBLISHER_ID)",
        ),
    },
    async ({ publisher_id }) => {
      await ensureInit();
      const id = resolvePublisherId(publisher_id);
      return text(await admobRequest("GET", `accounts/${id}/apps`));
    },
  );

  server.tool(
    "nst_admob_ad_units",
    "List ad units for an AdMob app",
    {
      app_id: z
        .string()
        .describe(
          "AdMob app ID (e.g. ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX)",
        ),
      publisher_id: z
        .string()
        .optional()
        .describe(
          "AdMob publisher ID (optional — auto-loaded from vault)",
        ),
    },
    async ({ app_id, publisher_id }) => {
      await ensureInit();
      const id = resolvePublisherId(publisher_id);
      const appName = `accounts/${id}/apps/${app_id}`;
      return text(await admobRequest("GET", `${appName}/adUnits`));
    },
  );

  server.tool(
    "nst_admob_report",
    "Generate an AdMob network report with custom metrics, dimensions, and date range",
    {
      start_date: z.string().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().describe("End date (YYYY-MM-DD)"),
      metrics: z
        .array(z.string())
        .describe(
          "Metrics: ESTIMATED_EARNINGS, IMPRESSIONS, CLICKS, IMPRESSION_CTR, AD_REQUESTS, MATCH_RATE, etc.",
        ),
      dimensions: z
        .array(z.string())
        .optional()
        .describe(
          "Dimensions: DATE, APP, AD_UNIT, COUNTRY, FORMAT, PLATFORM, etc.",
        ),
      publisher_id: z
        .string()
        .optional()
        .describe(
          "AdMob publisher ID (optional — auto-loaded from vault)",
        ),
    },
    async ({ start_date, end_date, metrics, dimensions, publisher_id }) => {
      await ensureInit();
      const id = resolvePublisherId(publisher_id);

      const [startYear, startMonth, startDay] = start_date
        .split("-")
        .map(Number);
      const [endYear, endMonth, endDay] = end_date.split("-").map(Number);

      const body = {
        reportSpec: {
          dateRange: {
            startDate: { year: startYear, month: startMonth, day: startDay },
            endDate: { year: endYear, month: endMonth, day: endDay },
          },
          metrics,
          dimensions: dimensions ?? ["DATE"],
        },
      };

      return text(
        await admobRequest(
          "POST",
          `accounts/${id}/networkReport:generate`,
          body,
        ),
      );
    },
  );

  server.tool(
    "nst_admob_mediation_groups",
    "List mediation groups for an AdMob account",
    {
      publisher_id: z
        .string()
        .optional()
        .describe(
          "AdMob publisher ID (optional — auto-loaded from vault)",
        ),
    },
    async ({ publisher_id }) => {
      await ensureInit();
      const id = resolvePublisherId(publisher_id);
      return text(
        await admobRequest("GET", `accounts/${id}/mediationGroups`),
      );
    },
  );
}
