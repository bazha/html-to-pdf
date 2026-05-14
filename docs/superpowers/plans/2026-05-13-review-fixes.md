# Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply four code-review findings to the html-to-pdf service: stale CLAUDE.md docs (item 1), shared sanitize options for content/markdown services (item 2), test-order brittleness in `pdf.service` (item 3), and unnecessary `flushSync` cast in `server.ts` (item 6).

**Architecture:** Each finding is an independent, small refactor. No new runtime features. The only new file is `src/services/sanitize.config.ts`, which centralises the sanitize-html options shared between `content.service.ts` and `markdown.service.ts`. Production safety contract for `closeBrowser` remains intact: the shutdown sequence in `server.ts` already closes the BullMQ worker before the browser, so resetting the `closing` flag on `closeBrowser` completion does not introduce a real race.

**Tech Stack:** TypeScript (strict, `noEmit`), Node 20+, Express 5, BullMQ, ioredis, Puppeteer, `sanitize-html`, `marked`, Vitest. ES modules; extensionless relative imports.

**Baseline:** 23 tests passing (`npx vitest run`).

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `.claude/CLAUDE.md` | Modify | Fix stale S3 description and remove dead `src/docs/CHANGES.md` reference. |
| `src/server.ts` | Modify | Drop the `flushSync` cast on `uncaughtException`. |
| `src/services/pdf.service.ts` | Modify | Reset `closing` flag in `closeBrowser`'s `finally` so the module is reusable between tests. |
| `tests/unit/pdf.service.test.ts` | Modify | Replace the "must run last" test with one that asserts the reset behaviour. |
| `src/services/sanitize.config.ts` | **Create** | Shared base options + two named policies (`htmlSanitizeOptions`, `markdownSanitizeOptions`). |
| `src/services/content.service.ts` | Modify | Replace inline `HTML_SANITIZE_OPTIONS` with imported `htmlSanitizeOptions`. |
| `src/services/markdown.service.ts` | Modify | Replace inline `SANITIZE_OPTIONS` with imported `markdownSanitizeOptions`. |

Task order: docs first (zero risk), then the `flushSync` cleanup, then the `closing`-flag fix (changes a test), then the sanitize-options extraction (largest diff, but covered by existing regression tests in `pdf.routes.test.ts:157` and `content.service.test.ts`).

---

## Task 1: Fix stale CLAUDE.md documentation (item 1)

**Files:**
- Modify: `.claude/CLAUDE.md` (lines around 30 and the "Reference" section)

The CLAUDE.md "Request flow" section currently says `uploadPdfToS3` is a multipart upload via a `PassThrough` stream returning `{ key, fileSize }`. Reality (`src/services/s3.service.ts:11-28`): a single `PutObjectCommand` with a `Uint8Array` body that returns just the `key: string`. The worker (`src/workers/pdf.worker.ts:30-31`) wraps that into `{ key, fileSize }`. The "Reference" section points at `src/docs/CHANGES.md` which does not exist (verified with `ls src/docs` — directory absent).

- [ ] **Step 1: Locate the stale paragraph**

Run: `grep -n "PassThrough\|multipart\|CHANGES.md" .claude/CLAUDE.md`
Expected: a line in the "Request flow" section mentioning multipart/PassThrough, and a "Reference" block citing `src/docs/CHANGES.md`.

- [ ] **Step 2: Fix the S3 wording**

In `.claude/CLAUDE.md`, find the sentence that currently reads (around line 30):

```
4. The worker picks up the job, calls `generatePDFBuffer` (Puppeteer singleton — see below), then `uploadPdfToS3` (multipart upload via a `PassThrough` stream). Return value is `{ key, fileSize }` — `key` is the S3 object key, not a URL.
```

Replace it with:

```
4. The worker picks up the job, calls `generatePDFBuffer` (Puppeteer singleton — see below), then `uploadPdfToS3` (single `PutObjectCommand` with the buffered PDF). `uploadPdfToS3` returns the S3 object key; the worker wraps it as the job return value `{ key, fileSize }` so `getPdfUrlByJobId` can resolve a presigned URL later.
```

- [ ] **Step 3: Remove the dead "Reference" section**

In `.claude/CLAUDE.md`, find the block:

```
## Reference

`src/docs/CHANGES.md` documents two recent refactor rounds (bug fixes + readability). Useful if you hit something surprising and want the reasoning.
```

Delete that entire `## Reference` heading and the paragraph beneath it (the file does not exist, so the pointer is misleading).

