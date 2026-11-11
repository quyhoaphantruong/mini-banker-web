import {
  InMemoryWebStorage,
  UserManager,
  WebStorageStateStore,
} from "oidc-client-ts";
import type { AppConfig } from "./config";

export interface Auth {
  /** False means the user must go through the Login screen. */
  isAuthenticated: boolean;
  headers(): Promise<Record<string, string>>;
  login(): Promise<void>;
  logout(): Promise<void>;
}

/** Local dev: the backend trusts these headers when started with dev auth. */
export function createDevAuth(): Auth {
  return {
    isAuthenticated: true,
    headers: () =>
      Promise.resolve({ "x-dev-user": "dev.banker", "x-dev-groups": "banker" }),
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };
}

export async function createOidcAuth(config: AppConfig): Promise<Auth> {
  const manager = new UserManager({
    authority: config.oidc.authority,
    client_id: config.oidc.clientId,
    redirect_uri: config.oidc.redirectUri,
    post_logout_redirect_uri: config.oidc.postLogoutRedirectUri,
    scope: config.oidc.scope,
    response_type: "code",
    // PKCE state must survive the redirect, so it lives in sessionStorage. Tokens stay in memory only.
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
  });

  const params = new URLSearchParams(window.location.search);
  if (params.has("code") && params.has("state")) {
    await manager.signinRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const user = await manager.getUser();

  return {
    isAuthenticated: user !== null && !user.expired,
    async headers() {
      const current = await manager.getUser();
      return current ? { Authorization: `Bearer ${current.access_token}` } : {};
    },
    login: () => manager.signinRedirect(),
    logout: () => manager.signoutRedirect(),
  };
}

export function createAuth(config: AppConfig): Promise<Auth> {
  return config.devAuth
    ? Promise.resolve(createDevAuth())
    : createOidcAuth(config);
}
