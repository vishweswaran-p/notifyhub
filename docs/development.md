# Development And Testing

This guide explains how to run NotifyHub locally and verify changes.

## Requirements

- Node.js 22 LTS or newer
- npm
- Docker and Docker Compose

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Run database migrations:

```bash
npm run db:migrate
```

Start the API:

```bash
npm run dev:api
```

Start the delivery worker in another terminal:

```bash
npm run dev:worker
```

Start the scheduler in another terminal to promote due scheduled notifications:

```bash
npm run dev:scheduler
```

## Docker Compose

Run the API with dependencies:

```bash
docker compose up --build api
```

Run workers too:

```bash
docker compose --profile workers up --build
```

The API container runs migrations before starting.

## Quality Gates

Run the same checks used by CI:

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run format:write` to apply formatting:

```bash
npm run format:write
```

## Tests

Run all tests:

```bash
npm test
```

Run unit tests:

```bash
npm run test:unit
```

Run integration tests:

```bash
npm run test:integration
```

The current integration tests use Fastify injection and in-memory adapters where appropriate, so they do not require PostgreSQL or Redis.

## Database Migrations

Migrations live in `migrations` and are applied by:

```bash
npm run db:migrate
```

The migration runner stores applied migration filenames in `schema_migrations`.

## Runtime Processes

NotifyHub has three runtime entrypoints:

- `src/apps/api`: HTTP API, OpenAPI docs, authentication, notification intake, reads, and health checks.
- `src/apps/worker`: BullMQ notification delivery worker.
- `src/apps/scheduler`: polling scheduler that claims due scheduled notifications and enqueues delivery jobs.

## Scheduler Configuration

Scheduled notifications are persisted with `status = scheduled` until their `scheduledAt` timestamp is due. The scheduler process claims due rows in batches, marks them `queued`, and publishes delivery jobs to BullMQ.

Configure scheduler behavior with:

- `SCHEDULER_POLL_INTERVAL_MS`: how often the scheduler checks for due notifications.
- `SCHEDULER_BATCH_SIZE`: maximum number of due notifications claimed per tick.

## Provider Behavior

NotifyHub supports two provider modes:

- `NOTIFICATION_PROVIDER_MODE=mock`: deterministic local providers for email, SMS, push, and webhook.
- `NOTIFICATION_PROVIDER_MODE=http`: HTTP-backed adapters that post notification payloads to configured external provider endpoints.
- `PUSH_PROVIDER_MODE=fcm`: Firebase Cloud Messaging for push notifications.

Mock mode is the default for local development and tests. To simulate provider failure locally, send a notification whose `recipient` contains `fail`. The mock provider will reject it, allowing retry and dead-letter behavior to be exercised without external services.

HTTP mode requires these endpoints:

- `EMAIL_PROVIDER_URL`
- `SMS_PROVIDER_URL`
- `PUSH_PROVIDER_URL`

Webhook notifications in HTTP mode post directly to the notification `recipient` URL. Provider API keys are optional and sent as Bearer tokens when configured.

FCM mode requires `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY`. In this mode, push notification recipients are FCM device registration tokens.

## OpenTelemetry

OpenTelemetry is disabled by default. Enable it with:

```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=notifyhub-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

Use service names such as `notifyhub-api`, `notifyhub-worker`, and `notifyhub-scheduler` when running each process separately.
