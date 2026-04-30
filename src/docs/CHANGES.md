# Changes

This log covers three passes over the codebase: a bug-fix pass driven by a code audit, a readability pass, and an operational-hardening pass that added CI and retry policy. Each change below includes the reason it was made.

---

## Round 1 — Bug fixes & dead code removal

### `GET /pdf/:jobId/url` was broken in production
The worker returned `{ s3Url, fileSize }` but the controller destructured `const { key } = job.returnvalue` — the field names disagreed, so every call fell through to a `500 "No key in job return value"`. Tests didn't catch it because the mock wrote `key` directly.

**Fix:** Worker now returns `{ key, fileSize }`. `src/workers/pdf.worker.ts`.

### `POST /pdf` never returned `jobId`
Without a `jobId` in the response, clients had no way to call `/pdf/:jobId/url`. The whole presigned-URL feature was effectively unreachable.

**Fix:** Controller captures the job and includes `jobId: job.id` in the 200 response. `src/controllers/pdf.controller.ts`.

### Worker silently swallowed errors
The processor caught exceptions and returned `{ success: false, error }`. BullMQ reads any returned value as success, so failed jobs appeared as `completed` in Bull Board and Redis — retry/fail policies never fired.

**Fix:** Removed the inner `try/catch`. Errors now propagate; BullMQ marks the job `failed` and honours `removeOnFail`. `src/workers/pdf.worker.ts`.

### Dead validation in controller
`if (!content)` ran after `validateContent` middleware (zod, min 10 chars) had already rejected empty bodies.

**Fix:** Removed the redundant guard. `src/controllers/pdf.controller.ts`.

### `/pdf` and `/markdown` routes were byte-identical duplicates
Content-type auto-detection means both prefixes do the same thing. Two files to maintain for zero functional difference.

**Fix:** Single `pdf.route.ts` now registers both prefixes in a loop. `markdown.route.ts` deleted. `src/routes/pdf.route.ts`, `src/app.ts`. External behaviour unchanged.

### Puppeteer browser launched fresh per PDF job
~500ms cold-start overhead per job.

**Fix:** Lazy singleton (`getBrowser` / `closeBrowser`) in `src/services/pdf.service.ts`. Each job gets its own `Page` from the shared `Browser`. SIGTERM/SIGINT handlers in `src/server.ts` close the browser and the BullMQ worker gracefully before `process.exit(0)`.

### `marked.setOptions` called on every markdown conversion
`marked` is a singleton — re-configuring on every call is wasted work.

**Fix:** Moved `setOptions` to module scope. `src/services/markdown.service.ts`.

### `ContentType` / `ContentResult` exported but never imported
Leaked implementation detail as public API.

**Fix:** Unexported. `src/services/content.service.ts`.

### Four stale root-level architecture docs contradicted the real code
`SERVICES.md`, `SERVICES_SIMPLE.md`, `FACTORY_PATTERNS.md`, `NAMING_CONVENTION.md` described services and functions that never shipped (e.g. `pdf-buffer.service.ts`, `generateHtmlFromContent(content, type)`).

**Fix:** Deleted all four. `CLAUDE.md` now captures the real architecture.

### Test drift
Integration test needed to assert the new `jobId` field; unit test mock for Puppeteer was missing `page.close`.

**Fix:** `tests/integration/pdf.routes.test.ts`, `tests/unit/pdf.service.test.ts`.

---

## Round 2 — Readability (SOLID / DRY / KISS)

### `detectContentType` precedence was hidden in boolean algebra
`hasMarkdownPatterns && !isHtml` encoded "HTML wins" implicitly.

**Fix:** Three explicit early returns. Indicator arrays also hoisted to module scope so they're not re-allocated per call. `src/services/content.service.ts`.

### `AWS_S3_BUCKET` was read twice, inconsistently
One call site asserted non-null (`!`), the other didn't. A missing env var would silently produce a `undefined` bucket in one code path.

**Fix:** `const S3_BUCKET = env.AWS_S3_BUCKET` once at module scope (env is the validated zod-parsed object), used everywhere. `src/services/s3.service.ts`.

### Redundant `try/catch + next(err)` in controller
Express v5 auto-forwards async rejections to the error middleware. The try/catch added noise without safety — and in `getPdfUrlByJobId`, the Redis `get` was *outside* the try block, so an error there would crash the process.

**Fix:** Removed both try/catch blocks. Handlers now read linearly top-to-bottom. `src/controllers/pdf.controller.ts`.

