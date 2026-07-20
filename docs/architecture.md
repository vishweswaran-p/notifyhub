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

## System Capabilities

NotifyHub is organized around durable notification intake, asynchronous delivery, and tenant-scoped operational visibility.

### Runtime And Infrastructure

- Strict TypeScript configuration with Fastify API composition.
- PostgreSQL migration runner with append-only SQL migrations.
- PostgreSQL persistence for tenants, credentials, templates, notifications, delivery attempts, and audit logs.
- Redis-backed rate limiting and BullMQ job orchestration.
- Structured logging, environment validation, health checks, Docker Compose, and CI quality gates.

### Identity And Tenant Isolation

- Tenants have status and per-minute notification rate-limit configuration.
- API keys are issued once and stored only as hashed credentials.
- Tenant APIs support `x-api-key`, `Authorization: ApiKey ...`, and short-lived Bearer JWT authentication.
- Authenticated request context carries tenant and actor information into downstream use cases.
- Audit logs capture identity events and are readable only within the authenticated tenant scope.

### Notification Lifecycle

- Tenants submit notifications through `POST /v1/notifications`.
- Supported channels are email, SMS, push, and webhook.
- Idempotency keys prevent duplicate notification creation for retried client requests.
- Future scheduled notifications remain durable in PostgreSQL until the scheduler promotes them.
- Due and immediate notifications are published to the BullMQ `notification-delivery` queue.
- The delivery worker records processing, delivered, failed, and dead-letter outcomes.
- Retry behavior uses environment-driven max attempts and exponential backoff.
- Exhausted delivery failures transition notifications to `dead_lettered`.

### Templates And Rendering

- Tenants create channel-specific templates through `POST /v1/templates`.
- Templates support `{{variable}}` placeholders for subject and body rendering.
- Missing variables are rejected before persistence or queueing.
- Accepted notifications store rendered subject/body snapshots and retain the source template id.

### Reads And Analytics

- `GET /v1/notifications` lists tenant notifications with pagination and filters.
- `GET /v1/notifications/:notificationId/delivery-attempts` exposes provider attempt history for a tenant-owned notification.
- `GET /v1/analytics/notifications` returns tenant notification totals grouped by status, channel, and delivery attempt outcome.
- `GET /v1/audit-logs` returns tenant-scoped audit history with pagination and filters.

### Operations

- `GET /v1/queues/notification-delivery/metrics` exposes BullMQ job counts for delivery queue monitoring.
- `GET /v1/dlq/notifications` lists tenant dead-lettered notifications with pagination and channel filtering.
- `POST /v1/dlq/notifications/:notificationId/replay` moves a dead-lettered notification back to `queued` and publishes a fresh delivery job.

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
  participant Scheduler as Scheduler
  participant Queue as BullMQ

  Client->>API: POST /v1/notifications with API key or JWT
  API->>DB: Resolve tenant authentication
  API->>DB: Check tenant + Idempotency-Key
  alt Existing idempotency key
    DB-->>API: Existing notification
    API-->>Client: 202 Accepted + idempotentReplay=true
  else New request
    API->>Redis: Consume tenant notification quota
    alt Rate limit exceeded
      API-->>Client: 429 Too Many Requests
    else Quota available
    API->>DB: Persist notification
    alt scheduledAt is in the future
      API-->>Client: 202 Accepted + status=scheduled
      Scheduler->>DB: Claim due scheduled notifications
      Scheduler->>Queue: Enqueue notification-delivery job
    else immediate or due now
    API->>Queue: Enqueue notification-delivery job
    API-->>Client: 202 Accepted + idempotentReplay=false
    end
    end
  end
```

## Template Rendering Flow

```mermaid
sequenceDiagram
  participant Client as Tenant App
  participant API as Fastify API
  participant DB as PostgreSQL
  participant Queue as BullMQ

  Client->>API: POST /v1/templates
  API->>DB: Persist tenant template
  DB-->>API: Template
  API-->>Client: 201 Created

  Client->>API: POST /v1/notifications with templateId + variables
  API->>DB: Load template for tenant
  API->>API: Render {{variables}}
  API->>DB: Persist rendered notification snapshot
  API->>Queue: Enqueue delivery job
  API-->>Client: 202 Accepted
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
