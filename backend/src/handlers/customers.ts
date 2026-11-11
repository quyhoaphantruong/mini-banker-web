import {
  ROUTES,
  type AccountsResponse,
  type CustomerDto,
  type SearchResponse,
} from "@mbd/shared";
import { buildAuditLine } from "../domain/audit.js";
import { HttpError, notFound } from "../http/errors.js";
import {
  capIdParam,
  parseCrn,
  parseJsonBody,
  searchBodySchema,
} from "../http/parse.js";
import type { RouteDef } from "../http/types.js";

export const customerRoutes: RouteDef[] = [
  {
    method: "POST",
    path: ROUTES.search,
    handler: async ({ rawBody, metrics }, { repo, config }) => {
      const { crn: rawCrn } = parseJsonBody(searchBodySchema, rawBody);
      if (config.simulateSearch500Crn === rawCrn) {
        throw new HttpError(500, "INTERNAL", "Simulated search failure");
      }
      const crn = parseCrn(rawCrn);
      const capId = await repo.getCapIdForCrn(crn);
      if (!capId) {
        metrics.searchNotFoundCount.add(1);
        throw notFound("Customer");
      }
      const body: SearchResponse = { crn, capIds: [capId] };
      return { statusCode: 200, body };
    },
  },
  {
    method: "GET",
    path: ROUTES.customer,
    handler: async ({ ctx, params }, { repo, audit, now }) => {
      const capId = capIdParam(params.capId);
      const profile = await repo.getProfile(capId);
      if (!profile) throw notFound("Customer");
      audit(
        buildAuditLine(
          {
            actor: ctx.actor,
            capId,
            route: ctx.route,
            requestId: ctx.requestId,
            traceId: ctx.traceId,
          },
          now(),
        ),
      );
      const body: CustomerDto = {
        capId: profile.capId,
        crn: profile.crn,
        fullName: profile.fullName,
        customerType: profile.customerType,
        kycStatus: profile.kycStatus,
        verificationStatus: profile.verificationStatus,
        dob: profile.dob ?? null,
        address: profile.address,
      };
      return { statusCode: 200, body };
    },
  },
  {
    method: "GET",
    path: ROUTES.accounts,
    handler: async ({ params }, { repo }) => {
      const accounts = await repo.listAccounts(capIdParam(params.capId));
      const body: AccountsResponse = {
        accounts: accounts.map((a) => ({
          accountNo: a.accountNo,
          bsb: a.bsb,
          description: a.description,
          status: a.status,
          balanceCents: a.balanceCents,
        })),
      };
      return { statusCode: 200, body };
    },
  },
];