# Board 1.0 — release verification

Released 7 November 2026 (New Zealand time).

Live application: https://board.fiercespeed.nz

Practice board: https://board.fiercespeed.nz/demo

## Teams, account emails and MCP update — 7 November 2026

- Connected the custom domain, Google OAuth callback and account email action links. Published the Board product page at https://fiercespeed.nz/board.html with signup, login, demo and MCP links.
- Added editable meeting dates and board groups, group filtering, whole-team assignment and a selectable teammate list for private sharing.
- Added four larger resize handles and keyboard resizing for shapes and other resizable objects. Locked objects must be unlocked before moving or resizing.
- Routed branded verification and password-reset emails through Chronological's existing queue and Resend delivery, with rate limits and generic password-reset responses.
- Added an OAuth/PKCE MCP server with 22 tools, explicit client consent, revocation, current membership checks, private voting and CSV/JSON action exports. Added Download actions (CSV) to the web app.

Validation: Board production build and formatting passed; four unit tests and 12 Security Rules tests passed. Chronological's 766 unit tests and 513 full emulator tests passed, followed by six targeted MCP/email emulator tests. The live MCP flow discovered all 22 tools and created a disposable board, applied a template, created an action and exported CSV. Real verification and reset emails reached the provider's documented test inboxes; temporary identities and mail records were removed. The static marketing checker passed all 24 HTML pages. Browser checks covered date/group editing, team selection and shape resizing; individual third-party MCP clients have not all been tested.

## Interaction fixes — 7 November 2026

- Fixed double-clicking notes creating another note. Pointer capture now stays on the clicked object, so the browser routes its double-click to the editor instead of the canvas background. Double-clicking inside an open editor preserves the draft and selects words normally.
- Practice boards now start fresh on refresh; notes, votes, actions, agenda and timer state are kept only for the current demo session. Updated the demo labels to make this clear.
- The visual timer now clears clockwise from twelve o'clock, leaving the shrinking red area ahead of the moving boundary.
- Hosting responses now require cache revalidation. Previously the default one-hour HTML cache could keep an already-open browser on an older release; existing cached pages may need one hard refresh.

Browser regression checks: existing note opens with unchanged object count; empty-space double-click adds exactly one focused note; double-clicking its empty placeholder opens that same note; word selection preserves an unsaved draft; dragging and panning remain usable; refreshing after editing notes and a one-minute timer restores six sample notes and the idle ten-minute Reflect stage. The countdown's cleared angle increased clockwise and the red remainder was visually checked.

## Delivered

React/TypeScript application on Firebase Hosting, backed by Firestore and Firebase Authentication. Google, email/password and anonymous guest providers are enabled. The database is in Sydney. The project remains on its existing Spark plan; no paid plan upgrade was performed.

Features include shared sticky notes, text, shapes, pen/marker strokes, cursors, pan/zoom/fit, object editing and local undo/redo; three retrospective templates and blank canvas; saved layouts; stage-based visual/digital timers with optional auto-advance; configurable hidden or visible voting; ranked results; assigned actions; JSON/text exports; private email/team access and time-limited public editing.

## Verification evidence

| Check | Result |
| --- | --- |
| TypeScript and production Vite build | Passed. One advisory about the Firestore SDK chunk exceeding 500 kB uncompressed; gzip approximately 139 kB. |
| Domain and Firestore emulator suite | 14 tests passed, 0 failed, 0 skipped with the emulator running. Covers timer math, votes, zoom, authorization, locked frames, restoring deleted notes, sharing expiry, verified team membership/revocation, hidden ballots, vote limits, template ownership and trusted presence timestamps. |
| Live Firebase SDK checks | 8 passed. Independent guest received an edit; outsider/private access was denied; hidden ballots stayed private; concurrent vote transactions could not exceed the budget; reveal froze voting; expired links denied reads/writes. Disposable records and identities were removed. |
| Postman hosted smoke collection | 2 requests and 5 assertions passed: app HTTP 200, expected HTML, nosniff header, unauthenticated Firestore enumeration HTTP 403, no board contents returned. |
| Dependency audit | 0 known vulnerabilities after the gRPC transitive override. |
| Hosted browser account flows | Email sign-in, private board creation from a built-in template, three-hour public access, immediate closure, saving/reusing a layout, team creation and member addition exercised with a disposable QA account. |
| Browser meeting tools | Configured stage name/duration/display, start/pause, automatic next stage while Actions tab was open, hidden vote allocation and reveal, ranked results, action creation/completion, note editing, undo/redo, dragging, drawing and drawing undo. |
| Responsive UI | Desktop 1440×900 and phone 390×844 checked. Phone page has no horizontal document overflow; meeting panel and tools remain available. Physical touch-device testing was not performed. |
| Google OAuth | Provider enabled, client configured, and hosted app successfully opens Google's account chooser. Final account selection could not be completed through the browser automation popup, so an end-to-end Google login remains unverified. Email sign-in was verified end to end. |

The installed Postman CLI does not support `postman status`. The collection ran locally without a Postman login, using `--no-report-events`. Cloud reporting and the account-only `--output` export were not used.

## Operating limits

- Designed for retrospective-sized boards: the UI limits the canvas and voting target snapshot to 400 objects. This is not a load-tested enterprise whiteboard service.
- Timer countdown uses shared timestamps calibrated against a Firestore server timestamp. Automatic stage transitions require the facilitator's board to remain connected; background browser throttling can delay a transition.
- Concurrent edits of the same text/geometry field use last-write-wins. Undo history is local to the current tab. Recreating a deleted object attributes its restoration to the restoring participant.
- Public guests are anonymous browser identities. Opening another browser can provide another identity and vote budget. Use private, verified accounts where stronger participant identity matters.
- Public expiry is enforced by server rules and clears the guest UI. It cannot retract previously copied content. Owners and private members retain their authorized access.
- Saved templates belong to their creator. Team membership grants access to team boards; template sharing across an entire organization is a future extension.
- The app does not send invitation emails automatically. Add a verified member email and share the board link directly.
- Video conferencing, uploads, enterprise SSO, and multi-touch pinch zoom are outside this release. Mobile has pan and zoom buttons. AI clients can integrate through MCP.

## Repeatable checks

`npm ci`, `npm run build`, `npm run format:check`, and `npm test` run local checks. For the complete authorization suite, install Java 21 and Firebase CLI and run `npm run test:rules`. A GitHub Actions workflow runs the build and emulator checks on pushes and pull requests.

`node tools/live-check.mjs` exercises the deployed backend using the supplied external service account, then cleans up its own records. `node tools/admin.mjs ui-setup` and `ui-cleanup` support disposable browser QA and require the Firebase CLI owner login. These tools contain machine-specific credential locations; update those paths for another development machine. The admin key itself is not in the repository or website.

`postman collection run postman/collections/board-smoke.postman_collection.json --no-report-events` repeats the read-only hosting/access checks.
