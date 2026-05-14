# Frontend Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React + Vite SPA in a new sibling repo (`html-to-pdf-frontend`) that acts as an internal developer playground for the existing `html-to-pdf` API, plus add a CORS middleware to the backend so the frontend can call it from a different origin.

**Architecture:** Two repos. Backend gets one additive change (`cors` middleware gated by `CORS_ORIGINS` env var). Frontend is a single-page Vite app with tabs (Editor | Preview), dark theme, plain React hooks for the async lifecycle (no global state lib, no React Query). All state lives in `App.tsx` as a discriminated union state machine.

**Tech Stack:** React 18 + TypeScript + Vite + Vitest + @testing-library/react + MSW (Mock Service Worker) + marked + DOMPurify. Backend additions: `cors` + `@types/cors`.

**Spec:** `docs/superpowers/specs/2026-05-14-frontend-design.md` (this repo).

---

## File map

**Backend (this repo, `~/Documents/work/html-to-pdf`):**
- Modify: `package.json` (add cors, @types/cors)
- Modify: `src/app.ts:9-18` (mount cors middleware before helmet; new `parseCorsOrigins` helper)
- Modify: `README.md` env table (add `CORS_ORIGINS` row)
- Create: `tests/integration/cors.test.ts`

**Frontend (new repo, `~/Documents/work/html-to-pdf-frontend`):**
- Scaffolded by `npm create vite@latest`: `index.html`, `package.json`, `tsconfig.json`, `vite.config.ts`, `src/main.tsx`, `src/vite-env.d.ts`
- Create: `.env.example`, `.gitignore` additions
- Create: `vitest.config.ts`, `src/setupTests.ts`
- Create: `src/api/pdfClient.ts` + `src/api/pdfClient.test.ts`
- Create: `src/utils/detectType.ts` + `src/utils/detectType.test.ts`
- Create: `src/utils/renderMarkdown.ts`
- Create: `src/hooks/useSubmit.ts` + `src/hooks/useSubmit.test.ts`
- Create: `src/hooks/usePoll.ts` + `src/hooks/usePoll.test.ts`
- Create: `src/components/Editor.tsx`, `Preview.tsx`, `Tabs.tsx`, `Toolbar.tsx`, `StatusBar.tsx`
- Create: `src/theme.css`
- Modify: `src/App.tsx` (replace scaffold), `src/App.test.tsx`

---

## Task 1: Backend — CORS middleware

**Branch:** new branch `feat/cors-middleware` off `main` in `~/Documents/work/html-to-pdf` (not `refactor/review-fixes`).

**Files:**
- Modify: `package.json`
- Modify: `src/app.ts` (lines 1-18)
- Modify: `README.md` (env table)
- Create: `tests/integration/cors.test.ts`

- [ ] **Step 1: Create branch and install deps**

```bash
cd ~/Documents/work/html-to-pdf
git checkout main
git pull
git checkout -b feat/cors-middleware
npm install --save cors
npm install --save-dev @types/cors
```

- [ ] **Step 2: Write the failing test for allowed origin**

Create `tests/integration/cors.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";

const { bullBoardMockFactory, s3ServiceMockFactory } = await vi.hoisted(
  async () => await import("./mock-factories"),
);

vi.mock("../../src/queues/queue", () => ({
  pdfQueue: { add: vi.fn(), getJob: vi.fn() },
  PDF_QUEUE_NAME: "pdfGeneration",
  PDF_JOB_NAME: "generatePdf",
}));
vi.mock("../../src/monitoring/queues/bull-board", bullBoardMockFactory);
vi.mock("../../src/config/redis.config", () => ({
  appRedisClient: {
    get: vi.fn(),
    setex: vi.fn(),
    ping: vi.fn(async () => "PONG"),
    quit: vi.fn(),
  },
  bullmqConnection: { quit: vi.fn() },
}));
vi.mock("../../src/services/s3.service", s3ServiceMockFactory);

beforeAll(() => {
  process.env.CORS_ORIGINS = "http://localhost:5173,https://playground.example.com";
});

const importApp = async () => (await import("../../src/app")).default;

describe("CORS middleware", () => {
  it("allows requests from origins in CORS_ORIGINS", async () => {
    const app = await importApp();
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("rejects (omits header for) origins not in CORS_ORIGINS", async () => {
    const app = await importApp();
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example.com");
    // cors lib: when origin function calls cb(null, false), no
    // Access-Control-Allow-Origin header is set. Request still goes through.
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("responds 204 to preflight OPTIONS from allowed origin", async () => {
    const app = await importApp();
    const res = await request(app)
      .options("/pdf")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/integration/cors.test.ts
```

Expected: all 3 tests fail — `access-control-allow-origin` header is undefined.

- [ ] **Step 4: Implement CORS middleware in src/app.ts**

Replace the top of `src/app.ts` (lines 1-19) with:

```ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pdfRoutes from './routes/pdf.route';
import { errorHandler } from './middlewares/error-handler';
import { requestContext } from './middlewares/request-context.middleware';
import { setupQueueDashboard } from './monitoring/queues/bull-board';
import { appRedisClient } from './config/redis.config';

const parseCorsOrigins = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const app = express();

const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
if (corsOrigins.length > 0) {
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || corsOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
    }),
  );
}
```

