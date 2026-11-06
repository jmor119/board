# Board — retrospective product specification

## Purpose

Run a complete team retrospective in one shared whiteboard: check in, reflect, group ideas, vote, discuss and agree actions. The first release must support the actual meeting, including external visitors who join without creating an account.

## Miro review

Reviewed 7 November 2026 against Miro's own help centre:

- [Workshops and meetings](https://help.miro.com/hc/en-us/articles/360012753200-Miro-for-workshops-meetings): reusable templates, locking, timer and voting form the meeting toolkit.
- [Voting](https://help.miro.com/hc/en-us/articles/360017572274-Voting): facilitator defines vote allocation, participants add/remove votes, results rank discussion topics. Board adds a choice of hidden or visible live ballots.
- [Sharing](https://help.miro.com/hc/en-us/articles/360017730813-Sharing-boards-and-inviting-collaborators): distinguish signed-in members from public visitors. Board adds an explicit expiring meeting window.
- [Collaboration controls](https://help.miro.com/hc/en-us/articles/4402396215698-Collaboration-tools): the facilitator controls meeting settings while participants contribute.

## Required functionality and acceptance criteria

| Area | Required behaviour | Acceptance |
| --- | --- | --- |
| Identity | Google sign-in; email/password fallback; anonymous guests | Accounts can create private boards. Public guests can enter a display name and participate without a login screen. |
| Workspace | Personal boards and named teams; member management | A verified invited email can open team boards. Removing a member revokes future access. Only owners manage membership. |
| Canvas | Pan, zoom, fit, sticky notes, text, rectangle shapes, pen/marker strokes | Add/edit/move/resize objects; color notes; delete/duplicate; local undo/redo. Touch panning and tools supported. |
| Collaboration | Shared objects, live cursors, participant names, save state | Independent browser sessions receive edits and movements. Stale presence disappears. Errors and reconnecting states are visible. |
| Templates | Start / Stop / Continue, Went well / Improve / Try, 4Ls, blank | Reusable locked frames; participants add notes without moving the layout. Save a custom layout and create new boards from it. |
| Agenda | Ordered stages, editable names and durations | Facilitator configures individual stage lengths, starts/pauses/resets timer and advances stages. Changes are shared. |
| Timer | Red Time Timer-style visual disk and digital display | Remaining red area shrinks, digital count agrees, pause/resume survives reload. Everyone sees the same stage. Optional auto-advance. |
| Voting | Votes per participant, optional one per item, hidden/visible mode | Budget checked by server rules. Participants can retract votes. Hidden ballots cannot be read by other participants or host before reveal. |
| Results | Ranked issues after voting, discussion and actions | Facilitator reveals/closes round; results focus a selected issue; actions have owner, due date and completion. |
| Public sharing | Off by default, time-limited link (3 hours default), revoke immediately | Server rejects requests after expiry, even for a guest already in the meeting. New link windows require deliberate owner action. |
| Private sharing | Authenticated owner, directly invited verified email, or team membership | Knowing a board URL alone grants no private access. Guest identities cannot become private members. |
| Persistence | Durable boards, templates, meeting stages and actions | Reload preserves board and session state. Board list shows owned and invited boards. |
| Export | Download board JSON and meeting notes | Export includes content, agenda and actions; hidden votes remain protected. |
| Usability | Accessible controls, shortcuts, responsive layout | Tools have labels; dialogs have escape/close behaviour; mobile can pan and add notes. |

## Access and trust boundaries

The creator is the facilitator. Only the facilitator changes sharing, agenda, voting state and protected template objects. A participant can edit unlocked objects, create notes/strokes/actions, manage their own presence and write only their own ballot. Private boards can be shared directly to verified emails or to a team. Team owners control the email membership list. Invitations do not send email automatically; the owner shares the supplied link.

Public links are unguessable board IDs, enabled for a bounded time. Access uses Firebase anonymous authentication. Multiple devices or cleared browser data can create multiple guest identities, so guest voting is a meeting facilitation tool, not an election-grade identity system. A closed public window does not invalidate retained screenshots or exports.

## Data contract

- `boards/{boardId}`: ownerId, title, teamId, invitedEmails, publicUntil, publicEnabled, createdAt, updatedAt, agenda, timer, currentRoundId.
- `boards/{boardId}/objects/{objectId}`: type, geometry, text, color, points, locked, authorId, timestamps; independently synchronized.
- `boards/{boardId}/presence/{uid}`: display name, cursor, lastSeen; own-write only.
- `boards/{boardId}/rounds/{roundId}`: title, budget, hidden, unique, state, targetIds, createdAt; facilitator controlled.
- `boards/{boardId}/rounds/{roundId}/ballots/{uid}`: list of object IDs, size bounded by budget, targets restricted to the round snapshot; self-write only while open.
- `boards/{boardId}/actions/{actionId}`: text, owner, due, done, authorId.
- `teams/{teamId}`: ownerId, name, memberEmails; owner controls membership.
- `templates/{templateId}`: ownerId, name, objects; private reusable layouts.

Firebase Security Rules are the executable backend contract. Direct SDK calls must pass the same rules as the app; clients cannot bypass permissions by calling Firestore manually.

## Deliberate first-release limits

No video/audio conferencing, AI summaries, external integrations, image/file uploads, enterprise SSO, complex connectors, or paid plan system. Editing the same text field simultaneously uses last-write-wins; independent object changes do not replace the entire canvas. Undo is local to a participant's edits. Timer progression is driven by the connected facilitator, while the countdown itself is shared via timestamps. The canvas and voting target snapshots are bounded for meeting-sized boards.

## Verification plan

Build/type checks; deterministic timer/voting/geometry tests; direct security-rule tests for outsider access, expiry, host-only controls, hidden ballot reads and vote budgets; live Firebase smoke tests; browser exercises for creation, drawing, editing, templates, sharing, timer and voting. Record actual results and outstanding limitations in the release notes.
