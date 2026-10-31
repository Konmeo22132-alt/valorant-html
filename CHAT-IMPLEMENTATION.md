# Room chat — deployed

The user authorized deployment with “deloy đi” on 2026-10-16, lifting the earlier
hold while they were playing. Published release: **v42-20261016-213626**.
The selective uploader verified all 13 changed files (12 runtime files plus
preload-manifest.json), preserved SQLite, and confirmed service health v42 OK.

## Behavior

- T opens room chat in the lobby, agent selection, loading and multiplayer game;
  new drafts default to Team where available. Enter opens Team directly.
- Shift+Enter or Shift+T opens All. While composing, Shift+Enter selects All
  without sending. Enter sends and Escape closes.
- The input has explicit Team/All buttons, audience labels and message prefixes.
  `/team` and `/all` followed by a space switch channel and remove the command;
  entering either command alone switches channel without sending a message.
- Team is available for players in teams a/b, including dead players. Deathmatch
  and observers use All. All goes to every participant in the current room.
- Chat does not pause the online match. Movement, aim, shots, abilities and other
  gameplay shortcuts are blocked locally while composing. Opening chat clears
  held inputs, scoreboard, ping wheel and cursor menus.
- Vietnamese input composition is respected; Enter during composition does not
  send. Failed messages remain available as a draft when chat is reopened.
- Recent messages fade during gameplay; opening chat exposes the scrollable log.
- SQLite stores messages with a unique room-instance key. The last 60 authorized
  messages are sent on join/resume. Team messages have a persisted recipient list
  captured at send time: only the sender's teammates at that time can receive
  the live message or its history. Later team changes/joining do not grant access
  to the other team's earlier private messages. Previously received messages
  remain readable by their original recipients.
- Sender identity and room recipients are set by the authenticated server.
  Rendering uses textContent. Messages are limited to 280 UTF-16 code units,
  stripped of control characters, and rate limited (burst 4, refill 1/second).
- A client message UUID makes retrying a timed-out send idempotent in SQLite.
  Chat has its own socket messages, outside movement snapshots and event queues.
- Local bot/practice games have no network room and do not expose room chat.

## Files for the eventual release

`tools/.artifacts/pending-chat-release-files.json` contains the 12 paths. Use the
existing selective uploader after the user authorizes deployment; it will also
refresh preload-manifest.json. New SQLite tables/indexes are created on the next
server startup using CREATE TABLE/INDEX IF NOT EXISTS.

Syntax parsing passed for all nine changed JavaScript files (`node --check`).
No functional or browser tests were run for this request. The authorized deploy
uploaded the chat release, restarted the service, and initialized the SQLite
chat tables through the existing startup migration.

## Research

Riot documents separate All/Team/Party text channels in its official patch notes:
https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-1-0/

Riot's FFA Deathmatch guide explicitly describes the mode as having no teams:
https://support.riotgames.com/en-us/valorant/gameplay/valorant-game-mode-ffa-deathmatch

The implementation follows the PC convention Enter/Shift+Enter and /team,/all,
and preserves the user's requested T shortcut. The official pages above confirm
the channel model and FFA rules; they do not document the exact PC chat bindings.
Tab is retained for accessible focus traversal inside this UI. No party or
whisper channel is implemented in this release.

## Separately paused Haven quality work

The unfinished rendering changes are saved in
`tools/.artifacts/pending-haven-quality/` (engine.js, map-streamer.js,
performance.json, map-presentation.js). They are not included in this chat
release. The active game rendering configuration was restored to the deployed
baseline so the pending chat build does not depend on that unfinished module.
Those rendering changes still need visual review before any publication.
