# NotifyHub Architecture

NotifyHub starts as a modular monolith with three runtime entrypoints: API, worker, and scheduler. This keeps local development and deployment approachable while enforcing boundaries that can be extracted into separate services later.

## Runtime Topology

```mermaid
flowchart LR
  tenantApp[TenantApplication] --> api[FastifyAPI]
  api --> postgres[(PostgreSQL)]
  api --> redis[(Redis)]
  api --> queue[BullMQ]
  queue --> worker[DeliveryWorker]
  scheduler[Scheduler] --> postgres
  scheduler --> queue
  worker --> providers[NotificationProviders]
  worker --> postgres
```

## Boundary Rules

- Domain code does not depend on HTTP, queues, databases, or framework adapters.
- Application use cases coordinate domain behavior and transaction boundaries.
- Infrastructure adapters implement repositories, providers, queue publishers, and external clients.
- Interfaces expose HTTP routes and translate transport concerns into application commands.

## Implemented Foundation

The first implementation phase establishes the runtime foundation:

- Strict TypeScript configuration.
- Fastify API composition.
- Structured logging.
- Environment validation.
- Health checks for liveness and readiness.
- Docker Compose for PostgreSQL and Redis.
- CI quality gates.

The second phase adds the identity foundation:

- PostgreSQL migration runner with append-only SQL migrations.
- Tenants with status and per-minute rate limit configuration.
- One-time API key issuance with hashed storage.
- API-key authentication through `x-api-key` or `Authorization: ApiKey ...`.
- Short-lived JWT issuance for tenant-scoped API access.
- Authenticated request context for downstream modules.
- Audit log persistence for identity events.

The third phase adds notification intake:

- Tenant-authenticated `POST /v1/notifications`.
- Email, SMS, push, and webhook channel modeling.
- Durable notification persistence with tenant-scoped idempotency keys.
- Immediate and scheduled notification state.
- BullMQ enqueueing with a stable `notification-delivery` job payload.

The fourth phase adds delivery processing:

- BullMQ worker consumption for `notification-delivery` jobs.
- Provider abstraction by channel.
- Mock email, SMS, push, and webhook providers.
- Notification state transitions from queued/scheduled to processing, delivered, or failed.
- Append-only delivery attempt history with provider metadata and errors.

The fifth phase adds retry and dead-letter behavior:

- Environment-driven delivery max attempts and exponential backoff.
- BullMQ retries for retryable provider failures.
- Durable failed state between attempts.
- Final exhausted failures transition notifications to `dead_lettered`.
- Last provider error metadata is stored on the notification record.

Templates, rate limiting, and analytics modules will be implemented incrementally after this retry foundation is stable.

## Identity Flow

```mermaid
sequenceDiagram
  participant Client as Tenant App
  participant API as Fastify API
  participant DB as PostgreSQL

  Client->>API: POST /v1/tenants
  API->>DB: Create tenant + hashed API key
  DB-->>API: Tenant + API key metadata
  API-->>Client: Tenant + one-time API key secret

  Client->>API: POST /v1/auth/tokens with x-api-key
  API->>DB: Resolve API key by prefix and hash
  API->>DB: Mark API key last_used_at + audit event
  API-->>Client: Short-lived Bearer JWT

  Client->>API: GET /v1/tenants/me with Bearer JWT
  API->>DB: Load current tenant
  API-->>Client: Tenant profile
```

## Notification Intake Flow

```mermaid
sequenceDiagram
  participant Client as Tenant App
  participant API as Fastify API
  participant DB as PostgreSQL
  participant Queue as BullMQ

  Client->>API: POST /v1/notifications with API key or JWT
  API->>DB: Resolve tenant authentication
  API->>DB: Check tenant + Idempotency-Key
  alt Existing idempotency key
    DB-->>API: Existing notification
    API-->>Client: 202 Accepted + idempotentReplay=true
  else New request
    API->>DB: Persist notification
    API->>Queue: Enqueue notification-delivery job
    API-->>Client: 202 Accepted + idempotentReplay=false
  end
```

## Delivery Worker Flow

```mermaid
sequenceDiagram
  participant Queue as BullMQ
  participant Worker as Delivery Worker
  participant DB as PostgreSQL
  participant Provider as Mock Provider

  Queue->>Worker: notification-delivery job
  Worker->>DB: Load notification by tenant and id
  Worker->>DB: Mark notification processing
  Worker->>DB: Record processing attempt
  Worker->>Provider: Deliver notification
  alt Provider accepts
    Provider-->>Worker: Provider message id
    Worker->>DB: Mark notification delivered
    Worker->>DB: Record delivered attempt
  else Provider rejects with attempts remaining
    Provider-->>Worker: Provider error
    Worker->>DB: Mark notification failed
    Worker->>DB: Record failed attempt
    Worker-->>Queue: Throw retryable error
    Queue-->>Worker: Retry after exponential backoff
  else Provider rejects on final attempt
    Provider-->>Worker: Provider error
    Worker->>DB: Mark notification dead_lettered
    Worker->>DB: Record failed attempt
  end
```
