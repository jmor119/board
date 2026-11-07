# Board

A focused, collaborative retrospective workspace, built with React, TypeScript and Firebase.

Live: [board.fiercespeed.nz](https://board.fiercespeed.nz) · [Practice board](https://board.fiercespeed.nz/demo) · [Connect an AI client](https://board.fiercespeed.nz/integrations)

## Product scope

See [the functional specification](docs/functional-specification.md) for the Miro review, workflows, access model and acceptance criteria. The app is intentionally focused on team retrospectives rather than reproducing every Miro integration.

## Development

```
npm install
npm run dev
npm run build
npm test
```

Firebase web configuration is public client configuration in `src/firebase-config.json`. Administrative service-account keys must never be copied into this checkout or shipped to a browser. Administrative scripts read the supplied key from its external location or use the Firebase CLI's signed-in owner account.

Use Node 22 or newer. `npm test` runs the unit suite and skips the Security Rules suite unless `FIRESTORE_EMULATOR_HOST` is set. With Java 21 and Firebase CLI installed, `npm run test:rules` starts an isolated Firestore emulator and runs the authorization tests. CI runs both suites.

## Architecture

Firestore listeners synchronize individual board objects, meeting state, ballots and participant presence. Object edits update only changed fields. Drawing strokes are separate objects. Security Rules authorize every read/write, enforce public-link expiry using server time, protect locked template elements, and validate voting budgets. Hidden ballots are readable only by their author until the facilitator reveals results. No trusted operation depends on hiding a control in the UI.

Private workspaces use verified account emails. Guest access uses Firebase anonymous authentication, so visitors do not need an account or a login prompt. Guest identity persists in that browser; it is not a guarantee of one physical person per ballot. Private meetings provide stronger participant identity.

Local browser memory is used for Firestore caching (no persistent offline database). A public-link expiry denies new server operations and clears the open guest UI; no sharing system can retract data a visitor has already seen or copied.

## Operations

Firebase Hosting serves the SPA. Firestore Standard and Firebase Authentication store Board data and identities. Branded account emails and the MCP server run in the existing Chronological Cloud Functions project, using its mail queue and Resend delivery. Board's project has not been upgraded to a paid plan; these shared functions use Chronological's existing billing. Keep Firestore in the chosen region and use the console for usage budgets and operational monitoring. Security rules and indexes live in this repository. Google OAuth requires an enabled Google provider and a valid project OAuth client.

The deployed project uses Sydney (`australia-southeast1`), with Google, email/password and anonymous sign-in enabled. Hosting domains and localhost are authorized. Deploy with `npm run build`, then `firebase deploy --only hosting,firestore --project board-4500b`. Review [release verification and limits](docs/release-notes.md) before a larger rollout.

Google sign-in and account email action links use `board.fiercespeed.nz`. The OAuth web client must include that origin and `https://board.fiercespeed.nz/__/auth/handler`. Account verification and password resets go through `boardAccountEmail`, then the shared mail queue. Team owners use `boardTeamInvites` to send or resend branded invitations. Direct private-board additions still require sharing the board link.

Under Your team, owners and assigned admins can see each member's account connection status and separate invitation delivery status. Connected means an enabled, verified Board account can access the team; it does not indicate online presence or whether an email was read. Legacy memberships have no delivery record and show No invitation email sent until a manager chooses Send invite. Adding a new teammate sends an invitation; delivery failures keep membership intact and allow retry. Resends have a one-minute cooldown and daily limits. The mail processor rechecks current management rights and membership before delivery. Delivery history is retained separately from the expiring mail queue. Invitation links open the matching team after sign-in; they never grant access by themselves.

Owners can assign **Member** or **Admin** beside each teammate under Your team. Admins with a verified member email can add/remove ordinary members, view invitation status and send/resend invites for that team. Owners control role assignments; admins cannot remove other admins, change ownership or manage a different team without a separate appointment. Demotion takes effect on the next server operation and cancels pending invitation emails from the former admin. Roles use optional `adminEmails` on the existing team document, so older teams work without a migration. Membership updates use atomic array operations so simultaneous administrators do not overwrite one another's additions. Board facilitation and board-owner controls remain separate from team member management.

## AI clients and action downloads

Open [Connect with MCP](https://board.fiercespeed.nz/integrations) for setup and connection revocation. Compatible clients need remote Streamable HTTP, OAuth and PKCE support. Use this server URL:

```text
https://australia-southeast1-chronological-9f536.cloudfunctions.net/boardMcp/mcp
```

The 22 tools cover board creation and editing, notes/shapes/drawings, built-in and saved templates, teams and board access, meeting agendas and timers, voting, and actions. `export_actions` returns CSV or JSON as an MCP resource. The board's Actions panel also has a Download actions (CSV) button. CSV exports escape spreadsheet formulas.

Users sign in with a verified Board account and approve the client. Each tool rechecks current board/team membership; owners control sharing and facilitation. Public guest links do not grant MCP access, and hidden ballots remain private until revealed. Connections can be revoked from the integrations page. Client support varies; the live protocol flow is tested, but every third-party client has not been certified.

The backend source and unit/emulator tests live in the sibling `Chronological/functions/src/board_mcp` and `Chronological/functions/src/mail` directories. Its runtime service account has project-scoped Board user-email and Firestore roles; keys are not shipped to clients. Backend changes require a separate targeted deployment in the Chronological project.
