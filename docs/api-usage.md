# API Usage

This guide shows the main NotifyHub API flows. Start the API with `npm run dev:api` and open the OpenAPI documentation at `http://localhost:3000/docs` for the complete schema.

## Authentication

NotifyHub supports API keys and short-lived JWTs.

Most tenant-scoped endpoints accept either:

- `x-api-key: <api-key>`
- `Authorization: ApiKey <api-key>`
- `Authorization: Bearer <jwt>`

Create a tenant:

```bash
curl -X POST http://localhost:3000/v1/tenants \
  -H 'content-type: application/json' \
  -d '{
    "name": "Acme",
    "slug": "acme",
    "rateLimitPerMinute": 60
  }'
```

The response includes a one-time API key secret. Store it securely; the platform only stores a hash.

Issue a JWT from an API key:

```bash
curl -X POST http://localhost:3000/v1/auth/tokens \
  -H 'x-api-key: <api-key>'
```

Read the current tenant:

```bash
curl http://localhost:3000/v1/tenants/me \
  -H 'authorization: Bearer <jwt>'
```

## Templates

Create a tenant-scoped template:

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

Templates render `{{variable}}` placeholders from the notification request `variables` object. Missing variables are rejected before the notification is persisted or queued.

## Notifications

Send a direct notification:

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

Send a templated notification:

```bash
curl -X POST http://localhost:3000/v1/notifications \
  -H 'content-type: application/json' \
  -H 'x-api-key: <api-key>' \
  -H 'idempotency-key: welcome-email-002' \
  -d '{
    "channel": "email",
    "recipient": "user@example.com",
    "templateId": "<template-id>",
    "variables": {
      "name": "Vishnu",
      "plan": "Pro"
    }
  }'
```

Schedule a notification:

```bash
curl -X POST http://localhost:3000/v1/notifications \
  -H 'content-type: application/json' \
  -H 'x-api-key: <api-key>' \
  -H 'idempotency-key: scheduled-webhook-001' \
  -d '{
    "channel": "webhook",
    "recipient": "https://example.com/hooks/notify",
    "body": "{\"event\":\"created\"}",
    "scheduledAt": "2026-07-20T10:30:00.000Z"
  }'
```

Supported channels are `email`, `sms`, `push`, and `webhook`. Local development defaults to deterministic mock providers, while HTTP-backed provider adapters can be enabled for external delivery.

## Status And Analytics

List notifications:

```bash
curl 'http://localhost:3000/v1/notifications?limit=25&offset=0&channel=email' \
  -H 'x-api-key: <api-key>'
```

Supported filters:

- `limit`
- `offset`
- `status`
- `channel`

Get notification analytics:

```bash
curl http://localhost:3000/v1/analytics/notifications \
  -H 'x-api-key: <api-key>'
```

The analytics response includes totals by notification status, channel, and delivery attempt outcome.

List delivery attempts for a notification:

```bash
curl 'http://localhost:3000/v1/notifications/<notification-id>/delivery-attempts?limit=25&offset=0' \
  -H 'x-api-key: <api-key>'
```

The response includes provider name, attempt number, status, provider message id, error details, provider response metadata, and start/completion timestamps.

## Queue Monitoring

Read delivery queue metrics:

```bash
curl http://localhost:3000/v1/queues/notification-delivery/metrics \
  -H 'x-api-key: <api-key>'
```

The response includes BullMQ job counts for waiting, active, delayed, completed, failed, and paused delivery jobs.

## Dead Letter Queue

List dead-lettered notifications:

```bash
curl 'http://localhost:3000/v1/dlq/notifications?limit=25&offset=0' \
  -H 'x-api-key: <api-key>'
```

Supported filters:

- `limit`
- `offset`
- `channel`

Replay a dead-lettered notification:

```bash
curl -X POST http://localhost:3000/v1/dlq/notifications/<notification-id>/replay \
  -H 'x-api-key: <api-key>'
```

Replay moves the notification back to `queued`, clears the current dead-letter marker and error fields, and publishes a new delivery job. Delivery attempt history remains intact.

## Audit Logs

List tenant audit logs:

```bash
curl 'http://localhost:3000/v1/audit-logs?limit=25&offset=0' \
  -H 'x-api-key: <api-key>'
```

Supported filters:

- `actorType`
- `action`
- `resourceType`

Audit logs are tenant-scoped for tenant credentials, so clients cannot read cross-tenant history.

## Health Checks

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

`/health/live` confirms the process is alive. `/health/ready` checks PostgreSQL and Redis connectivity.
