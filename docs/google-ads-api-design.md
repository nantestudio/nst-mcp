# nst-mcp: Google Ads API Tool Design Document

## Overview

**Tool Name:** nst-mcp (Nante Studio MCP Server)
**Company:** Nante Studio (nantestudio.com)
**Developer Token MCC:** 221-260-0213
**Managed Account:** 108-961-1454
**Contact:** admin@nantestudio.com

## Purpose

nst-mcp is an internal command-line tool that provides a Model Context Protocol (MCP) server interface for managing Google Ads campaigns. It is used exclusively by Nante Studio's internal team (1-2 developers) to manage ad campaigns for our own mobile apps.

## Architecture

nst-mcp is a TypeScript-based MCP server that communicates with the Google Ads API v19 via REST endpoints. It uses OAuth2 for authentication with credentials stored in our internal secrets vault (NanteVault).

```
Developer (CLI) --> nst-mcp (MCP Server) --> Google Ads REST API v19
                                         --> AdMob REST API v1
```

## Google Ads API Usage

### Authentication
- OAuth2 with refresh token flow
- Client credentials stored in NanteVault (encrypted at rest)
- Developer token passed via `developer-token` header
- Manager account ID passed via `login-customer-id` header

### API Operations

#### 1. Reporting (Read-Only)
- Query campaign, ad group, ad, and keyword performance via GAQL
- Retrieve daily/weekly/monthly metrics (impressions, clicks, cost, conversions)
- Search term reports for keyword optimization
- Account-level performance summaries

#### 2. Campaign Management
- Create Search, Display, and Performance Max campaigns
- Set budgets and bidding strategies (Target CPA, Maximize Conversions)
- Pause/enable campaigns
- Location and language targeting

#### 3. Asset Management
- Upload image assets (PNG/JPEG, max 5MB) for display and PMax campaigns
- Create text assets (headlines, descriptions) for responsive ads
- Link assets to ad groups and asset groups

#### 4. Ad Creation
- Create Responsive Search Ads (RSA) with validated headlines/descriptions
- Create Responsive Display Ads (RDA) with images and text
- Create Performance Max asset groups with full asset sets

### Rate Limit Compliance
- All operations use exponential backoff on rate limit errors
- Daily operation count stays well within Basic Access limits (15,000/day)
- Typical daily usage: <100 operations (single-advertiser tool)

## Data Handling
- No customer data is collected or stored beyond what's returned by the API
- API responses are displayed to the internal developer and not persisted
- OAuth credentials are encrypted at rest in NanteVault
- No data is shared with third parties

## User Access
- Internal use only (1-2 developers at Nante Studio)
- No external users, no client-facing interface
- Access controlled via NanteVault authentication

## Compliance
- Tool follows Google Ads API Terms and Conditions
- No automated bidding changes without human review
- Campaigns are created in PAUSED state for manual review before activation
- No bulk account creation or management of third-party accounts
