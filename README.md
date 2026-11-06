# Board

A focused, collaborative retrospective workspace, built with React, TypeScript and Firebase.

Live: [board-4500b.web.app](https://board-4500b.web.app) · [Practice board](https://board-4500b.web.app/demo)

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

Firebase Hosting serves the SPA. Firestore Standard and Firebase Authentication provide the backend without a paid Cloud Functions dependency. Keep Firestore in the chosen region and use the console for usage budgets and operational monitoring. Security rules and indexes live in this repository. Google OAuth requires an enabled Google provider and a valid project OAuth client.

The deployed project uses Sydney (`australia-southeast1`), with Google, email/password and anonymous sign-in enabled. Hosting domains and localhost are authorized. Deploy with `npm run build`, then `firebase deploy --only hosting,firestore --project board-4500b`. Review [release verification and limits](docs/release-notes.md) before a larger rollout.
