import {
  IDEMPOTENCY_HEADER,
  MANDATE_STATUSES,
  ROUTES,
  type MandateEventsResponse,
  type MandatesResponse,
  type MandateTransactionsResponse,
} from "@mbd/shared";
import { z } from "zod";
import { cancelMandate } from "../domain/cancelMandate.js";
import { toMandateDetailDto } from "../domain/mandate.js";
import { HttpError, notFound } from "../http/errors.js";
import {
  capIdParam,
  mandateIdParam,
  parseJsonBody,
  parseWith,
} from "../http/parse.js";
import type { RouteDef } from "../http/types.js";

const statusQuerySchema = z.enum(MANDATE_STATUSES).optional();
const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const cancelBodySchema = z.object({ reasonCode: z.literal("MD16").optional() });

export const mandateRoutes: RouteDef[] = [
  {
    method: "GET",
    path: ROUTES.mandates,
    handler: async ({ params, query }, { repo }) => {
      const capId = capIdParam(params.capId);
      const status = parseWith(statusQuerySchema, query.status, "status");
      const items = await repo.listMandates(capId, status);
      const body: MandatesResponse = {
        mandates: items.map((m) => ({
          mandateId: m.mandateId,
          initiator: m.initiator,
          shortDescription: m.shortDescription,
          maxAmountCents: m.maxAmountCents,
          amountCents: m.amountCents,
          frequency: m.frequency,
          amountType: m.amountType,
          status: m.status,
          hasPendingAmendment: m.hasPendingAmendment,
        })),
      };
      return { statusCode: 200, body };
    },
  },
  {
    method: "GET",
    path: ROUTES.mandate,
    handler: async ({ params }, { repo }) => {
      const meta = await repo.getMandate(mandateIdParam(params.id));
      if (!meta) throw notFound("Mandate");
      return { statusCode: 200, body: toMandateDetailDto(meta) };
    },
  },
  {
    method: "GET",
    path: ROUTES.mandateEvents,
    handler: async ({ params }, { repo }) => {
      const events = await repo.listEvents(mandateIdParam(params.id));
      const body: MandateEventsResponse = {
        events: events.map((e) => ({
          at: e.at,
          action: e.action,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          reasonCode: e.reasonCode,
          reasonDescription: e.reasonDescription,
          actor: e.actor,
        })),
      };
      return { statusCode: 200, body };
    },
  },
  {
    method: "GET",
    path: ROUTES.mandateTransactions,
    handler: async ({ params }, { repo }) => {
      const txns = await repo.listTransactions(mandateIdParam(params.id));
      const body: MandateTransactionsResponse = {
        transactions: txns.map((t) => ({
          at: t.at,
          description: t.description,
          amountCents: t.amountCents,
          status: t.status,
        })),
      };
      return { statusCode: 200, body };
    },
  },
  {
    method: "POST",
    path: ROUTES.mandateCancel,
    handler: async (
      { ctx, params, headers, rawBody, metrics },
      { repo, now },
    ) => {
      const rawKey = headers[IDEMPOTENCY_HEADER.toLowerCase()]?.trim();
      if (!rawKey) {
        throw new HttpError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          `${IDEMPOTENCY_HEADER} header is required`,
        );
      }

      const idempotencyKey = parseWith(
        idempotencyKeySchema,
        rawKey,
        IDEMPOTENCY_HEADER,
      );
      const mandateId = mandateIdParam(params.id);
      const { reasonCode } = rawBody?.trim()
        ? parseJsonBody(cancelBodySchema, rawBody)
        : {};

      const result = await cancelMandate(repo, {
        mandateId,
        idempotencyKey,
        actor: ctx.actor,
        requestId: ctx.requestId,
        reasonCode,
        now: now(),
      });

      switch (result.kind) {
        case "cancelled":
          metrics.cancelCount.add(1);
          return result.response;
        case "replayed":
          return result.response;
        case "not-found":
          throw notFound("Mandate");
        case "invalid-transition":
          throw new HttpError(
            409,
            "INVALID_TRANSITION",
            "Mandate cannot be cancelled from its current status",
          );
        case "version-conflict":
          throw new HttpError(
            409,
            "VERSION_CONFLICT",
            "Mandate was changed by another request, retry",
          );
      }
    },
  },
];
