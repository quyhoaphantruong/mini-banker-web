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