Keep the rest of the file unchanged (the `trustProxyHops` block, `app.use(helmet())`, routes, etc.).

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/integration/cors.test.ts
```

Expected: all 3 pass.

- [ ] **Step 6: Run full backend test suite to confirm no regressions**

```bash
npx tsc --noEmit && npm test
```

Expected: tsc clean, 26 tests passing (23 existing + 3 new).

- [ ] **Step 7: Update README env table**

In `README.md`, add a new row to the environment table after `LOG_LEVEL`:

```markdown
| `CORS_ORIGINS` | no | — | Comma-separated allowlist of origins permitted to call the API from a browser. Empty / unset = CORS middleware not mounted. Example: `http://localhost:5173,https://playground.example.com`. |
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/app.ts README.md tests/integration/cors.test.ts
git commit -m "feat(cors): add CORS middleware gated by CORS_ORIGINS

Mounts cors() before helmet() when CORS_ORIGINS is set (comma-separated
allowlist). Rejects unknown origins by omitting the
Access-Control-Allow-Origin header. Adds integration test covering
allowed origin, rejected origin, and preflight."
```

- [ ] **Step 9: Push and open PR**

```bash
git push -u origin feat/cors-middleware
gh pr create --title "feat(cors): add CORS middleware gated by CORS_ORIGINS" --body "Enables the upcoming html-to-pdf-frontend playground to call the API from a different origin. Empty CORS_ORIGINS keeps the middleware unmounted."
```

Wait for CI to pass and merge before starting Task 2.

---

## Task 2: Scaffold frontend repo

**Files (new repo):**
- Create: `~/Documents/work/html-to-pdf-frontend/` (Vite scaffold)
- Modify: `package.json`, `vite.config.ts`, `.gitignore`
- Create: `.env.example`, `vitest.config.ts`, `src/setupTests.ts`

- [ ] **Step 1: Scaffold via Vite**

```bash
cd ~/Documents/work
npm create vite@latest html-to-pdf-frontend -- --template react-ts
cd html-to-pdf-frontend
npm install
```

When prompted, confirm React + TypeScript template (no SWC).

- [ ] **Step 2: Initialize git and baseline commit**

```bash
git init
git add -A
git commit -m "chore: vite react-ts scaffold"
```

- [ ] **Step 3: Install runtime + dev deps**

```bash
npm install marked dompurify
npm install --save-dev @types/dompurify msw @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom vitest @vitest/coverage-v8
```

- [ ] **Step 4: Configure Vite dev port and define env**

Replace `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 5: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
});
```

- [ ] **Step 6: Create src/setupTests.ts**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 7: Add test script to package.json**

In `package.json` `scripts`, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 8: Create .env.example**

```
VITE_API_BASE_URL=http://localhost:3000
```

- [ ] **Step 9: Append to .gitignore**

Append to the existing `.gitignore`:

```
.env
.env.local
coverage/
```

- [ ] **Step 10: Smoke check — start dev server**

```bash
npm run dev
```

Expected: Vite reports `Local: http://localhost:5173`. Open it in a browser — see the default Vite + React page. Stop with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: add test tooling (vitest, RTL, MSW), env example, port config"
```

---

## Task 3: API client (`pdfClient.ts`)

**Files:**
- Create: `src/api/pdfClient.ts`
- Create: `src/api/pdfClient.test.ts`

- [ ] **Step 1: Write failing tests with MSW**

Create `src/api/pdfClient.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { submitContent, pollJob, ApiError } from './pdfClient';

const API = 'http://api.test';

const handlers = [
  http.post(`${API}/pdf`, async ({ request }) => {
    const body = (await request.json()) as { content: string };
    if (body.content.length < 10) {
      return HttpResponse.json(
        { error: 'Validation error: Content too short' },
        { status: 400 },
      );
    }
    if (body.content === 'RATE_LIMIT') {
      return HttpResponse.json(
        { error: 'Too many PDF generation requests' },
        { status: 429, headers: { 'Retry-After': '42' } },
      );
    }
    return HttpResponse.json(
      { message: 'ok', jobId: 'job-1', file: 'f.pdf', detectedType: 'html' },
      { status: 202 },
    );
  }),
  http.get(`${API}/pdf/job-1/url`, () =>
    HttpResponse.json({ status: 'completed', url: 'https://s3/x.pdf', cached: false }),
  ),
  http.get(`${API}/pdf/job-failed/url`, () =>
    HttpResponse.json({ status: 'failed', reason: 'PDF generation failed' }, { status: 422 }),
  ),
  http.get(`${API}/pdf/job-missing/url`, () =>
    HttpResponse.json({ error: 'Job with ID job-missing not found' }, { status: 404 }),
  ),
];

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen();
  (import.meta as any).env = { VITE_API_BASE_URL: API };
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('submitContent', () => {
  it('returns jobId on 202', async () => {
    const res = await submitContent('hello world long enough', API);
    expect(res.jobId).toBe('job-1');
    expect(res.detectedType).toBe('html');
  });

  it('throws ApiError(validation) on 400', async () => {
    await expect(submitContent('short', API)).rejects.toMatchObject({
      code: 'validation',
      message: expect.stringContaining('Content too short'),
    });
  });

  it('throws ApiError(rate_limit) with retryAfter on 429', async () => {
    await expect(submitContent('RATE_LIMIT_____', API)).rejects.toMatchObject({
      code: 'rate_limit',
      retryAfter: 42,
    });
  });
});

