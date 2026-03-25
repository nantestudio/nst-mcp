import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  GoogleOAuth,
  getGadsDeveloperToken,
  getGadsManagerId,
} from "../lib/oauth.js";
import { runNst } from "../lib/shell.js";

let oauth: GoogleOAuth | null = null;
let developerToken: string | null = null;
let managerId: string | null = null;
let defaultCustomerId: string | null = null;

async function init(): Promise<void> {
  if (oauth) return;
  try {
    [oauth, developerToken, managerId, defaultCustomerId] = await Promise.all([
      GoogleOAuth.fromVault(),
      getGadsDeveloperToken(),
      getGadsManagerId(),
      getCustomerIdFromVault(),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `Warning: Google Ads tools unavailable (${msg}). Set GOOGLE_ADS_* secrets in vault (nantestudio/prd).\n`,
    );
  }
}

async function getCustomerIdFromVault(): Promise<string | null> {
  try {
    const result = await runNst([
      "vault",
      "secrets",
      "get",
      "GOOGLE_ADS_CUSTOMER_ID",
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

function resolveCustomerId(provided?: string): string {
  const id = provided || defaultCustomerId;
  if (!id)
    throw new Error(
      "Google Ads customer ID not provided and GOOGLE_ADS_CUSTOMER_ID not found in vault (nantestudio/prd).",
    );
  return id;
}

// Google Ads geo target IDs for country targeting
const COUNTRY_GEO_IDS: Record<string, number> = {
  KR: 2410,
  US: 2840,
  JP: 2392,
  TW: 2158,
  TH: 2764,
  VN: 2704,
  ID: 2360,
  PH: 2608,
  MY: 2458,
  SG: 2702,
  IN: 2356,
  AU: 2036,
  CA: 2124,
  GB: 2826,
  DE: 2276,
  FR: 2250,
  BR: 2076,
  MX: 2484,
  ES: 2724,
  IT: 2380,
};

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
  const url = `https://googleads.googleapis.com/v21/customers/${customerId}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  };
  // Only set login-customer-id when querying the manager account itself
  // or its child accounts. For standalone accounts (like the advertiser),
  // sending the manager ID causes a PERMISSION_DENIED error.
  if (managerId && customerId === managerId) {
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

  // =========================================================================
  // Query & Reporting (existing tools, now with optional customer_id)
  // =========================================================================

  server.tool(
    "nst_gads_query",
    "Run a GAQL (Google Ads Query Language) query. See https://developers.google.com/google-ads/api/fields/v21/overview for available fields.",
    {
      query: z
        .string()
        .describe(
          "GAQL query (e.g. SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date DURING LAST_7_DAYS)",
        ),
      customer_id: z
        .string()
        .optional()
        .describe(
          "Google Ads customer ID (optional — auto-loaded from vault)",
        ),
    },
    async ({ query, customer_id }) => {
      await ensureInit();
      return text(await gaqlQuery(resolveCustomerId(customer_id), query));
    },
  );

  server.tool(
    "nst_gads_campaigns",
    "List campaigns with key metrics from a Google Ads account",
    {
      status: z
        .enum(["ENABLED", "PAUSED", "REMOVED"])
        .optional()
        .describe("Filter by campaign status"),
      days: z
        .number()
        .optional()
        .describe("Lookback days for metrics (default 30)"),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({ status, days, customer_id }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);
      const d = days ?? 30;
      let query = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_${d}_DAYS`;
      if (status) query += ` AND campaign.status = '${status}'`;
      query += " ORDER BY metrics.cost_micros DESC";
      return text(await gaqlQuery(cid, query));
    },
  );

  server.tool(
    "nst_gads_campaign_update",
    "Update a campaign's status or daily budget in Google Ads",
    {
      campaign_id: z.string().describe("Campaign ID"),
      status: z
        .enum(["ENABLED", "PAUSED"])
        .optional()
        .describe("New campaign status"),
      budget_micros: z
        .number()
        .optional()
        .describe("New daily budget in micros (e.g. 5000000 = 5,000 KRW)"),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({ campaign_id, status, budget_micros, customer_id }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);

      const operations = [];

      if (status) {
        operations.push({
          update: {
            resourceName: `customers/${cid}/campaigns/${campaign_id}`,
            status,
          },
          updateMask: "status",
        });
      }

      if (budget_micros !== undefined) {
        const budgetQuery = `SELECT campaign.campaign_budget FROM campaign WHERE campaign.id = ${campaign_id}`;
        const budgetResult = await gaqlQuery(cid, budgetQuery);
        const parsed = JSON.parse(budgetResult);
        const budgetResourceName =
          parsed?.[0]?.results?.[0]?.campaign?.campaignBudget;

        if (budgetResourceName) {
          const budgetResp = await gadsRequest(
            cid,
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
        const result = await gadsRequest(cid, "POST", "/campaigns:mutate", {
          operations,
        });
        return text(result);
      }

      return text(JSON.stringify({ message: "No changes specified" }));
    },
  );

  server.tool(
    "nst_gads_ad_groups",
    "List ad groups in a campaign with metrics",
    {
      campaign_id: z.string().describe("Campaign ID"),
      days: z
        .number()
        .optional()
        .describe("Lookback days for metrics (default 30)"),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({ campaign_id, days, customer_id }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);
      const d = days ?? 30;
      const query = `SELECT ad_group.id, ad_group.name, ad_group.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group WHERE campaign.id = ${campaign_id} AND segments.date DURING LAST_${d}_DAYS ORDER BY metrics.cost_micros DESC`;
      return text(await gaqlQuery(cid, query));
    },
  );

  server.tool(
    "nst_gads_search_terms",
    "Get search term report for a campaign showing actual queries that triggered ads",
    {
      campaign_id: z.string().describe("Campaign ID"),
      days: z.number().optional().describe("Lookback days (default 30)"),
      limit: z.number().optional().describe("Max results (default 50)"),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({ campaign_id, days, limit, customer_id }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);
      const d = days ?? 30;
      const l = limit ?? 50;
      const query = `SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE campaign.id = ${campaign_id} AND segments.date DURING LAST_${d}_DAYS ORDER BY metrics.impressions DESC LIMIT ${l}`;
      return text(await gaqlQuery(cid, query));
    },
  );

  server.tool(
    "nst_gads_keywords",
    "List keywords in an ad group with metrics",
    {
      ad_group_id: z.string().describe("Ad group ID"),
      days: z
        .number()
        .optional()
        .describe("Lookback days for metrics (default 30)"),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({ ad_group_id, days, customer_id }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);
      const d = days ?? 30;
      const query = `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_criterion WHERE ad_group.id = ${ad_group_id} AND ad_group_criterion.type = 'KEYWORD' AND segments.date DURING LAST_${d}_DAYS ORDER BY metrics.impressions DESC`;
      return text(await gaqlQuery(cid, query));
    },
  );

  server.tool(
    "nst_gads_performance",
    "Get account-level performance summary from Google Ads",
    {
      days: z.number().optional().describe("Lookback days (default 30)"),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({ days, customer_id }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);
      const d = days ?? 30;
      const query = `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc, metrics.cost_per_conversion FROM customer WHERE segments.date DURING LAST_${d}_DAYS`;
      return text(await gaqlQuery(cid, query));
    },
  );

  // =========================================================================
  // App Campaign Creation (Zombie strategy)
  // =========================================================================

  server.tool(
    "nst_gads_app_campaign_create",
    "Create a Google Ads App Install campaign. Creates budget + campaign + ad group + ad with text assets in a single flow. Campaign naming convention: {app}_{date}_{budget}_{country}",
    {
      app_package: z
        .string()
        .describe("Android package name (e.g. com.nantestudio.braintalk)"),
      campaign_name: z
        .string()
        .describe(
          "Campaign display name (convention: {app}_{YYYYMMDD}_{budget}_{country} e.g. braintalk_20260324_5000_KR)",
        ),
      daily_budget_micros: z
        .number()
        .describe(
          "Daily budget in micros (e.g. 5000000 = 5,000 KRW). Start low: 2,000-5,000 KRW/day recommended.",
        ),
      countries: z
        .string()
        .describe(
          "Comma-separated ISO country codes for targeting (e.g. KR,US,JP). Supported: KR,US,JP,TW,TH,VN,ID,PH,MY,SG,IN,AU,CA,GB,DE,FR,BR,MX,ES,IT",
        ),
      headlines: z
        .array(z.string())
        .describe(
          "Up to 5 headlines, max 30 chars each. No ! or quotes. Each must make sense independently.",
        ),
      descriptions: z
        .array(z.string())
        .describe(
          "Up to 5 descriptions, max 90 chars each. No quotes. Each must make sense independently.",
        ),
      target_cpa_micros: z
        .number()
        .optional()
        .describe(
          "Target cost per install in micros (e.g. 1000000 = 1,000 KRW). If omitted, maximizes installs.",
        ),
      status: z
        .enum(["PAUSED", "ENABLED"])
        .optional()
        .describe("Campaign status (default PAUSED — review before enabling)"),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({
      app_package,
      campaign_name,
      daily_budget_micros,
      countries,
      headlines,
      descriptions,
      target_cpa_micros,
      status,
      customer_id,
    }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);
      const campaignStatus = status ?? "PAUSED";

      // Step 1: Create budget + campaign via googleAds:mutate with temp resource names
      const budgetTempId = "-1";
      const campaignTempId = "-2";
      const adGroupTempId = "-3";

      const biddingConfig = target_cpa_micros
        ? {
            biddingStrategyType: "TARGET_CPA",
            targetCpa: { targetCpaMicros: target_cpa_micros.toString() },
          }
        : {
            biddingStrategyType: "MAXIMIZE_CONVERSIONS",
          };

      const mutateOperations = [
        // Budget
        {
          campaignBudgetOperation: {
            create: {
              resourceName: `customers/${cid}/campaignBudgets/${budgetTempId}`,
              amountMicros: daily_budget_micros.toString(),
              explicitlyShared: false,
            },
          },
        },
        // Campaign
        {
          campaignOperation: {
            create: {
              resourceName: `customers/${cid}/campaigns/${campaignTempId}`,
              name: campaign_name,
              advertisingChannelType: "MULTI_CHANNEL",
              advertisingChannelSubType: "APP_CAMPAIGN",
              status: campaignStatus,
              campaignBudget: `customers/${cid}/campaignBudgets/${budgetTempId}`,
              ...biddingConfig,
              appCampaignSetting: {
                appId: app_package,
                appStore: "GOOGLE_APP_STORE",
                biddingStrategyGoalType: target_cpa_micros
                  ? "OPTIMIZE_INSTALLS_TARGET_INSTALL_COST"
                  : "OPTIMIZE_INSTALLS_WITHOUT_TARGET_INSTALL_COST",
              },
            },
          },
        },
        // Ad Group
        {
          adGroupOperation: {
            create: {
              resourceName: `customers/${cid}/adGroups/${adGroupTempId}`,
              campaign: `customers/${cid}/campaigns/${campaignTempId}`,
              name: `${campaign_name}_adgroup`,
              status: "ENABLED",
            },
          },
        },
        // Ad with text assets
        {
          adGroupAdOperation: {
            create: {
              adGroup: `customers/${cid}/adGroups/${adGroupTempId}`,
              status: "ENABLED",
              ad: {
                appAd: {
                  headlines: headlines.map((h) => ({ text: h })),
                  descriptions: descriptions.map((d) => ({ text: d })),
                },
              },
            },
          },
        },
        // Location targeting for each country
        ...countries.split(",").map((code) => {
          const geoId = COUNTRY_GEO_IDS[code.trim().toUpperCase()];
          if (!geoId)
            throw new Error(
              `Unknown country code: ${code}. Supported: ${Object.keys(COUNTRY_GEO_IDS).join(",")}`,
            );
          return {
            campaignCriterionOperation: {
              create: {
                campaign: `customers/${cid}/campaigns/${campaignTempId}`,
                location: {
                  geoTargetConstant: `geoTargetConstants/${geoId}`,
                },
              },
            },
          };
        }),
      ];

      const result = await gadsRequest(cid, "POST", "/googleAds:mutate", {
        mutateOperations,
      });

      return text(result);
    },
  );

  // =========================================================================
  // Campaign Deletion
  // =========================================================================

  server.tool(
    "nst_gads_campaign_delete",
    "Remove (delete) a Google Ads campaign",
    {
      campaign_id: z.string().describe("Campaign ID to delete"),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({ campaign_id, customer_id }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);
      const result = await gadsRequest(cid, "POST", "/campaigns:mutate", {
        operations: [
          {
            remove: `customers/${cid}/campaigns/${campaign_id}`,
          },
        ],
      });
      return text(result);
    },
  );

  // =========================================================================
  // Campaign Cleanup (Zombie's rule: kill losers after 2 weeks)
  // =========================================================================

  server.tool(
    "nst_gads_campaign_cleanup",
    "Find and optionally delete underperforming campaigns. Zombie's rule: campaigns older than 2 weeks with <1,000 impressions and <20,000 KRW spent are losers. Default is dry_run (preview only).",
    {
      min_age_days: z
        .number()
        .optional()
        .describe("Minimum campaign age in days to consider (default 14)"),
      min_impressions: z
        .number()
        .optional()
        .describe(
          "Campaigns with fewer impressions than this are candidates for deletion (default 1000)",
        ),
      min_spend_micros: z
        .number()
        .optional()
        .describe(
          "Campaigns with less spend than this (in micros) are candidates for deletion (default 20000000 = 20,000 KRW)",
        ),
      dry_run: z
        .boolean()
        .optional()
        .describe(
          "If true (default), only lists campaigns that would be deleted. Set false to actually delete.",
        ),
      customer_id: z
        .string()
        .optional()
        .describe("Google Ads customer ID (optional — auto-loaded from vault)"),
    },
    async ({
      min_age_days,
      min_impressions,
      min_spend_micros,
      dry_run,
      customer_id,
    }) => {
      await ensureInit();
      const cid = resolveCustomerId(customer_id);
      const ageDays = min_age_days ?? 14;
      const minImpr = min_impressions ?? 1000;
      const minSpend = min_spend_micros ?? 20_000_000;
      const isDryRun = dry_run ?? true;

      // Find underperforming campaigns
      const query = `SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date DURING LAST_${ageDays * 2}_DAYS ORDER BY metrics.cost_micros ASC`;

      const result = await gaqlQuery(cid, query);
      const parsed = JSON.parse(result);
      const rows = parsed?.[0]?.results || [];

      // Filter: older than min_age_days AND below thresholds
      const now = new Date();
      const candidates = rows.filter((row: any) => {
        const startDate = row.campaign?.startDate;
        if (!startDate) return false;
        const start = new Date(
          startDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
        );
        const ageMs = now.getTime() - start.getTime();
        const ageDaysActual = ageMs / (1000 * 60 * 60 * 24);
        const impressions = parseInt(row.metrics?.impressions || "0", 10);
        const costMicros = parseInt(row.metrics?.costMicros || "0", 10);
        return (
          ageDaysActual >= ageDays &&
          impressions < minImpr &&
          costMicros < minSpend
        );
      });

      if (candidates.length === 0) {
        return text(
          JSON.stringify({
            message: "No underperforming campaigns found",
            criteria: {
              min_age_days: ageDays,
              min_impressions: minImpr,
              min_spend_micros: minSpend,
            },
          }),
        );
      }

      if (isDryRun) {
        return text(
          JSON.stringify({
            dry_run: true,
            message: `Found ${candidates.length} campaign(s) to delete. Set dry_run=false to delete.`,
            campaigns: candidates.map((r: any) => ({
              id: r.campaign.id,
              name: r.campaign.name,
              status: r.campaign.status,
              start_date: r.campaign.startDate,
              impressions: r.metrics?.impressions,
              cost_micros: r.metrics?.costMicros,
            })),
          }),
        );
      }

      // Actually delete
      const deleteOps = candidates.map((r: any) => ({
        remove: `customers/${cid}/campaigns/${r.campaign.id}`,
      }));

      const deleteResult = await gadsRequest(
        cid,
        "POST",
        "/campaigns:mutate",
        { operations: deleteOps },
      );

      return text(
        JSON.stringify({
          deleted: candidates.length,
          campaigns: candidates.map((r: any) => ({
            id: r.campaign.id,
            name: r.campaign.name,
          })),
          result: JSON.parse(deleteResult),
        }),
      );
    },
  );
}
