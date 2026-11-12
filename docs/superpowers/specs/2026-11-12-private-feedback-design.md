# Private suggestion inbox

The user wants players to submit difficulties and improvement ideas, visible only to the administrator. Keep the existing Korean game and public, anonymous solo/multiplayer access.

## Approach

Use the existing Sites D1 backend for anonymous submissions and a Sites-hosted administrator page protected by the existing ChatGPT identity integration plus a server-only owner email allowlist. The current Site owner is resolved through the Sites connector; configure that email as a runtime secret, never in source. GitHub Pages remains the player URL. A public GitHub issue board would expose feedback; a new password/OAuth stack adds account management without improving this owner's workflow.

## Player experience

- A consistent `건의함` button in solo, multiplayer, and the multiplayer lobby opens a focused dialog.
- Categories: `불편한 점` (bug), `개선 제안` (idea), `기타` (other); message 1–2000 Unicode code points, allowing newlines. No name/contact details required.
- Explain that only the administrator reads submissions. Include only selected category, message, and the current mode/floor; never chat, To Dos, room codes/tokens, or raw IPs.
- Preserve the draft on network/validation failure and on dialog close. Clear after confirmed success. Reuse a cryptographic request ID when retrying the same submission.
- Pause/block game controls while the dialog is open, trap focus, support Escape, and preserve mobile usability. Link `관리자 확인` to the protected inbox.

## Administrator experience and authorization

- `/admin/feedback` on Sites uses the normal top-level ChatGPT sign-in link. No ChatGPT login is required for players.
- Require a nonempty authenticated user ID and an email matching `FEEDBACK_ADMIN_EMAIL`, case-insensitively; reject missing config, anonymous callers and other accounts. Check every read and mutation server-side.
- Show newest submissions with category, mode/floor, date and full message. Filter all/new/reviewed, paginate 30 at a time, refresh, and mark reviewed or restore to new. No deletion, replies, attachments, or email notifications in this version.
- Admin API accepts only same-origin browser traffic, grants no cross-origin reads, and uses private no-store caching. Render user text safely as text.

## Data and abuse controls

An independent `office_feedback` table stores UUID request ID, message, category, mode, floor, status, creation/review timestamps. Feedback survives room expiry. Submit responses contain confirmation only. Use parameterized SQL, a 12 KiB streamed body cap, exact-origin public-submit CORS and rate limits of 10 accepted attempts per 10 minutes per daily-hashed trusted IP. Duplicate request IDs do not create duplicate records.

## Verification and release

Exercise real SQLite migrations, validation, idempotency, rate limits, pagination and unauthorized reads/mutations. Build/test both targets; browser-test submit flows and authenticated/anonymous administrator boundaries, including forged identity headers at production dispatch. Deploy the same commit to Sites and GitHub Pages. Preserve existing runtime secrets and records.
