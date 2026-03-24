import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GoogleOAuth,
  getGadsDeveloperToken,
  getGadsManagerId,
} from "../lib/oauth.js";

let oauth: GoogleOAuth | null = null;
let developerToken: string | null = null;
let managerId: string | null = null;

async function init(): Promise<void> {
  if (oauth) return;
  try {
    [oauth, developerToken, managerId] = await Promise.all([
      GoogleOAuth.fromVault(),
      getGadsDeveloperToken(),
      getGadsManagerId(),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `Warning: Google Ads tools unavailable (${msg}). Set GOOGLE_ADS_* secrets in vault (nantestudio/prd).\n`,
    );
  }
}

async function gadsRequest(
  customerId: string,
  method: string,
  path: string,
  body?: object,
): Promise<string> {
  if (!oauth || !developerToken)
    throw new Error(
      "Google Ads not configured. Set GOOGLE_ADS_* secrets in vault (nantestudio/prd).",
    );

  const token = await oauth.getAccessToken();
  const url = `https://googleads.googleapis.com/v19/customers/${customerId}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  if (managerId) {
    headers["login-customer-id"] = managerId;
  }

  const resp = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google Ads API error (${resp.status}): ${text}`);
  }

  return resp.text();
}

async function gaqlQuery(
  customerId: string,
  query: string,
): Promise<string> {
  return gadsRequest(customerId, "POST", "/googleAds:searchStream", {
    query,
  });
}

function text(data: string): { content: Array<{ type: "text"; text: string }>; [key: string]: unknown } {
  return { content: [{ type: "text" as const, text: data }] };
}

export function register(server: McpServer): void {
  // Lazy-init credentials on first tool call
  const ensureInit = async () => {
    await init();
  };

  server.tool(
    "nst_gads_query",
    "Run a GAQL (Google Ads Query Language) query against a Google Ads account. See https://developers.google.com/google-ads/api/fields/v19/overview for available fields.",
    {
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      query: z
        .string()
        .describe(
          "GAQL query (e.g. SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date DURING LAST_7_DAYS)",
        ),
    },
    async ({ customer_id, query }) => {
      await ensureInit();
      return text(await gaqlQuery(customer_id, query));
    },
  );

  server.tool(
    "nst_gads_campaigns",
    "List campaigns with key metrics from a Google Ads account",
    {
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      status: z
        .enum(["ENABLED", "PAUSED", "REMOVED"])
        .optional()
        .describe("Filter by campaign status"),
      days: z
        .number()
        .optional()
        .describe("Lookback days for metrics (default 30)"),
    },
    async ({ customer_id, status, days }) => {
      await ensureInit();
      const d = days ?? 30;
      let query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_${d}_DAYS`;
      if (status) query += ` AND campaign.status = '${status}'`;
      query += " ORDER BY metrics.cost_micros DESC";
      return text(await gaqlQuery(customer_id, query));
    },
  );

  server.tool(
    "nst_gads_campaign_update",
    "Update a campaign's status or daily budget in Google Ads",
    {
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      campaign_id: z.string().describe("Campaign ID"),
      status: z
        .enum(["ENABLED", "PAUSED"])
        .optional()
        .describe("New campaign status"),
      budget_micros: z
        .number()
        .optional()
        .describe(
          "New daily budget in micros (e.g. 5000000 = $5.00)",
        ),
    },
    async ({ customer_id, campaign_id, status, budget_micros }) => {
      await ensureInit();
      if (!oauth || !developerToken) {
        throw new Error("Google Ads not configured.");
      }

      const operations = [];

      if (status) {
        operations.push({
          update: {
            resourceName: `customers/${customer_id}/campaigns/${campaign_id}`,
            status,
          },
          updateMask: "status",
        });
      }

      if (budget_micros !== undefined) {
        // First get the campaign's budget resource name
        const budgetQuery = `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${campaign_id}`;
        const budgetResult = await gaqlQuery(customer_id, budgetQuery);
        const parsed = JSON.parse(budgetResult);
        const budgetResourceName =
          parsed?.[0]?.results?.[0]?.campaign?.campaignBudget;

        if (budgetResourceName) {
          const budgetResp = await gadsRequest(
            customer_id,
            "POST",
            "/campaignBudgets:mutate",
            {
              operations: [
                {
                  update: {
                    resourceName: budgetResourceName,
                    amountMicros: budget_micros.toString(),
                  },
                  updateMask: "amount_micros",
                },
              ],
            },
          );
          return text(budgetResp);
        }
      }

      if (operations.length > 0) {
        const result = await gadsRequest(
          customer_id,
          "POST",
          "/campaigns:mutate",
          { operations },
        );
        return text(result);
      }

      return text(JSON.stringify({ message: "No changes specified" }));
    },
  );

  server.tool(
    "nst_gads_ad_groups",
    "List ad groups in a campaign with metrics",
    {
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      campaign_id: z.string().describe("Campaign ID"),
      days: z
        .number()
        .optional()
        .describe("Lookback days for metrics (default 30)"),
    },
    async ({ customer_id, campaign_id, days }) => {
      await ensureInit();
      const d = days ?? 30;
      const query = `SELECT ad_group.id, ad_group.name, ad_group.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group WHERE campaign.id = ${campaign_id} AND segments.date DURING LAST_${d}_DAYS ORDER BY metrics.cost_micros DESC`;
      return text(await gaqlQuery(customer_id, query));
    },
  );

  server.tool(
    "nst_gads_search_terms",
    "Get search term report for a campaign showing actual queries that triggered ads",
    {
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      campaign_id: z.string().describe("Campaign ID"),
      days: z
        .number()
        .optional()
        .describe("Lookback days (default 30)"),
      limit: z.number().optional().describe("Max results (default 50)"),
    },
    async ({ customer_id, campaign_id, days, limit }) => {
      await ensureInit();
      const d = days ?? 30;
      const l = limit ?? 50;
      const query = `SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE campaign.id = ${campaign_id} AND segments.date DURING LAST_${d}_DAYS ORDER BY metrics.impressions DESC LIMIT ${l}`;
      return text(await gaqlQuery(customer_id, query));
    },
  );

  server.tool(
    "nst_gads_keywords",
    "List keywords in an ad group with metrics",
    {
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      ad_group_id: z.string().describe("Ad group ID"),
      days: z
        .number()
        .optional()
        .describe("Lookback days for metrics (default 30)"),
    },
    async ({ customer_id, ad_group_id, days }) => {
      await ensureInit();
      const d = days ?? 30;
      const query = `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_criterion WHERE ad_group.id = ${ad_group_id} AND ad_group_criterion.type = 'KEYWORD' AND segments.date DURING LAST_${d}_DAYS ORDER BY metrics.impressions DESC`;
      return text(await gaqlQuery(customer_id, query));
    },
  );

  server.tool(
    "nst_gads_performance",
    "Get account-level performance summary from Google Ads",
    {
      customer_id: z
        .string()
        .describe("Google Ads customer ID (10 digits, no dashes)"),
      days: z
        .number()
        .optional()
        .describe("Lookback days (default 30)"),
    },
    async ({ customer_id, days }) => {
      await ensureInit();
      const d = days ?? 30;
      const query = `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc, metrics.cost_per_conversion FROM customer WHERE segments.date DURING LAST_${d}_DAYS`;
      return text(await gaqlQuery(customer_id, query));
    },
  );
}
