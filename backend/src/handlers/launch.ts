import { ROUTES, type LaunchResponse } from '@mbd/shared'
import type { RouteDef } from '../http/types.js'

export const launchRoutes: RouteDef[] = [
  {
    method: 'GET',
    path: ROUTES.launch,
    handler: async ({ ctx }) => {
      const body: LaunchResponse = { username: ctx.actor, groups: ctx.groups }
      return { statusCode: 200, body }
    }
  }
]