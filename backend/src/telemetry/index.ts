import { metrics, trace, type Counter, type Histogram, type Tracer} from "@opentelemetry/api";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { v7 as uuidv7 } from "uuid";

export interface Instruments {
  httpDuration: Histogram;
  cancelCount: Counter;
  searchNotFoundCount: Counter;
}

export interface Telemetry {
  tracer: Tracer;
  instruments: Instruments;
  flush(): Promise<void>;
}

export type AuthHeaderLoader = (parameterName: string) => Promise<string>;

const METER_NAME = "mini-banker-desktop";

function createInstruments(meter: ReturnType<typeof metrics.getMeter>,): Instruments {
  return {
    httpDuration: meter.createHistogram("http.server.duration", {
      unit: "ms",
      description: "Server-side request duration",
    }),
    cancelCount: meter.createCounter("mandate.cancel.count", {description: "Mandates cancelled"}),
    searchNotFoundCount: meter.createCounter("customer.search.notfound.count", {
      description: "Customer searches that matched no CRN",
    }),
  };
}

export function createNoopTelemetry(): Telemetry {
  return {
    tracer: trace.getTracer(METER_NAME),
    instruments: createInstruments(metrics.getMeter(METER_NAME)),
    flush: async () => {},
  };
}

export async function loadAuthHeaderFromSsm(parameterName: string): Promise<string> {
  const ssm = new SSMClient({});
  const out = await ssm.send(new GetParameterCommand({ Name: parameterName, WithDecryption: true }));
  const value = out.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${parameterName} is empty`);
  return toAuthorizationHeader(value);
}

/** Accepts a ready header value, or `instanceId:token` which Grafana Cloud expects as HTTP basic auth. */
export function toAuthorizationHeader(value: string): string {
  const trimmed = value.trim();
  if (/^(Basic|Bearer) /i.test(trimmed)) return trimmed;
  if (trimmed.includes(":")) return `Basic ${Buffer.from(trimmed).toString("base64")}`;
  return `Bearer ${trimmed}`;
}

export async function createTelemetry(
  env: NodeJS.ProcessEnv = process.env,
  loadAuthHeader: AuthHeaderLoader = loadAuthHeaderFromSsm,
): Promise<Telemetry> {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, "");
  if (!endpoint) return createNoopTelemetry();

  const headers: Record<string, string> = {};
  const parameterName = env.OTEL_AUTH_PARAMETER_NAME;
  if (parameterName) {
    try {
      headers.Authorization = await loadAuthHeader(parameterName);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "telemetry.disabled",
          reason: error instanceof Error ? error.name : "unknown",
        }),
      );
      return createNoopTelemetry();
    }
  }

  const resource = resourceFromAttributes({
    "service.name": env.OTEL_SERVICE_NAME ?? "mbd-backend",
    "service.instance.id": uuidv7(),
  });

  const tracerProvider = new TracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers }),
      ),
    ],
  });

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics`, headers}),
        exportIntervalMillis: 60_000,
      }),
    ],
  });

  return {
    tracer: tracerProvider.getTracer(METER_NAME),
    instruments: createInstruments(meterProvider.getMeter(METER_NAME)),
    flush: async () => {await Promise.allSettled([tracerProvider.forceFlush(),meterProvider.forceFlush()]);
    },
  };
}

let cached: Promise<Telemetry> | undefined;

export const getTelemetry = (): Promise<Telemetry> => (cached ??= createTelemetry())