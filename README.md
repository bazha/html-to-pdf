# PDF Generation Microservice (HTML/Markdown → PDF + S3)

A small Express service that converts HTML or Markdown into a PDF (Puppeteer) and uploads it to S3. Generation is async via BullMQ; clients poll for the PDF's pre-signed URL by job ID.

## How it works

1. `POST /pdf` (or `POST /markdown`) — accepts `{ content }` (10–50000 chars).
   - Content type is auto-detected; HTML and Markdown both go through HTML sanitization, then are wrapped in a styled document and enqueued.
   - Returns `202 Accepted` with `{ jobId, file, detectedType }`.
2. The worker picks up the job, renders the PDF (single shared Puppeteer browser, network blocked at the page level so external resources can't load), and uploads to S3.
3. `GET /pdf/:jobId/url` — returns the job state. When `completed`, returns a 10-minute pre-signed S3 URL, cached in Redis for 5 minutes.

The two route prefixes (`/pdf`, `/markdown`) behave identically.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/pdf`, `/markdown` | Enqueue a PDF job. Body: `{ "content": "..." }`. Rate-limited to 20 req/min per client IP. |
| `GET` | `/pdf/:jobId/url`, `/markdown/:jobId/url` | Poll job state; return pre-signed URL when `completed`. |
| `GET` | `/health` | Always 200. Liveness probe. |
| `GET` | `/ready` | 200 if Redis reachable, 503 otherwise. Readiness probe. |
| `GET` | `/queues` | Bull Board dashboard. Basic-auth protected when `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD` are set; otherwise unauthenticated (warning logged). |

### Job state responses

```jsonc
// 202 on POST
{ "message": "PDF generation accepted", "jobId": "1", "file": "<uuid>.pdf", "detectedType": "html" }

// 200 on GET while pending/active
{ "status": "active" }

// 200 on GET when completed
{ "status": "completed", "url": "https://...", "cached": false }

// 422 on GET when failed
{ "status": "failed", "reason": "PDF generation failed" }

// 404 if jobId unknown / evicted
{ "error": "Job with ID ... not found" }
```

## Running

```bash
npm install
npm run dev      # tsx --watch src/server.ts
npm test         # vitest, one run
npm run typecheck
```

There is no build step (`tsconfig` has `noEmit: true`). For production, either run via `tsx` (`npm start`) or add a real build (e.g. `tsc` with `noEmit: false`).

### Required services

- **Redis** (BullMQ + URL cache)
- **AWS S3** bucket

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `AWS_REGION` | yes | — | |
| `AWS_S3_BUCKET` | yes | — | |
| `AWS_ACCESS_KEY_ID` | no | — | Optional. Falls back to AWS default credential provider chain (IAM role, shared config, etc.). |
| `AWS_SECRET_ACCESS_KEY` | no | — | See above. |
| `REDIS_HOST` | no | `localhost` | |
| `REDIS_PORT` | no | `6379` | |
| `PORT` | no | `3000` | |
| `BULL_BOARD_USER` | no | — | If set, `BULL_BOARD_PASSWORD` must also be set. |
| `BULL_BOARD_PASSWORD` | no | — | If set, `BULL_BOARD_USER` must also be set. |
| `TRUST_PROXY_HOPS` | no | `0` | Number of trusted reverse-proxy hops. Set to the actual hop count when running behind an LB so the rate limiter sees the real client IP. Never set higher than reality (spoof risk). |
| `LOG_LEVEL` | no | `info` (`silent` under `NODE_ENV=test`) | `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent`. |

## Security notes

- Both HTML and Markdown inputs are sanitized via `sanitize-html` before rendering — `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<link>`, and event-handler attributes are dropped.
- The Puppeteer page intercepts requests and aborts every scheme except `data:` / `about:`, so external loads (CSS, images, JS, `file://`, intranet IPs) are blocked at the network layer regardless of what slipped past the sanitizer.
- Rate-limited to 20 req/min on the generation endpoints. If you deploy behind a proxy, set `TRUST_PROXY_HOPS` so each client is rate-limited individually.
- `/queues` should always be put behind `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD` in production.

## Architecture

Single Node process. `src/server.ts` starts Express and imports the BullMQ `Worker`, so the same process serves HTTP and runs jobs. Concurrency is 1 (one Puppeteer page at a time per worker, sharing one browser instance).

To split web and worker into two processes, drop the worker import from `server.ts` and run the worker from a separate entrypoint.

### Graceful shutdown

On `SIGTERM`/`SIGINT`: stop accepting connections, drain the worker (active jobs may take up to ~75s), close the queue, the Puppeteer browser, and the Redis client. Hard timeout is 90s before forced exit.
