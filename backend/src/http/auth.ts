import { BANKER_GROUP } from "@mbd/shared";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { forbidden, unauthenticated } from "./errors.js";

export interface Caller {
  actor: string;
  groups: string[];
}

export function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw.filter((g): g is string => typeof g === "string");
  if (typeof raw !== "string") return [];
  return raw
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .map((g) => g.replace(/^['"]|['"]$/g, ""))
    .filter((g) => g.length > 0);
}

export function authenticate(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Caller {
  const claims: Record<string, unknown> | undefined =
    event.requestContext.authorizer?.jwt?.claims;
  if (!claims || Object.keys(claims).length === 0) throw unauthenticated();

  const actor = [claims["cognito:username"], claims.username, claims.sub].find(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (!actor) throw unauthenticated();

  const groups = parseGroups(claims["cognito:groups"]);
  if (!groups.includes(BANKER_GROUP)) throw forbidden();
  return { actor, groups };
}