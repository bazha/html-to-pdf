# Round 5 — Dashboard auth, correct async semantics, structured logging

Fifth pass. Focus: close the three operational gaps flagged after Round 4 — unauthenticated Bull Board, misleading `200 OK` on enqueue, and unstructured `console.*` logging with no request correlation.

---

## 1. Basic auth on `/queues`

Bull Board at `/queues` was reachable by anyone who could hit the port. Anyone with access could inspect job payloads (raw HTML content from clients) and retry / remove jobs.

**Fix:** New `src/middlewares/basic-auth.middleware.ts` — a tiny HTTP Basic Auth middleware using `crypto.timingSafeEqual` for constant-time credential comparison (prevents trivial timing oracles on the password check). `src/monitoring/queues/bull-board.ts` now mounts the middleware in front of the Bull Board router when both `BULL_BOARD_USER` and `BULL_BOARD_PASSWORD` env vars are set. If either is missing the dashboard still mounts (dev ergonomics preserved) but logs a `warn` on startup so the unauthenticated state is visible in logs.

Env additions (both optional) in `src/config/env.ts`:
- `BULL_BOARD_USER`
- `BULL_BOARD_PASSWORD`

## 2. `POST /pdf` returns 202, not 200

`POST /pdf` does not return a PDF — it enqueues a BullMQ job and the client must poll `/:jobId/url`. `200 OK` mis-signalled "done"; `202 Accepted` is the RFC-correct status for "understood, processing asynchronously". The success message string also claimed `"PDF is created and stored"`, which was wrong at the point of response.

**Fix:** `src/controllers/pdf.controller.ts` now returns `202` with `{ message: "PDF generation accepted", jobId, file, detectedType }`. The `/:jobId/url` endpoint keeps its existing code mapping — `200` cached or completed, `202` still-processing, `410` failed, `404` missing. Integration test (`tests/integration/pdf.routes.test.ts`) updated from `.expect(200)` to `.expect(202)`.

## 3. Structured logger (pino) with request-ID correlation

Seven `console.error` / `console.log` sites were scattered across the codebase with ad-hoc string prefixes. Nothing tied an HTTP request to the BullMQ job it spawned, so failure logs had no way back to the originating caller. Triage had to rely on wall-clock correlation.

**Fix:** introduced `pino` as the one logger, with a request-context middleware that threads a UUID from edge to worker.

New files:
- `src/utils/logger.ts` — single pino instance. Level from `LOG_LEVEL` env (new zod-validated field). Under `NODE_ENV=test` the default is `silent` so vitest output stays clean; otherwise `info`.
- `src/middlewares/request-context.middleware.ts` — reads `x-request-id` if the caller supplied one, otherwise generates `randomUUID()`. Attaches `req.id` and `req.log = logger.child({ reqId })`. Includes a `declare global` block augmenting `Express.Request` so `req.id` / `req.log` are typed everywhere downstream.

Wiring:
- `src/app.ts` — mounts `requestContext` first in the middleware chain so every handler (including error middleware) sees `req.log`.
- `src/controllers/pdf.controller.ts` — stamps `reqId: req.id` into BullMQ job data; logs enqueue events through `req.log` so the request ID is automatically present.
- `src/workers/pdf.worker.ts` — pulls `reqId` off `job.data`, builds a child logger `logger.child({ reqId, jobId })` for the job's lifetime, and emits `start` / `done` / `failed` events against it. Result: worker logs can be filtered by `reqId` and traced back to the HTTP request that triggered them.
- `src/middlewares/error-handler.ts` — uses `req.log` when available (falls back to the root logger so early-boot errors still surface).
- `src/services/s3.service.ts`, `src/server.ts` — `console.*` replaced with `logger.*`.

Env addition in `src/config/env.ts`:
- `LOG_LEVEL` (zod enum: `fatal | error | warn | info | debug | trace | silent`; default depends on `NODE_ENV`)

---

## Files changed

### New
- `src/utils/logger.ts`
- `src/middlewares/request-context.middleware.ts`
- `src/middlewares/basic-auth.middleware.ts`

### Modified
- `src/config/env.ts` — `LOG_LEVEL`, `BULL_BOARD_USER`, `BULL_BOARD_PASSWORD`
- `src/app.ts` — mount `requestContext` first
- `src/server.ts` — logger instead of `console`
- `src/controllers/pdf.controller.ts` — 202 status, `reqId` into job, `req.log`
- `src/workers/pdf.worker.ts` — child logger with `reqId` / `jobId`
- `src/middlewares/error-handler.ts` — structured logging
- `src/services/s3.service.ts` — structured logging
- `src/monitoring/queues/bull-board.ts` — conditional basic auth
- `tests/integration/pdf.routes.test.ts` — `.expect(202)`
- `package.json` — `pino` dependency

## Verification

- `npx tsc --noEmit` — clean
- `npm test` — 9/9 passing (vitest output silent under `LOG_LEVEL=silent` default for tests)

## Notes for operators

- Set `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD` in any non-local environment. Startup logs a warning when they are not set.
- Set `LOG_LEVEL=debug` to see enqueue / worker lifecycle logs during troubleshooting.
- Clients that already have a trace ID can forward it via `x-request-id`; the middleware will use it verbatim. Otherwise a UUID is generated per request.
