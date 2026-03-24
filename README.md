# nst-mcp

Unified [MCP](https://modelcontextprotocol.io) server for the **Nante Studio** platform. Gives Claude Code (and any MCP-compatible AI agent) structured access to 62 tools across 10 domains.

## How it works

```
Claude Code
  └─ nst-mcp (stdio)
       ├─ Shell-out → nst CLI (vault, links, analytics, passwords, ads, screenshots)
       ├─ Shell-out → asc CLI (App Store Connect)
       └─ Native REST → Google Ads API, AdMob API
```

**Shell-out tools** call the existing `nst` and `asc` CLIs with `--json` output — no logic duplication, the CLIs are the source of truth.

**Native REST tools** call Google Ads (GAQL via `searchStream`) and AdMob APIs directly using `fetch()`. OAuth2 credentials are loaded from NanteVault.

## Setup

### Prerequisites

- Node.js >= 20
- [`nst`](https://github.com/nantestudio/nante-studio-cli) CLI installed and authenticated (`nst login`)
- [`asc`](https://github.com/nicklama/asc-cli) CLI installed (for App Store Connect tools)

### Install

```bash
git clone https://github.com/nantestudio/nst-mcp.git
cd nst-mcp
bun install
```

### Add to Claude Code

```bash
# Runs TypeScript directly — no build step needed
claude mcp add nst-mcp -- bun /path/to/nst-mcp/src/index.ts
```

## Tools (65)

| Domain | Tools | Type | Description |
|--------|-------|------|-------------|
| **Vault Secrets** | 9 | shell-out | Projects, environments, secrets CRUD, import, soft-delete/restore |
| **Vault Files** | 6 | shell-out | Encrypted file storage (upload, download, delete, restore) |
| **Links** | 4 | shell-out | Short link CRUD + click analytics |
| **Ads** | 5 | shell-out | Google Ads RSA copy validation, AI image generation, tracked links |
| **App Store** | 4 | shell-out | App listing, screenshot generation with AI captions |
| **ASC** | 10 | shell-out | Builds, TestFlight, submissions, reviews, IAP, subscriptions |
| **Play Store** | 4 | shell-out | Release status, reviews, AAB upload |
| **Analytics** | 5 | shell-out | Events, DAU, summary, top events, raw SQL query |
| **Passwords** | 4 | shell-out | Encrypted password store (list, get, TOTP, generate) |
| **Google Ads** | 10 | native | GAQL queries, campaigns, app campaign creation, cleanup, ad groups, keywords |
| **AdMob** | 4 | native | Apps, ad units, network reports, mediation groups |

### Google Ads tools

| Tool | Description |
|------|-------------|
| `nst_gads_query` | Run any GAQL query |
| `nst_gads_campaigns` | List campaigns with metrics |
| `nst_gads_campaign_update` | Pause/enable campaigns, change budget |
| `nst_gads_ad_groups` | List ad groups in a campaign |
| `nst_gads_search_terms` | Search term report (actual queries that triggered ads) |
| `nst_gads_keywords` | Keywords in an ad group with metrics |
| `nst_gads_performance` | Account-level performance summary |
| `nst_gads_app_campaign_create` | Create App Install campaign (budget + campaign + ad group + ad in one call) |
| `nst_gads_campaign_delete` | Remove a campaign |
| `nst_gads_campaign_cleanup` | Auto-find and delete underperforming campaigns (Zombie's rule) |

### AdMob tools

| Tool | Description |
|------|-------------|
| `nst_admob_apps` | List registered apps |
| `nst_admob_ad_units` | List ad units for an app |
| `nst_admob_report` | Network report with custom metrics/dimensions/dates |
| `nst_admob_mediation_groups` | List mediation groups |

## Google Ads / AdMob setup

These tools require OAuth2 credentials stored in NanteVault:

```bash
nst vault secrets set "GOOGLE_ADS_CLIENT_ID=..."        -p nantestudio -e prd
nst vault secrets set "GOOGLE_ADS_CLIENT_SECRET=..."     -p nantestudio -e prd
nst vault secrets set "GOOGLE_ADS_REFRESH_TOKEN=..."     -p nantestudio -e prd
nst vault secrets set "GOOGLE_ADS_DEVELOPER_TOKEN=..."   -p nantestudio -e prd
nst vault secrets set "GOOGLE_ADS_MANAGER_ID=..."        -p nantestudio -e prd
```

If these secrets are missing, the server still starts — Google Ads and AdMob tools will return clear error messages, but all other tools work fine.

## App Ad Factory Strategy

Inspired by [Programming Zombie's](https://www.inflearn.com/) proven app monetization model. The core idea: spend $1/day on Google Ads → earn $5/day from AdMob = **5x ROAS**. Scale across many apps.

### The pipeline

```
"run ads for braintalk"
  │
  ├─ 1. nst play status --package com.nantestudio.braintalk    (get app info)
  ├─ 2. Claude generates 10 headlines + 10 descriptions        (AI copy)
  ├─ 3. nst_ads_copy_validate                                  (char limits check)
  ├─ 4. nst_gads_app_campaign_create                           (create campaign)
  │     name: braintalk_20260324_5000_KR
  │     budget: 5,000 KRW/day
  │     country: KR
  │     status: PAUSED (review first)
  ├─ 5. Review → enable campaign
  │
  │  ... 2 weeks later ...
  │
  └─ 6. nst_gads_campaign_cleanup                              (kill losers)
        rule: >14 days, <1K impressions, <20K KRW spent → delete
```

### Key rules

| Rule | Value |
|------|-------|
| Starting budget | 2,000-5,000 KRW/day |
| Testing period | Minimum 2 weeks per campaign |
| Target margin | 40%+ (AdMob revenue - ad spend) |
| Campaign survival rate | ~6-7% (build many, keep few) |
| Naming convention | `{app}_{YYYYMMDD}_{budget}_{country}` |
| Campaign type | App Install (`MULTI_CHANNEL` + `APP_CAMPAIGN`) |

### Ad copy rules

- Titles: max 30 characters, no `!`, no quotes
- Descriptions: max 90 characters, no quotes
- Each line must make sense independently
- Target demographics via copy, not settings (e.g. "중년을 위한 맞춤 식단" → higher-income users → higher eCPM)
- CJK characters count as 2 towards char limit

### Scaling targets

| Apps with ads | Estimated monthly revenue |
|---------------|--------------------------|
| 10 apps | ~$1,200/month |
| 25 apps | ~$3,000/month |
| 50 apps | ~$6,000/month |

### Cleanup automation

`nst_gads_campaign_cleanup` implements Zombie's rule for killing underperforming campaigns:

```bash
# Preview what would be deleted (default: dry_run=true)
# → campaigns older than 14 days with <1K impressions AND <20K KRW spent

# Actually delete losers
# → set dry_run=false
```

### Two-account strategy

| Account | Purpose | Apps |
|---------|---------|------|
| **andyleeboo** | Money factory (utility apps with IAP) | Apps with in-app purchases |
| **Nante Studio** | Art projects (brand-clean apps) | Free apps, creative apps |

One AdMob account (`pub-7342013959296228`) for both — multiple AdMob accounts = ban risk.

## Adding a new domain

1. Create `src/domains/mydomain.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNst } from "../lib/shell.js";

export function register(server: McpServer): void {
  server.tool(
    "nst_mydomain_list",
    "List things from my domain",
    { query: z.string().optional().describe("Search query") },
    async ({ query }) => {
      const args = ["mydomain", "list", "--json"];
      if (query) args.push("--query", query);
      return runNst(args);
    },
  );
}
```

2. Add to `src/domains/index.ts`:

```typescript
import { register as mydomain } from "./mydomain.js";
// ...
export const domains = [/* ... */, mydomain];
```

3. `bun run build` and restart.

## Development

```bash
bun install          # Install dependencies
bun run dev          # Run TypeScript directly (no build step)
bun run build        # Compile to dist/
bun run typecheck    # Type-check without emitting
bun test             # Run tests
```

## License

MIT