- [ ] **Step 4: Verify no other stale references remain**

Run: `grep -nE "PassThrough|multipart|CHANGES\.md" .claude/CLAUDE.md`
Expected: no output.

Run: `ls src/docs 2>/dev/null && echo FOUND || echo OK`
Expected: `OK` (directory absent — confirms removed reference was correct).

- [ ] **Step 5: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs(claude.md): correct stale S3 description, drop dead CHANGES.md ref"
```

---

## Task 2: Drop unnecessary `flushSync` cast in server.ts (item 6)

**Files:**
- Modify: `src/server.ts:73-81`

Pino with no destination configured writes synchronously to stdout — `SonicBoom` buffering only kicks in when you pass a custom destination, which this codebase doesn't (`src/utils/logger.ts:14-17` calls `pino({ level, base: undefined })` with no second argument). The `(logger as unknown as { flushSync?: () => void }).flushSync?.()` line is therefore a no-op cast hiding behind an optional call. Drop it; if a future change adds an async destination, that PR should re-introduce the flush deliberately.

- [ ] **Step 1: Read the current handler**

File: `src/server.ts` lines 73-81 currently read:

```ts
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[Server][uncaughtException]');
  // Pino writes can be buffered (SonicBoom). Force a sync flush so the fatal
  // line lands on stdout before the process exits. flushSync lives on the
  // destination and isn't on the public Logger type.
  (logger as unknown as { flushSync?: () => void }).flushSync?.();
  // After uncaughtException the process is in an undefined state — exit.
  process.exit(1);
});
```

- [ ] **Step 2: Replace with the simpler version**

Edit `src/server.ts` so that block reads:

```ts
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, '[Server][uncaughtException]');
  // After uncaughtException the process is in an undefined state — exit.
  process.exit(1);
});
```

The comment about pino buffering and the cast both go away. The exit comment stays.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean exit).

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: 23 passing, 0 failing (no test exercises this code path; the assertion is just regression safety).

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "refactor(server): drop no-op flushSync cast in uncaughtException handler"
```

---

## Task 3: Reset `closing` flag in `closeBrowser` (item 3)

**Files:**
- Modify: `src/services/pdf.service.ts:60-77`
- Modify: `tests/unit/pdf.service.test.ts:65-71`

Right now `closing = true` is set permanently the first time `closeBrowser` runs, which is why the test on `tests/unit/pdf.service.test.ts:66` is annotated `// Must run last`. Two things change:

1. **Service:** reset `closing = false` in the `finally` block of `closeBrowser`. The production shutdown sequence in `src/server.ts:33-44` closes the BullMQ worker before the browser, so no real caller reaches `getBrowser` during shutdown. The flag still protects an in-flight close from a concurrent `getBrowser` call.
2. **Test:** the existing test asserts that *post-shutdown* calls reject. After the change, post-shutdown calls would launch a new browser. Replace the test with one that verifies the state actually resets (no need for ordering tricks).

- [ ] **Step 1: Write the failing test first**

Edit `tests/unit/pdf.service.test.ts`. Replace the existing test at lines 65-71:

```ts
  // Must run last — sets the module-level `closing` flag.
  it("rejects further generatePDFBuffer calls after closeBrowser()", async () => {
    await closeBrowser();
    await expect(generatePDFBuffer("<h1>Hi</h1>")).rejects.toThrow(
      "shutting down",
    );
  });
```

with:

```ts
  it("resets state on closeBrowser so the next call launches a fresh browser", async () => {
    await generatePDFBuffer("<h1>First</h1>");
    await closeBrowser();
    await generatePDFBuffer("<h1>Second</h1>");

    const puppeteer = (await import("puppeteer")).default;
    // One launch before close, one after.
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
  });
```

