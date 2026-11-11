export function assertDevAuthIsLocalOnly(env: NodeJS.ProcessEnv): void {
  if (env.DEV_AUTH === "1" && !env.DYNAMODB_ENDPOINT) {
    throw new Error(
      "DEV_AUTH=1 requires DYNAMODB_ENDPOINT so dev auth can never reach production AWS services",
    );
  }
}

export function devClaims(
  headers: Record<string, string | undefined>,
): Record<string, string> {
  const user = headers["x-dev-user"] || "dev.banker";
  const groups = headers["x-dev-groups"] ?? "banker";
  return {
    sub: user,
    "cognito:username": user,
    "cognito:groups": `[${groups}]`,
  };
}
