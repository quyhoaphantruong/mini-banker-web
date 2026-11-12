import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import type { RouteDef } from './types.js'

export const routeLabel = (def: RouteDef) => def.path.replace(/:(\w+)/g, '{$1}')
export const routeKeyOf = (def: RouteDef) => `${def.method} ${routeLabel(def)}`

const toPattern = (path: string) => new RegExp(`^${path.replace(/:(\w+)/g, '(?<$1>[^/]+)')}/?$`)

export interface RouteMatch {
  def: RouteDef
  params: Record<string, string | undefined>
}

export function matchRoute(routes: RouteDef[], event: APIGatewayProxyEventV2WithJWTAuthorizer): RouteMatch | null {
  const byKey = routes.find((r) => routeKeyOf(r) === event.routeKey)
  if (byKey) return { def: byKey, params: event.pathParameters ?? {} }

  const method = event.requestContext.http.method.toUpperCase()
  for (const def of routes) {
    if (def.method !== method) continue
    const found = toPattern(def.path).exec(event.rawPath)
    if (found) return { def, params: { ...found.groups } }
  }

  return null
}