### Markdown function mixed conversion with an 85-line CSS template
Single Responsibility violation within a function body.

**Fix:** Extracted `wrapInDocument(body)` as a module-level helper. `generateHtmlFromMarkdown` is now a single line. `src/services/markdown.service.ts`.

### Synchronous `try/catch` in markdown service obscured real stack traces
`marked()` doesn't throw in its documented behaviour, and the catch rethrew `new Error("Failed to convert...")`, losing the original stack.

**Fix:** Removed the try/catch. Any unexpected error now surfaces with its real stack. `src/services/markdown.service.ts`.

### Inconsistent error-log style
`s3.service.ts` prefixed logs with `[Module][function]`; other files just wrote `console.error(err)`.

**Fix:** Uniform `[Module][function]` prefix applied to `error-handler.ts` and `pdf.worker.ts`. `s3.service.ts` prefix renamed from `[S3Utils]` to `[S3Service]` to match the filename.

### Conversational JSDoc out of tone with a technical module
`/** ... No need to specify content type - the service figures it out! */`

**Fix:** Replaced with `/** Detects HTML vs Markdown and returns normalized HTML. */`. `src/services/content.service.ts`.

### Puppeteer singleton reset-on-failure was unsignposted
The `.catch` that nulls `browserPromise` looked like a bug without context.

**Fix:** One-line comment explaining the intent. `src/services/pdf.service.ts`.

### `server.close()` wasn't awaited in shutdown
In-flight requests could be abandoned when `process.exit(0)` fired.

**Fix:** `await new Promise<void>((resolve) => server.close(() => resolve()))`. Shutdown is now actually orderly. `src/server.ts`.

---

## Round 3 — Operational hardening (CI + retries)

### Failed jobs died on the first try
After Round 1 stopped the worker from swallowing errors, BullMQ correctly marked failed jobs as `failed` — but the queue had no retry policy, so a transient S3 or Puppeteer flake became a permanent failure. The previous silent-success behaviour had been hiding the same outcome; removing it made the gap visible.

**Fix:** `defaultJobOptions` on the queue now sets `attempts: 3` with `backoff: { type: 'exponential', delay: 2000 }`. Transient failures retry at roughly 2 s, 4 s before the job is marked failed. `src/queues/queue.ts`.

### No automated checks on push / PR
Every regression caught in Rounds 1 and 2 could have slipped back in unnoticed — there was no typecheck script, no CI, and the test suite was only ever run manually.

**Fix:** Added `.github/workflows/ci.yml` running `npm run typecheck` and `npm test` on push and PR to `main` and `dev`. `PUPPETEER_SKIP_DOWNLOAD=true` at the workflow level avoids pulling Chromium on every run since the test suite mocks Puppeteer.

### No npm typecheck script
`tsc --noEmit` had to be invoked by hand. Easy to forget, impossible for CI to standardise on.

**Fix:** Added `"typecheck": "tsc --noEmit"` to `package.json` scripts. CI invokes `npm run typecheck`.

### Type error surfaced by the first typecheck run
Running the new typecheck script immediately caught a pre-existing issue: in `getPdfUrlByJobId`, `req.params.jobId` was typed as `string | string[]` (Express v5 default) but `pdfQueue.getJob` wants `string`. The mismatch had been silently compiling because no CI step enforced it.

**Fix:** Typed the request as `Request<{ jobId: string }>` so `jobId` narrows to `string`. `src/controllers/pdf.controller.ts`.

---

## Files changed (all rounds)

- `src/controllers/pdf.controller.ts`
- `src/workers/pdf.worker.ts`
- `src/routes/pdf.route.ts`
- `src/routes/markdown.route.ts` (deleted)
- `src/app.ts`
- `src/services/content.service.ts`
- `src/services/markdown.service.ts`
- `src/services/pdf.service.ts`
- `src/services/s3.service.ts`
- `src/queues/queue.ts`
- `src/middlewares/error-handler.ts`
- `src/server.ts`
- `tests/integration/pdf.routes.test.ts`
- `tests/unit/pdf.service.test.ts`
- `package.json` — `typecheck` script
- `.github/workflows/ci.yml` (new)
- `SERVICES.md`, `SERVICES_SIMPLE.md`, `FACTORY_PATTERNS.md`, `NAMING_CONVENTION.md` (deleted)

## Verification

`npm run typecheck` — clean. `npm test` — 9/9 passing. CI runs both on push and PR.
