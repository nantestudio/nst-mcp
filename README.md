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
npm install
npm run build
```

### Add to Claude Code

```bash
# From local build
claude mcp add nst-mcp -- node /path/to/nst-mcp/dist/index.js

# Development (no build step needed)
claude mcp add nst-mcp -- npx tsx /path/to/nst-mcp/src/index.ts
```

## Tools (62)

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
| **Google Ads** | 7 | native | GAQL queries, campaigns, ad groups, keywords, search terms |
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

3. `npm run build` and restart.

## Development

```bash
npm run dev          # Run via tsx (no build step)
npm run typecheck    # Type-check without emitting
npm run build        # Compile to dist/
npm test             # Run tests
```

## License

MIT
