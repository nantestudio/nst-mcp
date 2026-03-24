import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as vault } from "./vault.js";
import { register as links } from "./links.js";
import { register as ads } from "./ads.js";
import { register as appstore } from "./appstore.js";
import { register as asc } from "./asc.js";
import { register as play } from "./play.js";
import { register as analytics } from "./analytics.js";
import { register as passwords } from "./passwords.js";
import { register as googleAds } from "./google-ads.js";
import { register as admob } from "./admob.js";

export const domains: Array<(server: McpServer) => void> = [
  vault,
  links,
  ads,
  appstore,
  asc,
  play,
  analytics,
  passwords,
  googleAds,
  admob,
];
