The project is a pet project with one goal: hands-on AWS experience with the shape of banker desktop tool. Every choice below serves that goal first and production second.

## Why Typescript
The babackend and frontend choose Typescript on Node 22.

1. the `shared/` workspace holds the route table, the DTOs, the error codes, the DynamoDB key builders, and the mandate state machine. The backend and the frontend improt the same files.
With Java or Golang, you would keep a second copy of these types which will increase a lot of time for handling both types from two different places.

2. Node starts fast on Lambda and `backend/scripts/build.mjs` bundles each handler group into one `.mjs` file.

What is the disadvantage of this approach ?
the type system 

## Why Lambda

The backend runs as three Lambda function (`launch`, `customers`, `mandates`) behind an API Gateway HTTP Api with a JWT authorizer.

What is the disadvantage of this approach ?
1. A cold start latency to the first request after a quite period

## Why DynamoDB

1. It fits Lambda. There are no connections to manage and no servers to patch, and it scales to zero cost when idle. It bills per request, so a pet project costs almost nothing.
2. It gives ACID gurantees. Cancelling a mandate is one transaction and writes the audit record together, so both happen or neither does. A TTL on idempotency keys makes a double-click safe and cleans up after itself.
3. Simple to setup.

What is the disadvantage of this approach ?
1. You must know your access patterns before you build. A new kind of question can mean a new index or a data migration, where SQL would just need a new query.
2. No joins and no ad-hoc reporting. Anything beyond the planned lookups is hard.
