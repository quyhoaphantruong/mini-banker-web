export interface AppConfig {
    tableName: string
    region: string
    dynamodbEndpoint: string | undefined
    simulateSearch500Crn: string | undefined
}

const nonEmpty = (value: string | undefined): string | undefined => (value && value.length > 0 ? value : undefined)

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    return {
      tableName: nonEmpty(env.TABLE_NAME) ?? "bdsmini",
      region: nonEmpty(env.AWS_REGION) ?? "ap-southeast-2",
      dynamodbEndpoint: nonEmpty(env.DYNAMODB_ENDPOINT),
      simulateSearch500Crn: nonEmpty(env.SIMULATE_SEARCH_500_CRNS)
    };
}