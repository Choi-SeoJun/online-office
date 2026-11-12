# Private Feedback Implementation Plan

> **For agentic workers:** Use subagent-driven implementation for independent components, followed by a whole-branch security and integration review.

**Goal:** Let anonymous players send private suggestions that only the Site owner can review.

**Architecture:** Existing React game shares a feedback dialog; public submit API and authenticated admin API use Sites D1. The admin page lives on Sites and reuses its ChatGPT identity, while Pages keeps anonymous player access.

**Tech Stack:** React, TypeScript, Vinext, Cloudflare D1, Drizzle, node:test.

**Spec:** `docs/superpowers/specs/2026-11-12-private-feedback-design.md`

## Global constraints

- Preserve current gameplay, Korean UI and both deployment URLs. No dependencies unless existing packages cannot serve the need.
- Never commit owner email, credentials, runtime data or builds. Authorize every admin operation, failing closed.
- Shared types: `FeedbackCategory = 'bug'|'idea'|'other'`, `FeedbackStatus = 'new'|'reviewed'`, `FeedbackContext = {mode:'solo'|'multi';floor:'office'|'roof'}`.
- Submission: `{requestId:string,category:FeedbackCategory,message:string,context:FeedbackContext}`. Response `{ok:true}` only.
- Record: `{id:number,category,message,mode,floor,status,createdAt:number,reviewedAt:number|null}`.
- List: `{items:FeedbackRecord[],nextCursor:number|null,counts:{new:number,reviewed:number}}`; GET `/api/admin/feedback?status=all|new|reviewed&before=<id>` (optional cursor); PATCH same route `{id,status}` returns `{ok:true}`.

## Review focus

- Anonymous/other-user/spoofed-identity access never reveals feedback; admin origin and no-store protections remain separate from public CORS.
- Timeout retry and rapid double submission create one row; invalid input and oversized bodies never persist.
- Closing/reopening or failed submission retains the draft, and keyboard actions cannot move/hit behind the dialog.
- Empty/long/multiline hostile-looking text stays legible and inert; responsive controls remain reachable.
- Schema addition does not expire/delete feedback with game rooms, and no owner configuration appears in static assets.

## Task 1: Storage and HTTP boundary

Files: new `game/feedback-types.ts`, `lib/feedback.ts`, `lib/feedback-auth.ts`, `lib/feedback-http.ts`, their meaningful tests, `app/api/feedback/route.ts`, `app/api/admin/feedback/route.ts`; modify `db/schema.ts`, append generated migrations, `cloudflare-env.d.ts`.

- [ ] Write failing real-SQLite tests for acceptance, privacy, validation, retry, rate limit, owner authorization, paging and status changes.
- [ ] Implement contract above, public exact-origin CORS, admin same-origin checks and private no-store responses. Public endpoint POST/OPTIONS only; admin GET/PATCH only.
- [ ] Export `isFeedbackAdmin(user:{userId:string;email:string}|null, configuredEmail:string|undefined):boolean` for the protected page. API resolves user through existing `getChatGPTUser()`; never accept identity in request JSON.
- [ ] Generate and inspect append-only Drizzle migration; run focused tests and typecheck.

## Task 2: Player dialog and URL wiring

Files: new `game/feedback-client.ts` and tests, `components/feedback-dialog.tsx` and CSS; modify three game/lobby headers plus input guards, `game/hosting.ts`, hosting tests, `vite.pages.config.ts`.

- [ ] Write meaningful client/URL tests for cookie-free Pages submission, retry identifier and error behavior.
- [ ] Add `feedbackEndpoint()` and `feedbackAdminUrl()` preserving Sites same-origin defaults; Pages pins the existing Sites backend's `/api/feedback` and `/admin/feedback`.
- [ ] Implement spec's accessible dialog and integrate pause/input guards in solo and multi. Reuse installed Radix dialog primitives.
- [ ] Run focused tests/typecheck; root performs browser QA after integration.

## Task 3: Administrator page

Files: `app/admin/feedback/page.tsx`, `components/feedback-admin.tsx`, `components/feedback-admin.css`; documentation/runtime configuration owned by root.

- [ ] Gate dynamic page with `getChatGPTUser` and `isFeedbackAdmin` using the secret runtime allowlist; render login/forbidden/unconfigured states without data.
- [ ] Implement inbox filtering, counts, paging, reviewed toggles and resilient loading/errors using the API contract. No public cache or static bundle data.
- [ ] Configure only the resolved owner's email as a Sites secret and add usage/release documentation.

## Task 4: Integration and release

- [ ] Review complete changes independently; resolve material findings.
- [ ] Run typecheck, complete test suite, both production builds and appropriate local UI QA.
- [ ] Publish matching source/archives; follow Pages workflow; test public submission and denied private access, then owner review when authenticated browser is available.
- [ ] Leave current main synchronized and report player/admin URLs and any verification limit.
