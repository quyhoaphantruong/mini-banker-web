import { loadConfig } from './config.js'
import { createDb } from './repo/dynamo.js'
import { createRepository } from './repo/repository.js'
import { getTelemetry } from './telemetry/index.js'
import type { Deps } from './http/types.js'

export function createDeps(env: NodeJS.ProcessEnv = process.env): Deps {
  const config = loadConfig(env)
  return {
    repo: createRepository(createDb(config)),
    telemetry: getTelemetry,
    config,
    audit: (line) => console.log(JSON.stringify(line)),
    now: () => new Date()
  }
}