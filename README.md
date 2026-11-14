## Mini Banker Web
A simplified web app that is used by bankers to query transactions of user accounts and process applications mandate from users.

## Functional Requirements

- A banker must sign in before using the app.
- Only users with the banker role can search for customers or cancel mandates.
- A banker can search a customer by customer reference number (CRN).
- The banker can see the customer's mandates (the agreements that let a business or person collect payments from the customer's account).
- The banker can cancel a mandate that is still active or paused.
- A mandate that is already cancelled cannot be cancelled again. The app explains why instead of doing nothing.
- If the banker accidentally submits the same cancellation twice (for example, by double-clicking), it only takes effect once.
- After a cancellation, the mandate shows as cancelled straight away.
- Every cancellation is recorded: who did it, when, which mandate, and why. This record cannot be changed afterwards.

## Architecture

![Mini Banker Web AWS architecture](docs/diagrams/mini-banker-architecture.png)

## Tech Stack

| Technology | What it does here |
|------------|-------------------|
| TypeScript (Node 22) | One language for the whole project, with strict type checking to catch mistakes early. |
| React | The screens bankers use, built as a single-page app. |
| Authorization Code with PKCE flow | Sends the banker to the login page and brings them back signed in. |
| AWS Lambda |  Functions that run the business logic. |
| API Gateway | Receives requests from the browser, checks the login token and passes them to the right function. |
| DynamoDB | Database |
| Amazon Cognito | Holds the banker accounts and the banker group, and issues login tokens. |
| S3 and CloudFront | S3 stores the built website privately, and CloudFront serves it securely to users. |
| CloudWatch and X-Ray | Collect logs, charts, alarms and request traces so we can see how the app is behaving. |
| Terraform | Infrastructure of Code |
| GitHub Actions | Runs CI/CD on every change, then deploys to AWS. |
| Playwright | E2E testing |
| Docker | Containerization |

## Database Design

![Mini Banker Web database design (ERD)](docs/diagrams/database-design-erd-2.png)

## Project Structure

```
mini-banker-web/
├── shared/                  # Code every other part uses: data shapes, database keys, rules
│   └── src
├── backend/                 # The server side that answers the website's requests
│   ├── src/
│   │   ├── lambda/          # Entry points, one per cloud function (launch, customers, mandates)
│   │   ├── http/            # Login check, routing, input checking, errors
│   │   ├── handlers/        # Implemenation of business logics
│   │   ├── domain/          # Banking rules, such as cancelling a mandate
│   │   ├── repo/            # Interacting to database
│   │   ├── telemetry/       # Sends monitoring metrics to CloudWatch
│   │   ├── local/           # Small server for running on your own computer, with a fake login
│   │   ├── config.ts        # Reads settings from the environment
│   │   └── deps.ts          # Connects the pieces together
│   └── scripts/             # Build script that bundles each function
|
├── frontend/                # The UI part
│   ├── src/
│   │   ├── screens/        
│   │   ├── components/      
│   │   ├── api/
│   │   ├── auth.ts          
│   │   └── format.ts        
│   └── public/              # Static files, including config.json
├── seed/                    # Loads fake data
│   └── src/
├── e2e/                     # Browser tests that click through the whole app
│   └── tests/               
├── infra/                   # Terraform files that build the cloud setup
│   ├── bootstrap/           # One-off setup that exist first
│   ├── envs/dev/            # The dev environment, assembled from the modules
│   ├── modules/             # Building blocks: api, cognito, dynamodb, github_oidc, lambda, observability, 
|
├── docs/                    # Design notes, deployment plan, diagrams
├── .github/workflows/       # CI/CD setup for Github Actions
└── docker-compose.yml       # Starts the local database
```
