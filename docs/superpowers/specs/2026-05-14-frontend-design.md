# Frontend Playground Design — html-to-pdf

**Date:** 2026-05-14
**Status:** Approved for plan
**Companion repo:** `~/Documents/work/html-to-pdf-frontend` (new)

## Context

The `html-to-pdf` service exposes an async REST API (POST → poll → S3 signed URL). Today there is no UI; consumers either drive it from curl or build their own integration. This spec defines a small React + Vite SPA, hosted in a separate repo, that acts as an **internal developer playground** — used to test content quickly, watch the job lifecycle, and grab the resulting PDF.

The goals are explicitly modest:
- Make it trivial to exercise the API by hand.
- Surface the full async lifecycle (queued → active → completed/failed) visibly.
- Catch obvious content issues with a live preview before submitting.

Out of scope: auth, user accounts, billing, history beyond the current session, marketing polish, mobile-first design.

## Decisions (recorded)

| Decision | Choice | Why |
|---|---|---|
| Audience | Internal dev playground | Drives "tiny, focused, no polish" everywhere |
| Stack | React + Vite + TypeScript | Familiar, fastest scaffold |
| Location | Separate repo, sibling dir `../html-to-pdf-frontend` | Independent deploy / ownership |
| Layout | Tabs (Editor \| Preview) | Full editor width when typing; switch to preview when checking |
| Style | Dark, dense, dev-tool aesthetic | Matches "internal playground" feel |
| Optional features in v1 | Live preview pane only | Drop history, templates, CodeMirror — YAGNI |
| API wiring | CORS on backend | Simpler than dev proxy when FE deploys are separate |
| Async lifecycle | Plain hooks + native `fetch` | One submit + one poll. No need for TanStack Query yet. |

## Architecture

Two repositories, separate deploys.

```
[Browser]  ──fetch──►  [Express :3000]
   │  POST /pdf or /markdown      ──► 202 { jobId }
   └─ GET /pdf/:jobId/url         ──► { status, url? }
                                     poll every 1500ms
                                     until completed/failed/timeout (120s)
```

**Frontend repo (new):** `html-to-pdf-frontend`. Single-page Vite app. No router, no global state library. All app state lives in `App.tsx`.

**Backend repo (this one):** one additive change. Install `cors` and mount it in `src/app.ts`, gated by a `CORS_ORIGINS` env var (comma-separated; empty disables CORS). README documents the variable. No other backend changes.

## Frontend layout

```
html-to-pdf-frontend/
├── index.html
├── package.json
├── vite.config.ts          # dev server :5173
├── tsconfig.json
├── .env.example            # VITE_API_BASE_URL=http://localhost:3000
└── src/
    ├── main.tsx            # mounts <App>
    ├── App.tsx             # state machine, layout shell, tabs
    ├── theme.css           # dark theme tokens
    ├── api/
    │   └── pdfClient.ts    # submitContent(content), pollJob(jobId)
    ├── hooks/
    │   ├── useSubmit.ts    # POST wrapper
    │   └── usePoll.ts      # interval poll + abort on unmount
    ├── components/
    │   ├── Editor.tsx      # mono <textarea>, Ctrl+Enter submit
    │   ├── Preview.tsx     # iframe srcDoc, sandboxed
    │   ├── Tabs.tsx        # 2-tab switcher
    │   ├── Toolbar.tsx     # Submit, char counter, detected-type pill
    │   └── StatusBar.tsx   # job state + download link or error
    └── utils/
        ├── detectType.ts   # mirrors backend content.service heuristic
        └── renderMarkdown.ts  # marked + DOMPurify for preview only
```

**Boundary rules:**
- `api/pdfClient.ts` is the only file that knows URL shapes or response formats. Components never call `fetch`.
- `Editor` and `Preview` are dumb presentational components; state belongs to `App`.
- `Preview` uses `<iframe sandbox srcDoc={...}>` so user content cannot break out of its sandbox or pollute the playground's DOM/CSS.
- `detectType.ts` deliberately duplicates the backend's heuristic from `src/services/content.service.ts` (the `markdownIndicators` regex array + `detectContentType` function). We accept this dup so the preview can honestly tell the user "the server will detect this as markdown." A code comment in `detectType.ts` calls out the backend file as the source of truth.

## State machine

State held in `App.tsx`:

```ts
type AppState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'polling';   jobId: string; jobState: string }
  | { phase: 'completed'; jobId: string; url: string }
  | { phase: 'failed';    reason: string }
  | { phase: 'error';     message: string };  // network / rate-limit / timeout
```

Transitions:

```
idle ─submit──► submitting ─202──► polling ─completed──► completed
                            │              ├─failed─────► failed
                            │              └─timeout(120s)─► error
                            └─non-202─► error
```

## Async lifecycle

**Submit (`useSubmit`):**
- POST to `${VITE_API_BASE_URL}/pdf` with `{ content }`.
- On 202, return `jobId`. App transitions to `polling`.
- On 400, throw `ApiError({ code: 'validation', message })`.
- On 429, throw `ApiError({ code: 'rate_limit', retryAfter })` reading `Retry-After`.
- On other non-2xx, throw `ApiError({ code: 'http', status, body })`.

**Poll (`usePoll`):**
- Interval: **1500 ms**.
- Max wall-clock: **120 s** (80 polls). Transition to `error: 'timeout'` on exceed.
- Cancel on unmount via `AbortController`.
- On `200 { status: 'completed', url }` → transition to `completed`. Stop polling.
- On `422 { status: 'failed', reason }` → transition to `failed`. Stop polling.
- On `404` → transition to `error: 'job not found'`. Stop polling.
- On `429` → back off to 3000ms for one cycle, then resume 1500ms.

