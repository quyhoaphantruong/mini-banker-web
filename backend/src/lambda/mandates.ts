import { createDeps } from "../deps.js";
import { mandateRoutes } from "../handlers/mandates.js";
import { createHandler } from "../http/handler.js";

export const handler = createHandler(mandateRoutes, createDeps());
