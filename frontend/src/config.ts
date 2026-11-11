export interface OidcConfig {
    authority: string 
    clientId: string
    redirectUri: string
    postLogoutRedirectUri: string
    scope: string
}

export interface AppConfig {
    apiBaseUrl: string
    oidc: OidcConfig
    devAuth: boolean
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null
}

export function parseConfig(raw: unknown): AppConfig {
    if (!isRecord(raw) || typeof raw.apiBaseUrl !== 'string' || typeof raw.devAuth !== 'boolean' || !isRecord(raw.oidc)) {
        throw new Error('config.json is malformed');
    }
    const o = raw.oidc
    const { authority, clientId, redirectUri, postLogoutRedirectUri, scope } =
      o;
    if (
      typeof authority !== "string" ||
      typeof clientId !== "string" ||
      typeof redirectUri !== "string" ||
      typeof postLogoutRedirectUri !== "string" ||
      typeof scope !== "string"
    ) {
      throw new Error("config.json is malformed");
    }
    return {
      apiBaseUrl: raw.apiBaseUrl.replace(/\/$/, ""),
      devAuth: raw.devAuth,
      oidc: { authority, clientId, redirectUri, postLogoutRedirectUri, scope },
    };
}

export async function loadConfig(): Promise<AppConfig> {
    const res = await fetch('/config.json', {cache: 'no-store'})
    if (!res.ok) throw new Error(`config.json returned ${res.status}`)
    return parseConfig(await res.json())
}

