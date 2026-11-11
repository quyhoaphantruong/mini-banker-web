import { customerRoutes } from "./handlers/customers.js";
import { launchRoutes } from "./handlers/launch.js";
import { mandateRoutes } from "./handlers/mandates.js";
import type { RouteDef } from "./http/types.js";

export const allRoutes: RouteDef[] = [
  ...launchRoutes,
  ...customerRoutes,
  ...mandateRoutes,
];
