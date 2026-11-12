import { CRN_SIMULATED_500, TABLE_NAME_DEFAULT } from '@mbd/shared'

export const DYNAMODB_PORT = 8000
export const BACKEND_PORT = 3001
export const FRONTEND_PORT = 5173

export const DYNAMODB_ENDPOINT = `http://localhost:${DYNAMODB_PORT}`
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`
export const TABLE_NAME = TABLE_NAME_DEFAULT
export const REGION = 'ap-southeast-2'
export const SIMULATE_SEARCH_500_CRN = CRN_SIMULATED_500