Note: this test now relies on the puppeteer mock from `vi.mock("puppeteer", ...)` at the top of the file. `puppeteer.launch` is already a `vi.fn()` returning the same browser stub, so the assertion is on call count.

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npx vitest run tests/unit/pdf.service.test.ts -t "resets state"`
Expected: FAIL. Either the second `generatePDFBuffer` rejects with "shutting down", or `puppeteer.launch` is only called once (because `browserPromise` still references the closed browser). The exact failure mode confirms the bug we're fixing.

- [ ] **Step 3: Fix the service**

Edit `src/services/pdf.service.ts`. The current `closeBrowser` (lines 60-77) reads:

```ts
export const closeBrowser = async (): Promise<void> => {
  // Set closing first so concurrent getBrowser() calls reject instead of
  // launching a new browser that would leak past shutdown.
  closing = true;
  if (!browserPromise) return;
  const pending = browserPromise;
  try {
    const browser = await pending;
    await browser.close();
  } catch (err) {
    logger.warn(
      { err },
      "[PdfService][closeBrowser] error while closing browser",
    );
  } finally {
    browserPromise = null;
  }
};
```

Replace with:

```ts
export const closeBrowser = async (): Promise<void> => {
  // Set closing first so concurrent getBrowser() calls reject instead of
  // launching a new browser while we're tearing the current one down.
  closing = true;
  const pending = browserPromise;
  try {
    if (pending) {
      const browser = await pending;
      await browser.close();
    }
  } catch (err) {
    logger.warn(
      { err },
      "[PdfService][closeBrowser] error while closing browser",
    );
  } finally {
    browserPromise = null;
    closing = false;
  }
};
```

Two changes vs. the original:
- The early `return` when `browserPromise` is null is folded into the `if (pending)` inside the `try`, so the `finally` always runs (resets both flags even on a no-op close).
- `closing = false` is reset alongside `browserPromise = null` in the `finally`.

- [ ] **Step 4: Run the new test — confirm it passes**

Run: `npx vitest run tests/unit/pdf.service.test.ts -t "resets state"`
Expected: PASS.

- [ ] **Step 5: Run the full pdf.service test file**

Run: `npx vitest run tests/unit/pdf.service.test.ts`
Expected: 3 passing (the two existing tests plus the new one).

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: 23 passing (we replaced one test 1-for-1, total count unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/services/pdf.service.ts tests/unit/pdf.service.test.ts
git commit -m "fix(pdf.service): reset closing flag in finally for test-order independence"
```

---

## Task 4: Extract shared sanitize options (item 2)

**Files:**
- Create: `src/services/sanitize.config.ts`
- Modify: `src/services/content.service.ts:1-49`
- Modify: `src/services/markdown.service.ts:1-32`

Both services currently maintain near-duplicate `sanitize-html` option objects (`src/services/content.service.ts:12-38` and `src/services/markdown.service.ts:7-24`). The shared parts — schemes, schemes-by-tag, `allowProtocolRelative`, `img` attributes, and a common extra-tag list — are security-sensitive and should be defined once. The intentional differences — structural tags and presentational attrs (`class`, `style`) are allowed only on the user-HTML path — stay explicit at the two named exports.

The existing test `tests/integration/pdf.routes.test.ts:157-169` ("strips `<script>` from sanitized HTML before enqueue") and the content-service tests in `tests/unit/content.service.test.ts` cover the sanitization behaviour. We rely on them for regression safety.

### Task 4a: Create the shared config

- [ ] **Step 1: Create the new file**

Create `src/services/sanitize.config.ts` with this exact content:

```ts
import sanitizeHtml from "sanitize-html";

// Tags allowed for both markdown-rendered and user-supplied HTML.
const COMMON_EXTRA_TAGS = ["img", "h1", "h2", "sup", "sub", "del"];

// Tags only allowed for user-supplied HTML — markdown can't produce these.
const STRUCTURAL_TAGS = [
  "figure",
  "figcaption",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "aside",
  "main",
];

// Shared schema parts. Security-sensitive — keep changes here in one place.
const sharedSchemaOptions: sanitizeHtml.IOptions = {
  allowedSchemes: ["http", "https", "data", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowProtocolRelative: false,
};

const imgAttributes = ["src", "alt", "title", "width", "height"];

// Used by content.service for user-supplied HTML — broader tag and attr policy.
export const htmlSanitizeOptions: sanitizeHtml.IOptions = {
  ...sharedSchemaOptions,
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(
    COMMON_EXTRA_TAGS,
    STRUCTURAL_TAGS,
  ),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["id", "class", "style"],
    img: imgAttributes,
  },
};

// Used by markdown.service for marked-rendered HTML — narrower policy since
// markdown can't introduce class/style or structural wrappers.
export const markdownSanitizeOptions: sanitizeHtml.IOptions = {
  ...sharedSchemaOptions,
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(COMMON_EXTRA_TAGS),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    "*": ["id"],
    img: imgAttributes,
  },
};
```

- [ ] **Step 2: Typecheck the new file**

Run: `npx tsc --noEmit`
Expected: no output. Confirms the `sanitizeHtml.IOptions` shape and `sanitizeHtml.defaults` types are correct.

