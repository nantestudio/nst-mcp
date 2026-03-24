import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Google OAuth2 manager for Google Ads and AdMob APIs.
 * Credentials loaded from NanteVault via `nst vault secrets get`.
 */
export class GoogleOAuth {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private refreshToken: string,
  ) {}

  static async fromVault(): Promise<GoogleOAuth> {
    const [clientId, clientSecret, refreshToken] = await Promise.all([
      getVaultSecret("GOOGLE_ADS_CLIENT_ID"),
      getVaultSecret("GOOGLE_ADS_CLIENT_SECRET"),
      getVaultSecret("GOOGLE_ADS_REFRESH_TOKEN"),
    ]);
    return new GoogleOAuth(clientId, clientSecret, refreshToken);
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OAuth2 token refresh failed: ${text}`);
    }

    const data = (await resp.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }
}

async function getVaultSecret(key: string): Promise<string> {
  const { stdout } = await execFileAsync("nst", [
    "vault",
    "secrets",
    "get",
    key,
    "-p",
    "nantestudio",
    "-e",
    "prd",
  ]);
  // nst vault secrets get outputs "VALUE" on stdout
  return stdout.trim();
}

/**
 * Get the Google Ads developer token from vault.
 */
export async function getGadsDeveloperToken(): Promise<string> {
  return getVaultSecret("GOOGLE_ADS_DEVELOPER_TOKEN");
}

/**
 * Get the Google Ads manager account ID from vault.
 */
export async function getGadsManagerId(): Promise<string> {
  return getVaultSecret("GOOGLE_ADS_MANAGER_ID");
}
