# NotifyHub

NotifyHub is a production-grade, multi-tenant notification platform for sending and tracking email, SMS, push, and webhook notifications through a centralized API.

The system is built as a modular Node.js service with independently runnable API, worker, and scheduler processes. It uses PostgreSQL for durable state, Redis and BullMQ for background delivery, and explicit domain boundaries so notification channels, providers, rate limits, retries, and analytics can evolve independently.

## Features

- Multi-tenant onboarding with API key issuance.
- API key authentication and short-lived JWT token issuance.
- Email, SMS, push, and webhook notification intake.
- Tenant-scoped notification templates with `{{variable}}` rendering.
- Idempotent notification requests.
- Redis-backed tenant rate limiting.
- BullMQ delivery queue and worker process.
- Mock and HTTP-backed provider adapters for all notification channels.
- Retry with exponential backoff and dead-letter status.
- Delivery attempt history API with provider metadata.
- Queue monitoring metrics for the notification delivery queue.
- Dead-letter queue listing and replay.
- Notification listing, filtering, pagination, and analytics.
- Tenant-scoped audit log reads.
- OpenAPI/Swagger documentation.
- Health checks, structured logging, environment validation, Docker Compose, and CI.

## Stack

- Node.js 22 LTS
- TypeScript
- Fastify
- PostgreSQL
- Redis
- BullMQ
- Docker Compose
- Vitest
- GitHub Actions

## Documentation

- [Architecture](docs/architecture.md)
- [API Usage](docs/api-usage.md)
- [Development and Testing](docs/development.md)
- [Operations](docs/operations.md)

## Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run db:migrate
npm run dev:api
```

API documentation is available at `http://localhost:3000/docs` once the API server is running.

Run the worker in a separate terminal to process queued notification delivery jobs:

```bash
npm run dev:worker
```

Run the scheduler in a separate terminal to promote due scheduled notifications into the delivery queue:

```bash
npm run dev:scheduler
```

## Basic Usage

Create a tenant and receive a one-time API key:

```bash
curl -X POST http://localhost:3000/v1/tenants \
  -H 'content-type: application/json' \
  -d '{
    "name": "Acme",
    "slug": "acme"
  }'
```

Send a notification with the returned API key:

```bash
curl -X POST http://localhost:3000/v1/notifications \
  -H 'content-type: application/json' \
  -H 'x-api-key: <api-key>' \
  -H 'idempotency-key: welcome-email-001' \
  -d '{
    "channel": "email",
    "recipient": "user@example.com",
    "subject": "Welcome",
    "body": "Hello from NotifyHub"
  }'
```

Create a template and send a templated notification:

```bash
curl -X POST http://localhost:3000/v1/templates \
  -H 'content-type: application/json' \
  -H 'x-api-key: <api-key>' \
  -d '{
    "name": "Welcome email",
    "channel": "email",
    "subjectTemplate": "Welcome {{name}}",
    "bodyTemplate": "Hello {{name}}, your plan is {{plan}}."
  }'
```

See [API Usage](docs/api-usage.md) for more endpoint examples.

## Project Shape

- `src/apps/api`: HTTP API runtime.
- `src/apps/worker`: background delivery worker runtime.
- `src/apps/scheduler`: scheduled notification runtime.
- `src/modules`: domain modules following Clean Architecture boundaries.
- `src/shared`: cross-cutting infrastructure such as config, logging, errors, and HTTP concerns.
- `migrations`: append-only PostgreSQL schema migrations.
- `test`: unit and integration tests.
- `docs`: architecture notes and decision records.

## Quality Gates

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

See [Development and Testing](docs/development.md) for local workflow, Docker Compose usage, and verification commands.
