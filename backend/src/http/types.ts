import type { Instruments } from "../telemetry/index.js";
import type { Telemetry } from "../telemetry/index.js";
import type { AuditLine } from "../domain/audit.js";
import type { Repository } from "../repo/repository.js";
import type { AppConfig } from "../config.js";

export interface Deps {
  repo: Repository;
  telemetry: () => Promise<Telemetry>;
  config: Pick<AppConfig, "simulateSearch500Crn">;
  audit: (line: AuditLine) => void;
  now: () => Date;
}

export interface RequestContext {
  requestId: string;
  traceId: string | null;
  actor: string;
  groups: string[];
  route: string;
}

export interface RouteRequest {
  ctx: RequestContext;
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  rawBody: string | undefined;
  metrics: Instruments;
}

export interface HttpResult {
  statusCode: number;
  body: unknown;
}

export type RouteHandler = (
  req: RouteRequest,
  deps: Deps,
) => Promise<HttpResult>;

export interface RouteDef {
  method: "GET" | "POST";
  path: string;
  handler: RouteHandler;
}
