# NotifyHub

NotifyHub is a production-grade, multi-tenant notification platform built as a portfolio project for senior backend engineering practice.

The system is designed to send email, SMS, push, and webhook notifications through a centralized platform. The first implementation uses a modular monolith with separately runnable API, worker, and scheduler processes so the codebase remains simple to operate while preserving clear service boundaries.

Current capabilities include tenant onboarding, API-key/JWT authentication, tenant rate limiting, notification templates with variables, notification intake, idempotent request handling, BullMQ enqueueing, worker-based delivery processing, mock channel providers, retry/backoff handling, dead-letter status, and delivery attempt history.

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

## Local Development

```bash
npm install
cp .env.example .env
docker compose up -d postgres redis
npm run db:migrate
npm run dev:api
```

API documentation will be available at `http://localhost:3000/docs` once the API server is running.

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
