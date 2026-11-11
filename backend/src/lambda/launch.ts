import { createDeps } from "../deps.js";
import { launchRoutes } from "../handlers/launch.js";
import { createHandler } from "../http/handler.js";

export const handler = createHandler(launchRoutes, createDeps());