### Task 4b: Wire content.service to the shared config

- [ ] **Step 3: Update `content.service.ts`**

Edit `src/services/content.service.ts`. The file currently has these top imports:

```ts
import sanitizeHtml from "sanitize-html";
import { generateHtmlFromMarkdown } from "./markdown.service";
import { wrapInDocument } from "./document.template";
```

Add the shared-options import; keep `sanitizeHtml` (still used as a function call):

```ts
import sanitizeHtml from "sanitize-html";
import { generateHtmlFromMarkdown } from "./markdown.service";
import { wrapInDocument } from "./document.template";
import { htmlSanitizeOptions } from "./sanitize.config";
```

Then delete the local `HTML_SANITIZE_OPTIONS` block (lines 12-38 in the current file — the entire `const HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = { … };` declaration).

In `generateHtmlFromAnyContent`, replace the call site:

```ts
    const sanitized = sanitizeHtml(content, HTML_SANITIZE_OPTIONS);
```

with:

```ts
    const sanitized = sanitizeHtml(content, htmlSanitizeOptions);
```

- [ ] **Step 4: Run the content.service tests**

Run: `npx vitest run tests/unit/content.service.test.ts`
Expected: all content.service tests pass — they assert the policy, not the variable name.

### Task 4c: Wire markdown.service to the shared config

- [ ] **Step 5: Update `markdown.service.ts`**

Edit `src/services/markdown.service.ts`. The file currently has these top imports:

```ts
import { marked, lexer, parser } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { wrapInDocument } from './document.template';
```

Add the shared-options import:

```ts
import { marked, lexer, parser } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { wrapInDocument } from './document.template';
import { markdownSanitizeOptions } from './sanitize.config';
```

Delete the local `SANITIZE_OPTIONS` block (the entire `const SANITIZE_OPTIONS: sanitizeHtml.IOptions = { … };` declaration, currently lines 7-24).

In `generateHtmlFromMarkdown`, replace:

```ts
  const sanitized = sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
```

with:

```ts
  const sanitized = sanitizeHtml(rawHtml, markdownSanitizeOptions);
```

- [ ] **Step 6: Run the markdown.service tests**

Run: `npx vitest run tests/unit/markdown.service.test.ts`
Expected: PASS.

### Task 4d: Verify the full suite and commit

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: 23 passing, 0 failing. Critical regression assertion is `tests/integration/pdf.routes.test.ts:157-169` ("strips `<script>` from sanitized HTML before enqueue") — this exercises the markdown-path sanitizer end to end.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add src/services/sanitize.config.ts src/services/content.service.ts src/services/markdown.service.ts
git commit -m "refactor(services): extract shared sanitize-html options"
```

---

## Final Verification

- [ ] **Step 1: Confirm clean working tree (relative to baseline)**

Run: `git status`
Expected: only the files this plan touched appear modified — no stray edits.

- [ ] **Step 2: Confirm tests still green**

Run: `npx vitest run`
Expected: 23 passing.

- [ ] **Step 3: Confirm typecheck still green**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Review the four commits**

Run: `git log --oneline -4`
Expected (top to bottom):
```
<sha> refactor(services): extract shared sanitize-html options
<sha> fix(pdf.service): reset closing flag in finally for test-order independence
<sha> refactor(server): drop no-op flushSync cast in uncaughtException handler
<sha> docs(claude.md): correct stale S3 description, drop dead CHANGES.md ref
```

---

## Notes for the Implementer

- **Commit-message style:** per the user's memory (`feedback_commit_messages.md`), do **not** include `Co-Authored-By:` trailers. The example commands above already omit them.
- **No build script:** this repo runs from source via `tsx`; `tsconfig.json` has `noEmit: true`. The only "build" verification is `npx tsc --noEmit`.
- **No lint/format step:** there is no ESLint or Prettier wired in. Match surrounding style by eye (mixed single/double quotes are tolerated; new code should follow whatever the file you're editing already uses — `markdown.service.ts` is single-quote, `content.service.ts` is double-quote).
- **ES modules + bundler resolution:** new files use extensionless relative imports (`./sanitize.config`, not `./sanitize.config.ts` or `./sanitize.config.js`).
- **Production safety of Task 3:** if you're tempted to keep the one-way `closing` flag for "extra safety," check `src/server.ts:33-44` — the worker is closed before `closeBrowser`, so no production caller is racing the close. The reset-on-finally version is strictly more correct, not less.
