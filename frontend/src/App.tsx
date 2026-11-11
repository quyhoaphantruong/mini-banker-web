import type { CapId, MandateId, MandateStatus } from "@mbd/shared";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, createApiClient } from "./api/client";
import { ApiContext, useApi } from "./api/context";
import type { Auth } from "./auth";
import type { AppConfig } from "./config";
import { Spinner } from "./components/feedback";
import { CustomerScreen, type CustomerTab } from "./screens/CustomerScreen";
import {
  LoginScreen,
  NotAuthorisedScreen,
  SystemUnavailableScreen,
} from "./screens/gates";
import { MandateDetailScreen } from "./screens/MandateDetailScreen";
import { SearchScreen } from "./screens/SearchScreen";

interface CustomerView {
  capId: CapId;
  tab: CustomerTab;
  status: MandateStatus;
}

type View =
  | { kind: "search" }
  | ({ kind: "customer" } & CustomerView)
  | { kind: "mandate"; mandateId: MandateId; from: CustomerView };

export function App({ config, auth }: { config: AppConfig; auth: Auth }) {
  const api = useMemo(
    () => createApiClient(config.apiBaseUrl, auth.headers),
    [config.apiBaseUrl, auth],
  );
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ApiContext.Provider value={api}>
        {auth.isAuthenticated ? (
          <EntitlementGate auth={auth} />
        ) : (
          <LoginScreen onLogin={() => void auth.login()} />
        )}
      </ApiContext.Provider>
    </QueryClientProvider>
  );
}

function EntitlementGate({ auth }: { auth: Auth }) {
  const api = useApi();
  const launch = useQuery({ queryKey: ["Launch"], queryFn: api.launch });

  if (launch.isPending)
    return (
      <main className="center-screen">
        <Spinner label="Signing in" />
      </main>
    );
  if (launch.isError) {
    const denied =
      launch.error instanceof ApiError &&
      (launch.error.status === 401 || launch.error.status === 403);
    return denied ? (
      <NotAuthorisedScreen onSignOut={() => void auth.logout()} />
    ) : (
      <SystemUnavailableScreen onRetry={() => void launch.refetch()} />
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <strong>Mini Banker Desktop</strong>
        <span className="topbar-user">
          {launch.data.username}
          <button
            type="button"
            className="btn btn-small"
            onClick={() => void auth.logout()}
          >
            Sign out
          </button>
        </span>
      </header>
      <main className="content">
        <Workspace />
      </main>
    </div>
  );
}

function Workspace() {
  const [view, setView] = useState<View>({ kind: "search" });

  if (view.kind === "mandate") {
    const { from } = view;
    return (
      <MandateDetailScreen
        mandateId={view.mandateId}
        onBack={() => setView({ kind: "customer", ...from })}
      />
    );
  }
  if (view.kind === "customer") {
    const current: CustomerView = {
      capId: view.capId,
      tab: view.tab,
      status: view.status,
    };
    return (
      <>
        <button
          type="button"
          className="btn btn-link"
          onClick={() => setView({ kind: "search" })}
        >
          New search
        </button>
        <CustomerScreen
          {...current}
          onTabChange={(tab) => setView({ kind: "customer", ...current, tab })}
          onStatusChange={(status) =>
            setView({ kind: "customer", ...current, status })
          }
          onOpenMandate={(mandateId) =>
            setView({ kind: "mandate", mandateId, from: current })
          }
        />
      </>
    );
  }

  return (
    <SearchScreen
      onFound={(capId) =>
        setView({ kind: "customer", capId, tab: "profile", status: "ACTIVE" })
      }
    />
  );
}