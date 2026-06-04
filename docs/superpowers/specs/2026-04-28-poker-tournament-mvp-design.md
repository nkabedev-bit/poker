# Poker Tournament Timer MVP Design

Date: 2026-04-28
Status: Draft approved for review

## Goal

Build an MVP web application for running a live poker tournament over the internet.
The organizer controls tournament settings and the blind timer from an admin panel.
Players and spectators open a public screen link and see the tournament state update in real time.

The visual design should closely match the provided screenshots: dark poker-room interface, gold accents, tabbed admin navigation, thin bordered panels, a large public timer, a side blind-level table, and a red/gold tournament atmosphere on the public screen.

## MVP Scope

The MVP supports one active tournament.

Included:

- Admin login.
- One active tournament settings page.
- Tournament name and logo.
- Starting stack.
- Registration duration and registration status.
- Blind structure editor with levels and breaks.
- Ready-made blind templates such as Turbo, Standard, and Deep Stack.
- Timer controls: start, pause, resume, previous level, next level, close registration, finish tournament.
- Public screen opened by a secret view-only link.
- Real-time updates from admin panel to public screen.
- Public screen display with tournament name, logo, registration/break status, timer, current blinds, next blinds, ante, progress, and blind level list.

Not included in MVP:

- Player management.
- Tables and seating.
- Auto-balancing.
- Prize places and bonus configuration.
- PTS rating.
- Leaderboard.
- Telegram bot integration.
- Import and export.
- Multiple saved tournaments or tournament history.

## Product Shape

The admin panel is optimized for the organizer during a live event. After login, the organizer lands directly in the single active tournament instead of choosing from a tournament list.

Admin sections:

- Settings: tournament name, logo, starting stack, registration duration, public link actions.
- Blinds: level list, SB, BB, ante, duration, breaks, presets, add/remove/reorder levels.
- Timer: large timer control surface, current level, next level, registration control, finish action.
- Public screen: open and copy the secret public display link.

The public screen is optimized for a TV or projector. It should be readable at distance and should not expose admin controls.

Public screen elements:

- Tournament logo area.
- Tournament name.
- Registration or break status.
- Large countdown timer.
- Progress bar for the current level.
- Current blind values.
- Next blind values.
- Ante when present.
- Side table of all blind levels with current level highlighted.

## Technical Architecture

Recommended stack:

- Next.js for the web application.
- Supabase Auth for organizer login.
- Supabase Postgres for tournament data.
- Supabase Realtime for pushing state changes to public screens.
- Supabase Storage for the tournament logo.
- Vercel or similar hosting for internet access.

The admin panel and public screen live in the same app. Admin routes require authentication. Public screen routes do not require login, but require an unguessable public token.

Suggested routes:

- `/login`
- `/admin`
- `/admin/settings`
- `/admin/blinds`
- `/admin/timer`
- `/screen/[publicToken]`

## Data Model

### tournament

Stores the single active tournament.

Fields:

- `id`
- `name`
- `logo_url`
- `starting_stack`
- `registration_minutes`
- `registration_status`
- `public_token`
- `created_at`
- `updated_at`

### blind_levels

Stores the blind structure.

Fields:

- `id`
- `tournament_id`
- `level_order`
- `small_blind`
- `big_blind`
- `ante`
- `duration_seconds`
- `is_break`
- `break_duration_seconds`
- `created_at`
- `updated_at`

### timer_state

Stores timer state without writing every second to the database.

Fields:

- `id`
- `tournament_id`
- `status`
- `current_level_index`
- `level_started_at`
- `paused_remaining_seconds`
- `registration_closes_at`
- `finished_at`
- `updated_at`

Allowed `status` values:

- `not_started`
- `running`
- `paused`
- `break`
- `finished`

## Timer Behavior

The database stores timer state and control events, not each countdown tick.

When the timer is running:

- `level_started_at` stores when the current level began.
- The public screen calculates remaining seconds locally from the level duration and start time.
- Supabase Realtime notifies clients when admin actions change the state.

When paused:

- The app stores `paused_remaining_seconds`.
- Public screens stop local countdown and show the paused state.

When resumed:

- The app sets a new `level_started_at` based on the paused remaining time.
- Public screens resume local countdown.

When moving to another level:

- `current_level_index` changes.
- `level_started_at` resets.
- Public screens update the highlighted blind level and current/next values.

Registration countdown:

- `registration_closes_at` is set when the timer starts or when the organizer explicitly configures registration.
- Admin can close registration manually.
- Public screen shows registration open/closed status and remaining time when open.

## Sync and Resilience

Public screens subscribe to tournament, blind level, and timer state changes through Supabase Realtime.

If Realtime briefly disconnects:

- The public screen keeps counting locally from the last known timer state.
- On reconnect, it fetches the current state from the database and corrects itself.
- A lightweight polling fallback can refresh state every few seconds.

Security:

- Admin reads and writes require Supabase Auth.
- Public screen can read only the tournament state associated with a valid `public_token`.
- Public screen cannot update tournament data.
- The public token should be long, random, and regenerated if needed.

## UI Direction

The UI should follow the screenshots closely.

Admin style:

- Dark navy/black background.
- Top header with tournament/club name.
- Gold active tab underline.
- Gold primary buttons, green success buttons, red destructive buttons.
- Compact form controls with subtle borders.
- Panels with low-contrast outlines.
- Tabs similar to Settings, Players, Tables, Timer, Rating, Leaderboard, but MVP only implements the relevant sections.

Public screen style:

- Dark tournament board layout.
- Gold title and accents.
- Very large center timer.
- Left blind-level table.
- Current level highlighted in gold.
- Center panel for current and next blinds.
- Status chips for registration, break, pause, and running state.

## Validation Scenarios

The MVP is considered working when these scenarios pass:

- Organizer can log in.
- Organizer can edit tournament name and logo.
- Organizer can edit blind levels, antes, durations, and breaks.
- Organizer can apply a blind structure preset.
- Public screen opens through a secret link without login.
- Public screen does not expose admin actions.
- Starting the timer in admin updates the public screen.
- Pausing and resuming the timer updates the public screen.
- Moving to next or previous level updates current and next blinds.
- Closing registration updates the public screen.
- Public screen keeps counting locally between server events.
- Public screen recovers after a brief connection interruption by fetching current state.

## Implementation Notes

Build the MVP in small slices:

1. Scaffold Next.js and Supabase connection.
2. Add authentication and protected admin shell.
3. Create database schema and seed one active tournament.
4. Build settings and blind editor.
5. Build timer state logic.
6. Build public screen route by token.
7. Add Supabase Realtime subscriptions and fallback refresh.
8. Polish UI to match the screenshots.
9. Verify the live admin-to-public-screen scenarios.

This document intentionally keeps player, table, prize, rating, leaderboard, Telegram, import, export, and multi-tournament features outside the first implementation.
