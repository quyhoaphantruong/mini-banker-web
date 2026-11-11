import type { ErrorCode } from "@mbd/shared";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const unauthenticated = () =>
  new HttpError(401, "UNAUTHENTICATED", "Authentication required");
export const forbidden = () =>
  new HttpError(403, "FORBIDDEN", "Not authorised for this service");
export const notFound = (what: string) =>
  new HttpError(404, "NOT_FOUND", `${what} not found`);
export const invalidRequest = (message: string) =>
  new HttpError(400, "INVALID_REQUEST", message);
