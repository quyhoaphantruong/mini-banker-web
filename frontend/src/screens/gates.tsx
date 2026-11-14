import { TEST_IDS } from "@mbd/shared";

export function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="center-screen">
      <h1>Mini Banker Web</h1>
      <p>Sign in with your bank account to continue.</p>
      <button
        type="button"
        className="btn btn-primary"
        data-testid={TEST_IDS.loginButton}
        onClick={onLogin}
      >
        Sign in
      </button>
    </main>
  );
}

export function NotAuthorisedScreen({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="center-screen" data-testid={TEST_IDS.notAuthorised}>
      <h1>Authorised users only</h1>
      <p>
        Your account is not entitled to use Mini Banker Web. Ask your
        administrator to add you to the banker group.
      </p>
      <button type="button" className="btn" onClick={onSignOut}>
        Sign out
      </button>
    </main>
  );
}

/** Deliberately different wording from NotAuthorisedScreen: retrying can help here, not there. */
export function SystemUnavailableScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="center-screen center-screen-warn" role="alert">
      <h1>System not available</h1>
      <p>
        We could not reach Mini Banker Web. This is usually temporary. Please try
        again.
      </p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    </main>
  );
}
