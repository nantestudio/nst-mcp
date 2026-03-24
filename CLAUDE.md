# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nst-mcp** — Unified MCP server for the Nante Studio platform. 62 tools across 10 domains. TypeScript, stdio transport. Two runtime deps: `@modelcontextprotocol/sdk` + `zod`.

Two integration patterns:
- **Shell-out** (51 tools): calls `nst` or `asc` CLI binaries via `execFile`, returns their JSON stdout
- **Native REST** (11 tools): calls Google Ads and AdMob REST APIs directly via `fetch()`

## Commands

```bash
npm install               # Install dependencies
npm run build             # Compile TypeScript → dist/
npm run dev               # Run directly via tsx (no build step)
npm run typecheck         # Type-check without emitting
npm test                  # Run tests (vitest)
npm start                 # Run from compiled dist/
```

## Source Layout

```
src/
├── index.ts              # Entry point: McpServer + StdioServerTransport, domain registration loop
├── lib/
│   ├── shell.ts          # runNst() / runAsc() — execFile with stdin pipe, timeout, 10MB buffer
│   └── oauth.ts          # GoogleOAuth (token refresh via fetch), getGadsDeveloperToken, getGadsManagerId
└── domains/
    ├── index.ts           # Registry: exports domains[] array — add new domains here
    ├── vault.ts           # 15 tools — nst vault (projects, envs, secrets CRUD, files CRUD)
    ├── links.ts           # 4 tools — nst links (list, create, get, analytics)
    ├── ads.ts             # 5 tools — nst ads (copy validate/save via stdin, image gen, context, links)
    ├── appstore.ts        # 4 tools — nst appstore (apps, screenshots generate/style)
    ├── asc.ts             # 10 tools — asc binary (run, status, builds, testflight, reviews, IAP, subs)
    ├── play.ts            # 4 tools — nst play (status, releases, reviews, upload)
    ├── analytics.ts       # 5 tools — nst analytics (events, dau, summary, top-events, query)
    ├── passwords.ts       # 4 tools — nst passwords (list, get, totp, generate)
    ├── google-ads.ts      # 7 tools — Google Ads REST v19 (GAQL query, campaigns, ad groups, keywords)
    └── admob.ts           # 4 tools — AdMob REST v1 (apps, ad units, reports, mediation)
```

## Architecture

### Domain Module Pattern

Every domain file exports a single function: `register(server: McpServer): void`. It calls `server.tool()` for each tool with a Zod schema and async handler. Adding a new domain:
1. Create `src/domains/mydomain.ts` with `export function register(server: McpServer): void`
2. Import and append to the `domains` array in `src/domains/index.ts`
3. `npm run build`

### Shell-Out (`lib/shell.ts`)

- `runNst(args, options?)` — runs `nst` binary with given args
- `runAsc(args, options?)` — runs `asc` binary, auto-appends `--output json`
- Both use `execFile` (not `exec`) to prevent shell injection
- `ShellOptions.stdin` pipes data to the child process (used by ads copy validate/save)
- `ShellOptions.timeout` defaults to 30s, set to 120s for image generation and uploads
- 10 MB `maxBuffer` for large JSON outputs
- Return type is `ShellResult` with `[key: string]: unknown` index signature (required by MCP SDK)

### OAuth2 (`lib/oauth.ts`)

- `GoogleOAuth.fromVault()` loads client ID, secret, and refresh token from NanteVault (`nantestudio/prd`) via `nst vault secrets get`
- `getAccessToken()` auto-refreshes with 60-second buffer before expiry
- Shared by both `google-ads.ts` and `admob.ts` domains
- Lazy initialization: credentials loaded on first tool call, not at server startup
- `getGadsDeveloperToken()` and `getGadsManagerId()` are separate vault lookups

### Google Ads Native Tools

- Uses REST API v19 (`googleads.googleapis.com`)
- GAQL queries via `POST /v19/customers/{id}/googleAds:searchStream`
- Requires `Authorization: Bearer`, `developer-token`, and optional `login-customer-id` headers
- Campaign mutations use the `campaigns:mutate` endpoint
- Budget changes require first querying the budget resource name via GAQL
- Required vault secrets: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_MANAGER_ID`

### AdMob Native Tools

- Uses REST API v1 (`admob.googleapis.com`)
- Reuses the same `GoogleOAuth` instance as Google Ads (same OAuth client)
- Network reports use `POST /v1/accounts/{id}/networkReport:generate` with date range, metrics, dimensions
- Date format: `{ year, month, day }` objects (not ISO strings)

### Tool Naming Convention

All tool names use prefixes matching the CLI domain they wrap:
- `nst_vault_*`, `nst_links_*`, `nst_ads_*`, `nst_appstore_*`, `nst_play_*`, `nst_analytics_*`, `nst_passwords_*`
- `asc_*` — wraps `asc` binary directly
- `nst_gads_*` — native Google Ads
- `nst_admob_*` — native AdMob

### Graceful Degradation

The server always starts. Google Ads and AdMob tools lazy-load credentials on first use. If vault secrets are missing, those specific tools return error messages but all shell-out tools work fine (assuming `nst` is authenticated).

## Patterns

- Tool handler return type must include `[key: string]: unknown` index signature — the MCP SDK's `CallToolResult` requires it
- `server.tool(name, description, zodSchema, handler)` is the 4-arg overload used throughout
- Optional params use Zod's `.optional()` and are only added to CLI args when present
- `asc_run` splits its `command` string by whitespace — no quoted arg support needed since `asc` args don't use quotes
- Google Ads GAQL queries use `LAST_N_DAYS` macro for date ranges (not ISO date strings)
- Stdin-based tools (ads copy) pass data via `ShellOptions.stdin` which maps to `execFile`'s `input` option

## Prerequisites

- `nst` CLI installed and authenticated (`cargo install --path .` from nante-studio-cli, then `nst login`)
- `asc` CLI installed (for App Store Connect tools)
- Node.js >= 20

## Claude Code Configuration

```bash
# Local build
claude mcp add nst-mcp -- node /path/to/nst-mcp/dist/index.js

# Development
claude mcp add nst-mcp -- npx tsx /path/to/nst-mcp/src/index.ts

# npm (after publishing)
claude mcp add nst-mcp -- npx @nantestudio/nst-mcp
```
