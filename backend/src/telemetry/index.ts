/**
 * CloudWatch-only telemetry.
 *
 * Metrics are written as CloudWatch Embedded Metric Format (EMF) log lines. Lambda ships stdout to
 * CloudWatch Logs, which extracts the metrics asynchronously: no SDK, no exporter, no flush, no IAM
 * beyond the log permissions the function already has. Traces come from Lambda active tracing
 * (X-Ray); the handler only reads the trace id so log lines can be joined to the trace.
 *
 * Outside Lambda (local dev, tests) the metrics are no-ops unless `EMF_ENABLED=1`.
 */

export const METRIC_NAMESPACE = "MiniBankerDesktop";

export type MetricAttributes = Record<string, string>;

export interface Histogram {
  record(value: number, attributes?: MetricAttributes): void;
}

export interface Counter {
  add(value: number, attributes?: MetricAttributes): void;
}

export interface Instruments {
  httpDuration: Histogram;
  cancelCount: Counter;
  searchNotFoundCount: Counter;
}

export interface Telemetry {
  instruments: Instruments;
  /** X-Ray trace id of the current invocation (`1-xxxxxxxx-...`), or null when not traced. */
  traceId(): string | null;
}

type Unit = "Milliseconds" | "Count";
export type EmfWriter = (line: string) => void;

interface EmfOptions {
  service: string;
  write?: EmfWriter;
  env?: NodeJS.ProcessEnv;
}

/** Builds one EMF document. Each attribute becomes a dimension; `Service` is always present. */
export function emfLine(
  service: string,
  name: string,
  unit: Unit,
  value: number,
  attributes: MetricAttributes = {},
  timestamp = Date.now(),
): string {
  const dimensions = { Service: service, ...attributes };
  return JSON.stringify({
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: METRIC_NAMESPACE,
          Dimensions: [Object.keys(dimensions)],
          Metrics: [{ Name: name, Unit: unit }],
        },
      ],
    },
    ...dimensions,
    [name]: value,
  });
}

/** Reads the X-Ray root id from `Root=1-...;Parent=...;Sampled=1`. */
export function xrayTraceId(env: NodeJS.ProcessEnv = process.env): string | null {
  const header = env._X_AMZN_TRACE_ID;
  const root = header?.split(";").find((part) => part.startsWith("Root="));
  return root ? root.slice("Root=".length) : null;
}

export function createEmfTelemetry({ service, write = console.log, env = process.env }: EmfOptions): Telemetry {
  const emit = (name: string, unit: Unit, value: number, attributes?: MetricAttributes) =>
    write(emfLine(service, name, unit, value, attributes));

  return {
    instruments: {
      // Dimensions are route and status class only, to keep the metric count (and cost) small.
      httpDuration: {
        record: (value, attributes = {}) =>
          emit("RequestDuration", "Milliseconds", value, {
            Route: attributes["http.route"] ?? "unknown",
            StatusClass: `${(attributes["http.status_code"] ?? "0").charAt(0)}xx`,
          }),
      },
      cancelCount: { add: (value) => emit("MandatesCancelled", "Count", value) },
      searchNotFoundCount: { add: (value) => emit("CustomerSearchNotFound", "Count", value) },
    },
    // Read per call: Lambda sets _X_AMZN_TRACE_ID for every invocation.
    traceId: () => xrayTraceId(env),
  };
}

export function createNoopTelemetry(): Telemetry {
  const noop = { record: () => {}, add: () => {} };
  return {
    instruments: { httpDuration: noop, cancelCount: noop, searchNotFoundCount: noop },
    traceId: () => null,
  };
}

export function createTelemetry(env: NodeJS.ProcessEnv = process.env): Telemetry {
  const inLambda = Boolean(env.AWS_LAMBDA_FUNCTION_NAME);
  if (!inLambda && env.EMF_ENABLED !== "1") return createNoopTelemetry();
  return createEmfTelemetry({
    service: env.SERVICE_NAME ?? env.AWS_LAMBDA_FUNCTION_NAME ?? "mbd-backend",
    env,
  });
}

let cached: Telemetry | undefined;

export const getTelemetry = (): Telemetry => (cached ??= createTelemetry());
