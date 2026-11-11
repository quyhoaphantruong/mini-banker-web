import type { CapId, Crn, MandateId } from "@mbd/shared";
import { z } from "zod";
import { invalidRequest } from "./errors.js";

const idSchema = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);

export const capIdParam = (raw: string | undefined): CapId => parseWith(idSchema, raw, "capId");
export const mandateIdParam = (raw: string | undefined): MandateId => parseWith(idSchema, raw, "mandateId");

export const searchBodySchema = z.object({
  crn: z.string().regex(/^\d{3,15}$/),
});
export const parseCrn = (crn: string) => crn as Crn;

export function parseWith<S extends z.ZodType>(
  schema: S,
  value: unknown,
  what: string,
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidRequest(`Invalid ${what}`);
  return parsed.data;
}

export function parseJsonBody<S extends z.ZodType>(
  schema: S,
  rawBody: string | undefined,
): z.output<S> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody ?? "");
  } catch {
    throw invalidRequest("Request body must be JSON");
  }
  return parseWith(schema, json, "request body");
}