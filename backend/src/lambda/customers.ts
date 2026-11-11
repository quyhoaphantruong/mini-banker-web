import { createDeps } from "../deps.js";
import { customerRoutes } from "../handlers/customers";
import { createHandler } from "../http/handler";

export const handler = createHandler(customerRoutes, createDeps());