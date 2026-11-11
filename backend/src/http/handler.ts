import {
  SpanKind,
  SpanStatusCode,
  isSpanContextValid,
} from "@opentelemetry/api";
import type { ErrorBody } from "@mbd/shared";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { authenticate } from "./auth.js";
import { HttpError, notFound } from "./errors.js";
import { matchRoute, routeLabel } from "./router.js";
import type { Deps, HttpResult, RouteDef } from "./types.js";

export type ApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;

const errorResult = (error: HttpError, requestId: string): HttpResult => {
  const body: ErrorBody = {
    code: error.code,
    message: error.message,
    requestId,
  };
  return { statusCode: error.statusCode, body };
};

function decodeBody(event: ApiEvent): string | undefined {
  if (!event.body) return undefined;
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
}

function lowerCaseHeaders(
  headers: ApiEvent["headers"],
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
}

export function createHandler(routes: RouteDef[], deps: Deps) {
  return async (
    event: ApiEvent,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const startedAt = performance.now();
    const requestId = event.requestContext.requestId;
    const telemetry = await deps.telemetry();
    const match = matchRoute(routes, event);
    const method = event.requestContext.http.method.toUpperCase();
    const route = match ? routeLabel(match.def) : "unmatched";

    const span = telemetry.tracer.startSpan(`${method} ${route}`, {
      kind: SpanKind.SERVER,
      attributes: { "http.method": method, "http.route": route },
    });
    const spanContext = span.spanContext();
    const traceId = isSpanContextValid(spanContext)
      ? spanContext.traceId
      : null;

    let result: HttpResult;
    try {
      if (!match) throw notFound("Route");
      const caller = authenticate(event);
      result = await match.def.handler(
        {
          ctx: { requestId, traceId, route, ...caller },
          params: match.params,
          query: event.queryStringParameters ?? {},
          headers: lowerCaseHeaders(event.headers),
          rawBody: decodeBody(event),
          metrics: telemetry.instruments,
        },
        deps,
      );
    } catch (error) {
      if (error instanceof HttpError) {
        result = errorResult(error, requestId);
      } else {
        const name = error instanceof Error ? error.name : "UnknownError";
        const message = error instanceof Error ? error.message : "unknown";
        console.error(
          JSON.stringify({
            event: "request.failed",
            requestId,
            traceId,
            route,
            name,
            message,
          }),
        );
        span.recordException(
          error instanceof Error ? error : new Error(String(error)),
        );
        result = errorResult(
          new HttpError(500, "INTERNAL", "Unexpected error"),
          requestId,
        );
      }
    }

    const status = String(result.statusCode);
    span.setAttribute("http.status_code", result.statusCode);
    if (result.statusCode >= 500)
      span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();

    telemetry.instruments.httpDuration.record(performance.now() - startedAt, {
      "http.route": route,
      "http.status_code": status,
      "http.method": method,
    });
    await telemetry.flush();

    return {
      statusCode: result.statusCode,
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify(result.body),
    };
  };
}
