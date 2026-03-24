# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nst-mcp** — Unified MCP (Model Context Protocol) server for the Nante Studio platform. Provides Claude Code with structured tool access to vault secrets, short links, ads, App Store Connect, Google Play, analytics, passwords, Google Ads, and AdMob.

**Architecture:** TypeScript MCP server that shells out to `nst` and `asc` CLIs for existing functionality, and makes direct REST API calls for Google Ads (GAQL) and AdMob. Two runtime dependencies: `@modelcontextprotocol/sdk` + `zod`.

## Commands

```bash
npm install               # Install dependencies
npm run build             # Compile TypeScript → dist/
npm run dev               # Run directly via tsx (no build step)
npm run typecheck         # Type-check without emitting
npm test                  # Run tests (vitest)
```

## Source Layout

```
src/
├── index.ts              # Entry point: create McpServer, register domains, start stdio
├── lib/
│   ├── shell.ts          # runNst() / runAsc() — execFile helpers with JSON parsing
│   └── oauth.ts          # GoogleOAuth class for Google Ads / AdMob (token refresh, vault creds)
└── domains/
    ├── index.ts           # Registry: exports domains[] array
    ├── vault.ts           # 15 tools — shells out to `nst vault`
    ├── links.ts           # 4 tools — shells out to `nst links`
    ├── ads.ts             # 5 tools — shells out to `nst ads`
    ├── appstore.ts        # 4 tools — shells out to `nst appstore`
    ├── asc.ts             # 10 tools — shells out to `asc` binary
    ├── play.ts            # 4 tools — shells out to `nst play`
    ├── analytics.ts       # 5 tools — shells out to `nst analytics`
    ├── passwords.ts       # 4 tools — shells out to `nst passwords`
    ├── google-ads.ts      # 7 tools — native REST (Google Ads API v19, GAQL)
    └── admob.ts           # 4 tools — native REST (AdMob API v1)
```

62 tools total.

## Architecture

### Domain Module Pattern

Every domain file exports `register(server: McpServer): void`. To add a new domain:
1. Create `src/domains/mydomain.ts` with a `register` export
2. Import and add to the `domains` array in `src/domains/index.ts`

### Shell-Out Tools

Most tools shell out to the `nst` or `asc` CLI binaries. The `runNst()` and `runAsc()` helpers in `lib/shell.ts` use `execFile` (not `exec`) to avoid shell injection. Key behaviors:
- 10 MB max buffer for large JSON outputs
- 30-second default timeout (120s for image generation / uploads)
- `runAsc()` auto-appends `--output json` if not present
- Stdin pipe support for `ads copy validate` and `ads copy save`

### Native REST Tools (Google Ads / AdMob)

Google Ads and AdMob tools call REST APIs directly using Node `fetch()`. OAuth2 credentials are loaded from NanteVault via `nst vault secrets get`. Token refresh is automatic with 60-second buffer.

Required vault secrets (nantestudio/prd): `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_MANAGER_ID`.

Graceful degradation: if Google credentials are missing, the server still starts — those tools return clear error messages.

### Tool Naming

- `nst_vault_*`, `nst_links_*`, `nst_ads_*`, `nst_appstore_*`, `nst_play_*`, `nst_analytics_*`, `nst_passwords_*` — shell-out to `nst`
- `asc_*` — shell-out to `asc` binary
- `nst_gads_*` — native Google Ads REST
- `nst_admob_*` — native AdMob REST

### Claude Code Configuration

```bash
# From local build
claude mcp add nst-mcp -- node /path/to/nst-mcp/dist/index.js

# From npm (after publishing)
claude mcp add nst-mcp -- npx @nantestudio/nst-mcp

# Development (no build step)
claude mcp add nst-mcp -- npx tsx /path/to/nst-mcp/src/index.ts
```

## Patterns

- Return type for tool handlers must include `[key: string]: unknown` index signature to satisfy the MCP SDK's `CallToolResult` type
- Google Ads uses GAQL (Google Ads Query Language) via REST `searchStream` endpoint — no gRPC dependency needed
- AdMob uses standard REST API v1 (`admob.googleapis.com`)
- Both Google APIs reuse the same `GoogleOAuth` class from `lib/oauth.ts`
