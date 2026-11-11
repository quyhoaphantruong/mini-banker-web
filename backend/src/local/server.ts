import { createServer, type IncomingMessage } from "node:http";
import { v7 as uuidv7 } from "uuid";
import { createDeps } from "../deps.js";
import { createHandler, type ApiEvent } from "../http/handler.js";
import { allRoutes } from "../routes.js";
import { assertDevAuthIsLocalOnly, devClaims } from "./devAuth.js";

assertDevAuthIsLocalOnly(process.env);

const devAuth = process.env.DEV_AUTH === "1";
const port = Number(process.env.PORT ?? 3001);
const handler = createHandler(allRoutes, createDeps());

async function readBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : undefined;
}

function toEvent(req: IncomingMessage, body: string | undefined): ApiEvent {
  const url = new URL(req.url ?? "/", "http://localhost");
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers[name] = value;
  }
  const method = (req.method ?? "GET").toUpperCase();
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    isBase64Encoded: false,
    ...(body !== undefined ? { body } : {}),
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "localhost",
      requestId: uuidv7(),
      routeKey: "$default",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
      http: {
        method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: headers["user-agent"] ?? "",
      },
      authorizer: {
        principalId: "dev",
        integrationLatency: 0,
        jwt: { claims: devAuth ? devClaims(headers) : {}, scopes: [] },
      },
    },
  };
}

createServer(async (req, res) => {
  try {
    const result = await handler(toEvent(req, await readBody(req)));
    res.writeHead(
      result.statusCode ?? 500,
      result.headers as Record<string, string>,
    );
    res.end(result.body);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ code: "INTERNAL", message: "Unexpected error" }));
  }
}).listen(port, () => {
  console.log(JSON.stringify({ event: "server.listening", port, devAuth }));
});