**Math behind the numbers:** 1500ms × 80 = 120s ceiling. Backend's hard shutdown is 90s. GET rate limit is 120/min (one client at 1500ms = 40 req/min, plenty of headroom).

## Live preview

- Debounce keystroke → state update by **150ms** to avoid thrashing the iframe.
- `Preview` receives `{ content, detectedType }` from `App`.
- If `detectedType === 'markdown'`: pass through `marked` (instance, not global) → `DOMPurify.sanitize()` → inject as `srcDoc`.
- If `detectedType === 'html'`: `DOMPurify.sanitize()` → inject as `srcDoc`.
- The iframe is `<iframe sandbox srcDoc={...}>` — no `allow-scripts`, no `allow-same-origin`. Preview cannot run JS or access the parent.

The preview is intentionally **best-effort**: it uses client-side sanitize/marked, which may diverge from the server's behavior (different sanitize-html config, different marked version). We surface the detected type in the toolbar so the user can compare expectation vs result.

## Error handling

Two surfaces only: **toasts** for transient/recoverable; **StatusBar** for the current job's terminal state.

| Source | Backend signal | UI treatment |
|---|---|---|
| Validation (length) | 400 `{ error: "Validation error: ..." }` | Inline error under editor; char counter red; Submit disabled until valid |
| Rate limit (POST) | 429 `{ error: "Too many ..." }` | Toast "Rate limited. Try again in 60s." Submit shows countdown if `Retry-After` present |
| Rate limit (GET) | 429 | Silent. Back off to 3000ms one cycle, console.warn |
| Job failed | 422 `{ status: "failed", reason }` | StatusBar red with reason. Editor stays populated |
| Job 404 | 404 `{ error: "Job ... not found" }` | StatusBar: "Job not found — Redis may have evicted it. Resubmit." |
| Job missing S3 key | 500 `{ error: "Completed job is missing S3 key" }` | StatusBar: "Server error." Full body logged |
| Network / CORS | `fetch` rejects | Toast: "Cannot reach API. Check VITE_API_BASE_URL and that the server is running." |
| Poll timeout (>120s) | client | StatusBar: "Still processing after 2 min — check /queues or try again." |
| Unknown HTTP error | any non-2xx not above | Toast: "Unexpected error (HTTP nnn)." Body logged |

**Submit button rule:** the button is the single source of truth for "can submit now." It disables on invalid length, during `submitting` or `polling`, and during a rate-limit cooldown.

**Logging:** every error path logs the response body to `console.error` prefixed `[PdfClient]` so devs can grep.

## Visual style

- **Theme:** dark. Background `#0d1117`, panel `#1a1f26`, accent `#3b82f6`, mono font `'JetBrains Mono', ui-monospace, monospace`.
- **Density:** small UI chrome, 12–13px body, single accent color.
- **Layout:** full-viewport. Top toolbar (40px), tabs (32px), editor/preview fills remaining height. StatusBar pinned to bottom (28px).
- **No animations** other than the polling dot pulse.

## Backend change (this repo)

Single additive PR before frontend dev starts:

- Add `cors` to `package.json` dependencies.
- In `src/app.ts`, mount `cors({ origin: parseAllowList(process.env.CORS_ORIGINS) })` **before** `helmet()`.
  - `parseAllowList` splits `CORS_ORIGINS` on `,`, trims, filters empties. Empty list → don't mount.
- Document `CORS_ORIGINS` in README's environment table.

That is the entire backend delta.

## Testing

**Frontend repo:** vitest + @testing-library/react + MSW.

1. `api/pdfClient.test.ts` — one case per response shape (202, 400, 422, 429, 404, 500, network error).
2. `hooks/usePoll.test.ts` — fake timers; asserts interval, terminal-state stop, unmount abort, 429 backoff.
3. `hooks/useSubmit.test.ts` — fake timers; asserts `Retry-After` cooldown.
4. `utils/detectType.test.ts` — parity fixtures shared with backend `content.service.test.ts`.
5. `App.test.tsx` — one integration smoke test with MSW: type → submit → poll → download link visible.

**Out of scope for tests:** layout/CSS, visual regressions, the editor textarea, 120s wall-clock timeout (use fake timers).

**Backend repo:** one new test `tests/integration/cors.test.ts` — origin in allowlist returns `Access-Control-Allow-Origin`; origin not in allowlist does not. Covers all new backend code.

## Deliverables and order

Plan execution order (writing-plans will detail this):

1. Backend PR — add `cors` middleware + env var + test + README note.
2. Scaffold `html-to-pdf-frontend` via `npm create vite@latest -- --template react-ts`.
3. Implement `api/pdfClient.ts` + tests.
4. Implement `useSubmit` and `usePoll` hooks + tests.
5. Implement `Editor`, `Preview`, `Tabs`, `Toolbar`, `StatusBar` + the App state machine.
6. Implement `detectType` and `renderMarkdown` utilities + tests.
7. Wire end-to-end, write the integration smoke test.
8. Manual verification against a running local backend.

## Verification (end-to-end)

1. Start backend: `npm run dev` in `html-to-pdf` with `CORS_ORIGINS=http://localhost:5173`.
2. Start frontend: `npm run dev` in `html-to-pdf-frontend`.
3. Paste markdown → switch to Preview tab → confirm render.
4. Submit → watch toolbar pill transition `submitting → waiting → active → completed` → click download → PDF opens.
5. Paste HTML with a `<script>` tag → submit → confirm preview omits the script and the resulting PDF is clean.
6. Submit 21 times in 60s → confirm 429 toast on the 21st with a `Retry-After` countdown.
7. Submit content < 10 chars → confirm inline validation error, submit disabled.
8. Kill the backend mid-poll → confirm timeout toast after 120s.
