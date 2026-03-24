import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleOAuth } from "../lib/oauth.js";

let oauth: GoogleOAuth | null = null;

async function init(): Promise<void> {
  if (oauth) return;
  try {
    oauth = await GoogleOAuth.fromVault();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `Warning: AdMob tools unavailable (${msg}). Set GOOGLE_ADS_* secrets in vault (nantestudio/prd).\n`,
    );
  }
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

function text(data: string): { content: Array<{ type: "text"; text: string }>; [key: string]: unknown } {
  return { content: [{ type: "text" as const, text: data }] };
}

export function register(server: McpServer): void {
  const ensureInit = async () => {
    await init();
  };

  server.tool(
    "nst_admob_apps",
    "List all apps registered in AdMob",
    {
      publisher_id: z
        .string()
        .describe(
          "AdMob publisher ID (e.g. pub-XXXXXXXXXXXXXXXX). Find via AdMob dashboard > Account > Publisher ID.",
        ),
    },
    async ({ publisher_id }) => {
      await ensureInit();
      return text(
        await admobRequest("GET", `accounts/${publisher_id}/apps`),
      );
    },
  );

  server.tool(
    "nst_admob_ad_units",
    "List ad units for an AdMob app",
    {
      publisher_id: z.string().describe("AdMob publisher ID"),
      app_id: z
        .string()
        .describe(
          "AdMob app ID (e.g. ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX)",
        ),
    },
    async ({ publisher_id, app_id }) => {
      await ensureInit();
      // AdMob API uses the app resource name
      const appName = `accounts/${publisher_id}/apps/${app_id}`;
      return text(await admobRequest("GET", `${appName}/adUnits`));
    },
  );

  server.tool(
    "nst_admob_report",
    "Generate an AdMob network report with custom metrics, dimensions, and date range",
    {
      publisher_id: z.string().describe("AdMob publisher ID"),
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
    },
    async ({ publisher_id, start_date, end_date, metrics, dimensions }) => {
      await ensureInit();

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
          `accounts/${publisher_id}/networkReport:generate`,
          body,
        ),
      );
    },
  );

  server.tool(
    "nst_admob_mediation_groups",
    "List mediation groups for an AdMob account",
    {
      publisher_id: z.string().describe("AdMob publisher ID"),
    },
    async ({ publisher_id }) => {
      await ensureInit();
      return text(
        await admobRequest(
          "GET",
          `accounts/${publisher_id}/mediationGroups`,
        ),
      );
    },
  );
}
