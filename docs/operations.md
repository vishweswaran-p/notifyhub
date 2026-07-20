# Operations

This guide covers production-facing runtime configuration and operating concerns for NotifyHub.

## Runtime Processes

Run these processes independently:

- API: accepts HTTP requests, authenticates tenants, persists commands, and exposes read/operational APIs.
- Worker: consumes `notification-delivery` jobs and calls notification providers.
- Scheduler: claims due scheduled notifications and publishes delivery jobs.

All three processes share PostgreSQL and Redis.

## Provider Configuration

Use `NOTIFICATION_PROVIDER_MODE=mock` for local development, demos, and deterministic tests.

Use `NOTIFICATION_PROVIDER_MODE=http` to send notifications through external provider endpoints:

```bash
NOTIFICATION_PROVIDER_MODE=http
EMAIL_PROVIDER_URL=https://email-provider.example.com/send
EMAIL_PROVIDER_API_KEY=...
SMS_PROVIDER_URL=https://sms-provider.example.com/send
SMS_PROVIDER_API_KEY=...
PUSH_PROVIDER_URL=https://push-provider.example.com/send
PUSH_PROVIDER_API_KEY=...
WEBHOOK_PROVIDER_API_KEY=...
HTTP_PROVIDER_TIMEOUT_MS=10000
```

Email, SMS, and push providers receive a JSON payload containing notification id, tenant id, channel, recipient, subject, body, variables, and metadata. Webhook delivery posts the same payload directly to the notification recipient URL.

Provider responses may include `providerMessageId`, `messageId`, or `id`; NotifyHub stores that value in delivery attempt history.

Firebase Cloud Messaging is supported as a first-class push provider. It can be enabled without changing email, SMS, or webhook delivery:

```bash
PUSH_PROVIDER_MODE=fcm
FCM_PROJECT_ID=your-firebase-project-id
FCM_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

When FCM is enabled, push notification `recipient` values must be FCM device registration tokens. FCM delivery uses the HTTP v1 API and stores the returned FCM message name as the provider message id.

## OpenTelemetry

Enable tracing with:

```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=notifyhub-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces
```

Use different service names per process:

- `notifyhub-api`
- `notifyhub-worker`
- `notifyhub-scheduler`

NotifyHub uses OpenTelemetry Node auto-instrumentation for runtime spans and exports traces over OTLP HTTP when configured.

## Health And Queue Checks

API health:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Delivery queue metrics:

```bash
curl http://localhost:3000/v1/queues/notification-delivery/metrics \
  -H 'x-api-key: <api-key>'
```

Dead-letter queue:

```bash
curl 'http://localhost:3000/v1/dlq/notifications?limit=25&offset=0' \
  -H 'x-api-key: <api-key>'
```

## Deployment Checklist

- Set strong `JWT_SECRET` and `API_KEY_PEPPER` values.
- Run PostgreSQL migrations before starting the API.
- Run API, worker, and scheduler as separate processes.
- Configure Redis persistence/availability appropriate for queue workloads.
- Use `NOTIFICATION_PROVIDER_MODE=http` and configure provider endpoints for external delivery.
- Enable `OTEL_ENABLED=true` and point `OTEL_EXPORTER_OTLP_ENDPOINT` at a collector.
- Monitor queue metrics, dead-letter counts, and provider failure rates.