describe('pollJob', () => {
  it('returns completed shape', async () => {
    const res = await pollJob('job-1', API);
    expect(res).toEqual({ kind: 'completed', url: 'https://s3/x.pdf' });
  });

  it('returns failed shape on 422', async () => {
    const res = await pollJob('job-failed', API);
    expect(res).toEqual({ kind: 'failed', reason: 'PDF generation failed' });
  });

  it('returns notFound on 404', async () => {
    const res = await pollJob('job-missing', API);
    expect(res).toEqual({ kind: 'not_found' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/api/pdfClient.test.ts
```

Expected: import errors — `pdfClient.ts` doesn't exist yet.

- [ ] **Step 3: Implement pdfClient.ts**

Create `src/api/pdfClient.ts`:

```ts
export type ApiErrorCode = 'validation' | 'rate_limit' | 'http' | 'network';

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status?: number,
    public readonly retryAfter?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SubmitResult {
  jobId: string;
  file: string;
  detectedType: 'html' | 'markdown';
}

export type PollResult =
  | { kind: 'active'; state: string }
  | { kind: 'completed'; url: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'not_found' };

const ACTIVE_STATES = new Set([
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'waiting-children',
]);

const getBaseUrl = (override?: string): string =>
  override ?? import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export const submitContent = async (
  content: string,
  baseUrl?: string,
): Promise<SubmitResult> => {
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl(baseUrl)}/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error('[PdfClient][submitContent] network', err);
    throw new ApiError('network', 'Cannot reach API');
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 202) {
    return body as SubmitResult;
  }
  if (res.status === 400) {
    throw new ApiError('validation', String(body.error ?? 'Validation failed'), 400, undefined, body);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    throw new ApiError('rate_limit', String(body.error ?? 'Rate limited'), 429, retryAfter, body);
  }
  console.error('[PdfClient][submitContent] http', res.status, body);
  throw new ApiError('http', `Unexpected status ${res.status}`, res.status, undefined, body);
};

export const pollJob = async (jobId: string, baseUrl?: string): Promise<PollResult> => {
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl(baseUrl)}/pdf/${encodeURIComponent(jobId)}/url`);
  } catch (err) {
    console.error('[PdfClient][pollJob] network', err);
    throw new ApiError('network', 'Cannot reach API');
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 404) return { kind: 'not_found' };
  if (res.status === 422) {
    return { kind: 'failed', reason: String(body.reason ?? 'PDF generation failed') };
  }
  if (res.status === 429) {
    throw new ApiError('rate_limit', 'Rate limited (poll)', 429);
  }
  if (res.status !== 200) {
    console.error('[PdfClient][pollJob] http', res.status, body);
    throw new ApiError('http', `Unexpected status ${res.status}`, res.status, undefined, body);
  }
  if (body.status === 'completed' && typeof body.url === 'string') {
    return { kind: 'completed', url: body.url };
  }
  if (typeof body.status === 'string' && ACTIVE_STATES.has(body.status)) {
    return { kind: 'active', state: body.status };
  }
  return { kind: 'active', state: String(body.status ?? 'unknown') };
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/api/pdfClient.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/
git commit -m "feat(api): pdfClient with typed errors and poll-result variants"
```

---

## Task 4: detectType utility

**Files:**
- Create: `src/utils/detectType.ts`
- Create: `src/utils/detectType.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/utils/detectType.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectType } from './detectType';

describe('detectType', () => {
  it('classifies plain HTML as html', () => {
    expect(detectType('<h1>Hi</h1>')).toBe('html');
  });

  it('classifies headings as markdown', () => {
    expect(detectType('# Title\n\nParagraph')).toBe('markdown');
  });

  it('classifies bullet lists as markdown', () => {
    expect(detectType('* item 1\n* item 2')).toBe('markdown');
  });

  it('classifies bold inline as markdown', () => {
    expect(detectType('This is **bold**')).toBe('markdown');
  });

  it('classifies code fences as markdown', () => {
    expect(detectType('```js\nconsole.log(1)\n```')).toBe('markdown');
  });

  it('classifies plain prose as html (no markdown markers)', () => {
    expect(detectType('Just plain prose with no markup at all.')).toBe('html');
  });

  it('treats leading-< as html even if markdown appears later', () => {
    expect(detectType('<p>start</p>\n\n# heading')).toBe('html');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/utils/detectType.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement detectType.ts**

Create `src/utils/detectType.ts`:

```ts
// Mirror of backend heuristic in
// html-to-pdf/src/services/content.service.ts (markdownIndicators +
// detectContentType). Keep this file in sync if the backend heuristic
// changes — the backend is the source of truth; this is best-effort
// preview labeling.
export type ContentType = 'html' | 'markdown';

const MARKDOWN_INDICATORS: RegExp[] = [
  /^#{1,6}\s/m,
  /^\s*[*\-+]\s/m,
  /^\s*\d+\.\s/m,
  /\*\*[^*]+\*\*/,
  /(^|\s)_[^_]+_(\s|$)/,
  /^\s*>\s/m,
  /^```/m,
  /^\s*\|.*\|\s*$/m,
  /\[[^\]]+\]\([^)]+\)/,
];

export const detectType = (content: string): ContentType => {
  const trimmed = content.trim();
  if (trimmed.startsWith('<')) return 'html';
  if (MARKDOWN_INDICATORS.some((p) => p.test(trimmed))) return 'markdown';
  return 'html';
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/utils/detectType.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/
git commit -m "feat(utils): detectType heuristic mirroring backend"
```

---

## Task 5: renderMarkdown utility

**Files:**
- Create: `src/utils/renderMarkdown.ts`

- [ ] **Step 1: Implement renderMarkdown**

Create `src/utils/renderMarkdown.ts`:

```ts
import { Lexer, Parser } from 'marked';
import DOMPurify from 'dompurify';

const MARKED_OPTIONS = { gfm: true, breaks: true } as const;

const PURIFY_OPTIONS: DOMPurify.Config = {
  ALLOWED_TAGS: undefined,  // default DOMPurify allowlist
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick'],
};

export const renderMarkdownToHtml = (markdown: string): string => {
  const tokens = new Lexer(MARKED_OPTIONS).lex(markdown);
  const rawHtml = new Parser(MARKED_OPTIONS).parse(tokens);
  return DOMPurify.sanitize(rawHtml, PURIFY_OPTIONS);
};

export const sanitizeHtml = (html: string): string =>
  DOMPurify.sanitize(html, PURIFY_OPTIONS);
```

(No tests required — pure pass-through to libraries we trust. Integration smoke test covers it via App.test.tsx in Task 11.)

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/utils/renderMarkdown.ts
git commit -m "feat(utils): renderMarkdownToHtml + sanitizeHtml for preview"
```

---

## Task 6: useSubmit hook

**Files:**
- Create: `src/hooks/useSubmit.ts`
- Create: `src/hooks/useSubmit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/hooks/useSubmit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSubmit } from './useSubmit';
import * as client from '../api/pdfClient';

describe('useSubmit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns idle initially', () => {
    const { result } = renderHook(() => useSubmit());
    expect(result.current.state).toEqual({ phase: 'idle' });
  });

  it('transitions to submitting then success', async () => {
    vi.spyOn(client, 'submitContent').mockResolvedValue({
      jobId: 'j1', file: 'f.pdf', detectedType: 'html',
    });
    const { result } = renderHook(() => useSubmit());
    let onResult = vi.fn();
    act(() => { result.current.submit('hello world ten plus chars', onResult); });
    expect(result.current.state.phase).toBe('submitting');
    await waitFor(() => expect(result.current.state.phase).toBe('idle'));
    expect(onResult).toHaveBeenCalledWith({ jobId: 'j1', file: 'f.pdf', detectedType: 'html' });
  });

  it('exposes rate_limit cooldown from Retry-After', async () => {
    vi.spyOn(client, 'submitContent').mockRejectedValue(
      new client.ApiError('rate_limit', 'Rate limited', 429, 5),
    );
    const { result } = renderHook(() => useSubmit());
    act(() => { result.current.submit('content long enough', vi.fn()); });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ phase: 'rate_limited', retryAfter: 5 }),
    );
    act(() => { vi.advanceTimersByTime(5000); });
    await waitFor(() => expect(result.current.state.phase).toBe('idle'));
  });

  it('surfaces validation errors', async () => {
    vi.spyOn(client, 'submitContent').mockRejectedValue(
      new client.ApiError('validation', 'Validation error: Content too short'),
    );
    const { result } = renderHook(() => useSubmit());
    act(() => { result.current.submit('short', vi.fn()); });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({
        phase: 'error',
        code: 'validation',
        message: expect.stringContaining('too short'),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/useSubmit.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement useSubmit.ts**

Create `src/hooks/useSubmit.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { ApiError, submitContent, type SubmitResult } from '../api/pdfClient';

export type SubmitState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'rate_limited'; retryAfter: number; until: number }
  | { phase: 'error'; code: 'validation' | 'http' | 'network'; message: string };

export interface UseSubmit {
  state: SubmitState;
  submit: (content: string, onSuccess: (r: SubmitResult) => void) => void;
}

export const useSubmit = (): UseSubmit => {
  const [state, setState] = useState<SubmitState>({ phase: 'idle' });
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const submit = (content: string, onSuccess: (r: SubmitResult) => void) => {
    setState({ phase: 'submitting' });
    submitContent(content)
      .then((res) => {
        setState({ phase: 'idle' });
        onSuccess(res);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.code === 'rate_limit') {
          const retryAfter = err.retryAfter ?? 60;
          const until = Date.now() + retryAfter * 1000;
          setState({ phase: 'rate_limited', retryAfter, until });
          timeoutRef.current = window.setTimeout(() => {
            setState({ phase: 'idle' });
            timeoutRef.current = null;
          }, retryAfter * 1000);
          return;
        }
        if (err instanceof ApiError) {
          setState({
            phase: 'error',
            code: err.code === 'validation' ? 'validation' : err.code === 'network' ? 'network' : 'http',
            message: err.message,
          });
          return;
        }
        setState({ phase: 'error', code: 'network', message: 'Unknown error' });
      });
  };

  return { state, submit };
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/useSubmit.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSubmit.ts src/hooks/useSubmit.test.ts
git commit -m "feat(hooks): useSubmit with rate-limit cooldown"
```

---

## Task 7: usePoll hook

**Files:**
- Create: `src/hooks/usePoll.ts`
- Create: `src/hooks/usePoll.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/hooks/usePoll.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePoll } from './usePoll';
import * as client from '../api/pdfClient';

describe('usePoll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns idle when jobId is null', () => {
    const { result } = renderHook(() => usePoll(null));
    expect(result.current).toMatchObject({ phase: 'idle' });
  });

  it('polls until completed', async () => {
    const spy = vi.spyOn(client, 'pollJob')
      .mockResolvedValueOnce({ kind: 'active', state: 'waiting' })
      .mockResolvedValueOnce({ kind: 'active', state: 'active' })
      .mockResolvedValueOnce({ kind: 'completed', url: 'https://s3/x.pdf' });
    const { result } = renderHook(() => usePoll('job-1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await waitFor(() =>
      expect(result.current).toMatchObject({ phase: 'completed', url: 'https://s3/x.pdf' }),
    );
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('stops on failed', async () => {
    vi.spyOn(client, 'pollJob').mockResolvedValue({ kind: 'failed', reason: 'oops' });
    const { result } = renderHook(() => usePoll('job-1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await waitFor(() =>
      expect(result.current).toMatchObject({ phase: 'failed', reason: 'oops' }),
    );
  });

  it('stops on not_found', async () => {
    vi.spyOn(client, 'pollJob').mockResolvedValue({ kind: 'not_found' });
    const { result } = renderHook(() => usePoll('job-x'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await waitFor(() =>
      expect(result.current).toMatchObject({ phase: 'error', code: 'not_found' }),
    );
  });

  it('times out after max wall-clock', async () => {
    vi.spyOn(client, 'pollJob').mockResolvedValue({ kind: 'active', state: 'waiting' });
    const { result } = renderHook(() => usePoll('job-1', { intervalMs: 100, timeoutMs: 300 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await waitFor(() =>
      expect(result.current).toMatchObject({ phase: 'error', code: 'timeout' }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/usePoll.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement usePoll.ts**

Create `src/hooks/usePoll.ts`:

```ts
import { useEffect, useState } from 'react';
import { ApiError, pollJob } from '../api/pdfClient';

export type PollState =
  | { phase: 'idle' }
  | { phase: 'polling'; state: string }
  | { phase: 'completed'; url: string }
  | { phase: 'failed'; reason: string }
  | { phase: 'error'; code: 'timeout' | 'not_found' | 'http' | 'network'; message: string };

const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 120_000;
const BACKOFF_INTERVAL_MS = 3000;

export const usePoll = (
  jobId: string | null,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): PollState => {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [state, setState] = useState<PollState>({ phase: 'idle' });

  useEffect(() => {
    if (!jobId) {
      setState({ phase: 'idle' });
      return;
    }
    setState({ phase: 'polling', state: 'waiting' });
    let cancelled = false;
    let timer: number | null = null;
    const deadline = Date.now() + timeoutMs;
    let currentInterval = intervalMs;

    const schedule = (delay: number) => {
      timer = window.setTimeout(tick, delay);
    };

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() >= deadline) {
        setState({
          phase: 'error',
          code: 'timeout',
          message: `Polling exceeded ${timeoutMs}ms`,
        });
        return;
      }
      try {
        const res = await pollJob(jobId);
        if (cancelled) return;
        if (res.kind === 'completed') {
          setState({ phase: 'completed', url: res.url });
          return;
        }
        if (res.kind === 'failed') {
          setState({ phase: 'failed', reason: res.reason });
          return;
        }
        if (res.kind === 'not_found') {
          setState({
            phase: 'error',
            code: 'not_found',
            message: 'Job not found — Redis may have evicted it. Resubmit.',
          });
          return;
        }
        setState({ phase: 'polling', state: res.state });
        currentInterval = intervalMs;
        schedule(currentInterval);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'rate_limit') {
          currentInterval = BACKOFF_INTERVAL_MS;
          schedule(currentInterval);
          return;
        }
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setState({
          phase: 'error',
          code: err instanceof ApiError && err.code === 'network' ? 'network' : 'http',
          message: msg,
        });
      }
    };

    schedule(0);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [jobId, intervalMs, timeoutMs]);

  return state;
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/usePoll.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePoll.ts src/hooks/usePoll.test.ts
git commit -m "feat(hooks): usePoll with backoff and timeout"
```

---

## Task 8: Theme + presentational components

**Files:**
- Create: `src/theme.css`
- Create: `src/components/Tabs.tsx`
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/StatusBar.tsx`

- [ ] **Step 1: Create theme.css**

```css
:root {
  --bg: #0d1117;
  --panel: #1a1f26;
  --panel-2: #232a33;
  --border: #2d3540;
  --fg: #e6edf3;
  --fg-dim: #8b949e;
  --accent: #3b82f6;
  --danger: #ef4444;
  --warning: #f59e0b;
  --success: #22c55e;
  --mono: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }
html, body, #root {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--sans);
  font-size: 13px;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  height: 40px;
}

.toolbar .spacer { flex: 1; }

.toolbar button {
  background: var(--accent);
  color: white;
  border: 0;
  border-radius: 4px;
  padding: 6px 14px;
  font: inherit;
  cursor: pointer;
}
.toolbar button:disabled { background: var(--panel-2); color: var(--fg-dim); cursor: not-allowed; }

.pill {
  font-family: var(--mono);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--panel-2);
  color: var(--fg-dim);
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  height: 32px;
  align-items: stretch;
}
.tabs button {
  background: transparent;
  border: 0;
  color: var(--fg-dim);
  padding: 4px 12px;
  border-radius: 3px;
  font: inherit;
  cursor: pointer;
}
.tabs button.active { background: var(--accent); color: white; }

.pane { flex: 1; overflow: hidden; }

.statusbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: var(--panel);
  border-top: 1px solid var(--border);
  height: 28px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-dim);
}
.statusbar a { color: var(--accent); text-decoration: none; }
.statusbar a:hover { text-decoration: underline; }
.statusbar.error { color: var(--danger); }
.statusbar.success { color: var(--success); }

.counter.over { color: var(--danger); }
.counter.under { color: var(--warning); }
```

- [ ] **Step 2: Create Tabs.tsx**

```tsx
interface Props {
  active: 'editor' | 'preview';
  onChange: (tab: 'editor' | 'preview') => void;
}

export const Tabs = ({ active, onChange }: Props) => (
  <div className="tabs" role="tablist">
    {(['editor', 'preview'] as const).map((tab) => (
      <button
        key={tab}
        role="tab"
        aria-selected={active === tab}
        className={active === tab ? 'active' : ''}
        onClick={() => onChange(tab)}
      >
        {tab === 'editor' ? 'Editor' : 'Preview'}
      </button>
    ))}
  </div>
);
```

- [ ] **Step 3: Create Toolbar.tsx**

```tsx
interface Props {
  charCount: number;
  detectedType: 'html' | 'markdown';
  canSubmit: boolean;
  submitting: boolean;
  cooldownSeconds: number | null;
  onSubmit: () => void;
}

const MIN = 10;
const MAX = 50_000;

export const Toolbar = ({
  charCount, detectedType, canSubmit, submitting, cooldownSeconds, onSubmit,
}: Props) => {
  const counterClass =
    charCount < MIN ? 'counter under' : charCount > MAX ? 'counter over' : 'counter';
  const label = cooldownSeconds !== null
    ? `Wait ${cooldownSeconds}s`
    : submitting ? 'Working…' : 'Submit (⌘/Ctrl+↵)';
  return (
    <div className="toolbar">
      <strong>PDF Playground</strong>
      <span className={`pill ${counterClass}`}>
        {charCount} / {MAX}
      </span>
      <span className="pill">{detectedType}</span>
      <div className="spacer" />
      <button disabled={!canSubmit} onClick={onSubmit}>{label}</button>
    </div>
  );
};
```

- [ ] **Step 4: Create StatusBar.tsx**

```tsx
import type { PollState } from '../hooks/usePoll';
import type { SubmitState } from '../hooks/useSubmit';

interface Props {
  pollState: PollState;
  submitState: SubmitState;
}

export const StatusBar = ({ pollState, submitState }: Props) => {
  if (submitState.phase === 'error') {
    return <div className="statusbar error">⚠ {submitState.message}</div>;
  }
  if (submitState.phase === 'rate_limited') {
    return <div className="statusbar error">⚠ Rate limited — retrying in {submitState.retryAfter}s</div>;
  }
  if (submitState.phase === 'submitting') {
    return <div className="statusbar">Submitting…</div>;
  }
  if (pollState.phase === 'polling') {
    return <div className="statusbar">Job state: {pollState.state}…</div>;
  }
  if (pollState.phase === 'completed') {
    return (
      <div className="statusbar success">
        ✓ Ready — <a href={pollState.url} target="_blank" rel="noreferrer">download PDF</a>
      </div>
    );
  }
  if (pollState.phase === 'failed') {
    return <div className="statusbar error">✗ Failed: {pollState.reason}</div>;
  }
  if (pollState.phase === 'error') {
    return <div className="statusbar error">⚠ {pollState.message}</div>;
  }
  return <div className="statusbar">Idle</div>;
};
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/theme.css src/components/Tabs.tsx src/components/Toolbar.tsx src/components/StatusBar.tsx
git commit -m "feat(ui): theme + Tabs, Toolbar, StatusBar"
```

---

## Task 9: Editor and Preview

**Files:**
- Create: `src/components/Editor.tsx`
- Create: `src/components/Preview.tsx`

- [ ] **Step 1: Create Editor.tsx**

```tsx
import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmitShortcut: () => void;
}

export const Editor = ({ value, onChange, onSubmitShortcut }: Props) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <textarea
      ref={ref}
      className="pane"
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg)',
        color: 'var(--fg)',
        border: 0,
        outline: 'none',
        padding: '12px',
        fontFamily: 'var(--mono)',
        fontSize: 13,
        lineHeight: 1.55,
        resize: 'none',
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          onSubmitShortcut();
        }
      }}
      placeholder="Paste HTML or Markdown here (10–50000 chars)…"
      spellCheck={false}
    />
  );
};
```

- [ ] **Step 2: Create Preview.tsx**

```tsx
import { useEffect, useState } from 'react';
import { renderMarkdownToHtml, sanitizeHtml } from '../utils/renderMarkdown';
import type { ContentType } from '../utils/detectType';

interface Props {
  content: string;
  detectedType: ContentType;
}

const DEBOUNCE_MS = 150;

export const Preview = ({ content, detectedType }: Props) => {
  const [srcDoc, setSrcDoc] = useState('');
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const body = detectedType === 'markdown'
        ? renderMarkdownToHtml(content)
        : sanitizeHtml(content);
      setSrcDoc(
        `<!doctype html><html><head><meta charset="utf-8"><style>
          body{font:13px/1.55 system-ui,sans-serif;color:#111;padding:16px;background:#fff;}
          pre,code{font-family:ui-monospace,monospace;}
        </style></head><body>${body}</body></html>`,
      );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [content, detectedType]);
  return (
    <iframe
      title="preview"
      className="pane"
      sandbox=""
      srcDoc={srcDoc}
      style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
    />
  );
};
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/Editor.tsx src/components/Preview.tsx
git commit -m "feat(ui): Editor textarea (ctrl+enter submit) + sandboxed Preview iframe"
```

---

## Task 10: App state machine

**Files:**
- Modify: `src/App.tsx` (replace scaffold)
- Modify: `src/main.tsx` (import theme.css)

- [ ] **Step 1: Update main.tsx**

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 2: Replace App.tsx**

```tsx
import { useEffect, useState } from 'react';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Tabs } from './components/Tabs';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { useSubmit } from './hooks/useSubmit';
import { usePoll } from './hooks/usePoll';
import { detectType } from './utils/detectType';

const MIN = 10;
const MAX = 50_000;

const App = () => {
  const [content, setContent] = useState('');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [jobId, setJobId] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState<number | null>(null);

  const detectedType = detectType(content);
  const submit = useSubmit();
  const poll = usePoll(jobId);

  const lengthValid = content.length >= MIN && content.length <= MAX;
  const canSubmit =
    lengthValid &&
    submit.state.phase !== 'submitting' &&
    submit.state.phase !== 'rate_limited' &&
    poll.phase !== 'polling';

  // Drive the visible cooldown counter when rate-limited.
  useEffect(() => {
    if (submit.state.phase !== 'rate_limited') {
      setCooldownLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((submit.state as { until: number }).until - Date.now()) / 1000);
      setCooldownLeft(Math.ceil(left));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [submit.state]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    submit.submit(content, (res) => setJobId(res.jobId));
  };

  return (
    <div className="app">
      <Toolbar
        charCount={content.length}
        detectedType={detectedType}
        canSubmit={canSubmit}
        submitting={submit.state.phase === 'submitting'}
        cooldownSeconds={cooldownLeft}
        onSubmit={handleSubmit}
      />
      <Tabs active={activeTab} onChange={setActiveTab} />
      {activeTab === 'editor'
        ? <Editor value={content} onChange={setContent} onSubmitShortcut={handleSubmit} />
        : <Preview content={content} detectedType={detectedType} />
      }
      <StatusBar pollState={poll} submitState={submit.state} />
    </div>
  );
};

export default App;
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Manual smoke check**

```bash
npm run dev
```

In another terminal, start the backend (with `CORS_ORIGINS=http://localhost:5173 npm run dev` in `~/Documents/work/html-to-pdf` — assumes Task 1 was merged).

Open `http://localhost:5173`. Type `# Hello\n\nThis is **bold**`. Verify:
- Toolbar pill shows `markdown`
- Char counter updates
- Preview tab renders bold text inside the iframe
- Submit triggers `submitting → polling → completed` and StatusBar shows download link

Stop both with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/App.tsx
git commit -m "feat(app): wire state machine, tabs, cooldown counter"
```

---

## Task 11: Integration smoke test

**Files:**
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write the integration test**

Create `src/App.test.tsx`:

```tsx
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import App from './App';

const API = 'http://api.test';

let pollHits = 0;
const server = setupServer(
  http.post(`${API}/pdf`, () =>
    HttpResponse.json(
      { message: 'ok', jobId: 'job-1', file: 'f.pdf', detectedType: 'markdown' },
      { status: 202 },
    ),
  ),
  http.get(`${API}/pdf/job-1/url`, () => {
    pollHits += 1;
    if (pollHits < 2) return HttpResponse.json({ status: 'active' });
    return HttpResponse.json({ status: 'completed', url: 'https://s3/x.pdf' });
  }),
);

beforeAll(() => {
  server.listen();
  (import.meta as any).env = { VITE_API_BASE_URL: API };
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} } as any);
});
afterEach(() => {
  pollHits = 0;
  server.resetHandlers();
});
afterAll(() => server.close());

describe('App full flow', () => {
  it('submit → poll → download link visible', async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByPlaceholderText(/Paste HTML or Markdown/);
    await user.type(editor, '# Hello world test content');
    const submit = screen.getByRole('button', { name: /Submit/i });
    await user.click(submit);
    await waitFor(
      () => expect(screen.getByText(/download PDF/i)).toBeInTheDocument(),
      { timeout: 8000 },
    );
    const link = screen.getByRole('link', { name: /download PDF/i });
    expect(link).toHaveAttribute('href', 'https://s3/x.pdf');
  });
});
```

- [ ] **Step 2: Run it**

```bash
npx vitest run src/App.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 3: Run full frontend test suite**

```bash
npm test
```

Expected: all tests pass across files (pdfClient: 6, detectType: 7, useSubmit: 4, usePoll: 5, App: 1 = 23 frontend tests).

- [ ] **Step 4: Commit**

```bash
git add src/App.test.tsx
git commit -m "test(app): full submit→poll→download smoke test with MSW"
```

---

## Task 12: Verification & first push

- [ ] **Step 1: End-to-end manual verification**

Start backend with CORS:
```bash
cd ~/Documents/work/html-to-pdf
CORS_ORIGINS=http://localhost:5173 npm run dev
```

Start frontend:
```bash
cd ~/Documents/work/html-to-pdf-frontend
npm run dev
```

Run through the spec's verification checklist (`docs/superpowers/specs/2026-05-14-frontend-design.md` §Verification):

1. Paste a markdown sample → switch to Preview → confirm rendered output.
2. Submit → watch StatusBar transition `submitting → waiting/active → completed` → click download → PDF opens in a new tab.
3. Paste HTML containing `<script>alert(1)</script>` → preview omits the script; submit → resulting PDF is clean.
4. In a loop, submit 21 times within 60 s → 21st shows rate-limit toast + cooldown counter.
5. Type content < 10 chars → counter is yellow ("under"), Submit disabled.
6. Stop the backend mid-poll → after 120 s, StatusBar shows timeout message.

- [ ] **Step 2: Push frontend repo (optional first push)**

If you have a remote ready:

```bash
git remote add origin <YOUR_REMOTE_URL>
git push -u origin main
```

If not, leave it local — the repo is complete and self-contained.

- [ ] **Step 3: Final commit (verification notes if needed)**

If any spec adjustment came out of verification, fix it inline and commit. Otherwise nothing to commit.

---

## Self-review

**Spec coverage:**
- ✅ Backend CORS middleware + env var + test → Task 1
- ✅ Vite + React + TS scaffold, separate repo, sibling dir → Task 2
- ✅ `api/pdfClient.ts` with typed errors → Task 3
- ✅ `utils/detectType.ts` mirroring backend → Task 4
- ✅ `utils/renderMarkdown.ts` → Task 5
- ✅ `useSubmit` with rate-limit cooldown → Task 6
- ✅ `usePoll` with backoff and timeout → Task 7
- ✅ Theme + Tabs + Toolbar + StatusBar → Task 8
- ✅ Editor + sandboxed Preview iframe → Task 9
- ✅ App state machine → Task 10
- ✅ Integration smoke test → Task 11
- ✅ End-to-end verification → Task 12
- ✅ Dark dev-tool theme — `theme.css` (Task 8)
- ✅ Tabs layout — `Tabs.tsx` + `App.tsx` (Tasks 8, 10)
- ✅ State machine matching spec §State machine — `App.tsx` + hook types (Tasks 6, 7, 10)
- ✅ Error matrix from spec §Error handling — handled across `pdfClient.ts`, `useSubmit`, `usePoll`, `StatusBar`
- ✅ Magic numbers (1500ms, 120s, 150ms) match spec — Tasks 7, 9

**Placeholders:** none.

**Type consistency:** `SubmitResult`, `ApiError`, `PollResult` shapes are defined once in `pdfClient.ts` (Task 3) and reused everywhere. `SubmitState`/`PollState` defined in their hook files and imported by `App.tsx` + `StatusBar`. No shape drift.

**Cross-task references:** `StatusBar` uses `PollState` from `usePoll.ts` and `SubmitState` from `useSubmit.ts` — both defined before Task 8 needs them.
