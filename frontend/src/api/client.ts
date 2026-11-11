import {
  IDEMPOTENCY_HEADER,
  ROUTES,
  type AccountsResponse,
  type CancelMandateRequest,
  type CancelMandateResponse,
  type CapId,
  type CustomerDto,
  type ErrorBody,
  type LaunchResponse,
  type MandateDetailDto,
  type MandateEventsResponse,
  type MandateId,
  type MandateStatus,
  type MandateTransactionsResponse,
  type MandatesResponse,
  type SearchRequest,
  type SearchResponse,
} from "@mbd/shared";

/** status 0 means the request never got a response (network failure). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ErrorBody | null;

  constructor(status: number, body: ErrorBody | null, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function parseErrorBody(raw: unknown): ErrorBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.code !== "string" || typeof r.message !== "string") return null;
  return {
    code: r.code as ErrorBody["code"],
    message: r.message,
    requestId: typeof r.requestId === "string" ? r.requestId : "",
  };
}

export type HeaderSource = () => Promise<Record<string, string>>;

export function createApiClient(apiBaseUrl: string, getHeaders: HeaderSource) {
  // ROUTES already start with /api. apiBaseUrl replaces that prefix so CloudFront and the Vite proxy both work.
  const url = (
    route: string,
    params: Record<string, string> = {},
    query?: Record<string, string>,
  ) => {
    let path = route.replace(/^\/api/, apiBaseUrl);
    for (const [k, v] of Object.entries(params))
      path = path.replace(`:${k}`, encodeURIComponent(v));
    return query ? `${path}?${new URLSearchParams(query).toString()}` : path;
  };

  async function request<T>(
    method: "GET" | "POST",
    target: string,
    init: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
    let res: Response;
    try {
      const authHeaders = await getHeaders();
      res = await fetch(target, {
        method,
        headers: {
          Accept: "application/json",
          ...(init.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
          ...authHeaders,
          ...init.headers,
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch (cause) {
      throw new ApiError(
        0,
        null,
        cause instanceof Error ? cause.message : "Network error",
      );
    }

    if (!res.ok) {
      const body = parseErrorBody(await res.json().catch(() => null));
      throw new ApiError(
        res.status,
        body,
        body?.message ?? `Request failed with ${res.status}`,
      );
    }

    return (await res.json()) as T;
  }

  return {
    launch: () => request<LaunchResponse>("GET", url(ROUTES.launch)),
    search: (crn: string) =>
      request<SearchResponse>("POST", url(ROUTES.search), {
        body: { crn } satisfies SearchRequest,
      }),
    customer: (capId: CapId) =>
      request<CustomerDto>("GET", url(ROUTES.customer, { capId })),
    accounts: (capId: CapId) =>
      request<AccountsResponse>("GET", url(ROUTES.accounts, { capId })),
    mandates: (capId: CapId, status: MandateStatus) =>
      request<MandatesResponse>(
        "GET",
        url(ROUTES.mandates, { capId }, { status }),
      ),
    mandate: (id: MandateId) =>
      request<MandateDetailDto>("GET", url(ROUTES.mandate, { id })),
    mandateEvents: (id: MandateId) =>
      request<MandateEventsResponse>("GET", url(ROUTES.mandateEvents, { id })),
    mandateTransactions: (id: MandateId) =>
      request<MandateTransactionsResponse>(
        "GET",
        url(ROUTES.mandateTransactions, { id }),
      ),
    cancelMandate: (id: MandateId, idempotencyKey: string) =>
      request<CancelMandateResponse>(
        "POST",
        url(ROUTES.mandateCancel, { id }),
        {
          body: {} satisfies CancelMandateRequest,
          headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
        },
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
