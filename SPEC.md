# Meet & Eat — Spec

A group scheduling + food-decision tool. An admin creates a session for a
planned meetup, shares a link, and everyone (admin included) marks their
availability on a calendar-style grid and ranks food/activity options they'd
like. The admin finalizes the plan once there's enough input.

No user accounts anywhere in this app — identity is name + PIN, scoped per
session.

## Theme

Colors: `#8B0909` `#B20808` `#EDD9CC` `#B8A597` `#806350`
Visual language: `minimal-ui` skill (clean editorial, warm monochrome, flat,
no gradients/heavy shadows).

## Stack

- Next.js (latest, App Router) + TypeScript + Tailwind CSS
- Drizzle ORM + Vercel Postgres (Neon)
- dnd-kit (drag interactions for activity ranking; the availability grid uses
  plain pointer-drag painting, not a DnD library)
- Motion (formerly Framer Motion) for transitions/animations
- Pexels API for stock-photo fallback
- Longdo Map for location pins (API key provided later)
- Deployed on Vercel

## Roles & identity

### Admin

- Created a session → gets a secret admin URL
  (`/s/<sessionId>/admin/<adminToken>`), separate from the public share link
  (`/s/<sessionId>`). Anyone holding the admin link has full admin rights.
  Persisted to that browser's localStorage too.
- The admin **also joins as a regular participant** (their own name + PIN),
  so their own availability and activity ranking count toward the group
  aggregate like anyone else's, on top of their moderator powers.
- **Admin is god** — can, at any time (not just at session creation):
  - Edit session settings: date range, daily time window, room cap,
    anonymous-mode toggle
  - Edit or remove any participant
  - View and reset any participant's PIN (PINs are stored in
    plaintext/reversible, not hashed — admin can literally see the value)
  - Directly edit any participant's availability blocks or activity ranking
  - Add/edit/remove activity pool entries
  - Finalize the session (lock in date/time/activity) or reopen it
  - Delete the session outright

### Participant

- No accounts. First time a name is recognized on a device, it must be
  paired with a self-chosen **4-digit PIN**.
- **Join logic** (when a device has no local record for this session):
  1. Type a name.
  2. If the name does **not** already exist among this session's
     participants:
     - If the room is under its cap → create a new participant with this
       name, prompt to set a 4-digit PIN, and remember on this device
       (localStorage).
     - If the room is at cap → reject ("session full").
  3. If the name **does already exist** (regardless of cap status):
     - Prompt for that name's PIN.
     - Correct PIN → log in as that existing participant on this device
       (this is how switching devices/browsers works — local storage alone
       doesn't survive a device change, hence the PIN).
     - Wrong/missing PIN → rejected; must pick a different name.
  - **The room cap only blocks brand-new names.** A returning name+PIN
    always regains its seat, even past capacity.
- Devices that do have a local record for this session skip all of the
  above and are auto-recognized.

### Anonymous mode

- Admin-toggleable in real time (affects the session immediately, no
  reload required, via the polling refresh).
- When ON: other participants see generic labels ("Guest 1," "Guest 2",
  stable per participant for the session) instead of real names on the
  availability heatmap and activity rankings.
- The **admin's own view always shows real names**, regardless of the
  toggle — they need real identity to moderate (kick, reset PINs, etc.).

## Scheduling (availability)

- Admin sets, at session creation (editable later): an overall date range
  (e.g. Sept 10–20) and a daily time window (e.g. 09:00–23:00).
- Participants see a continuous calendar grid (days × time-of-day) bounded
  by that range/window and **drag-select 30-minute blocks** to mark
  themselves free. Binary state only (free / not marked) — no "maybe" tier.
- The grid aggregates everyone's picks into an overlap heatmap (how many
  people are free in each 30-min block).

## Activities ("what to eat")

- A shared pool of options per session. **Both admin and any participant**
  can add an entry: name, optional location (for the map), optional image.
- Each participant **drags to build their own personal ranked list**
  (1st choice, 2nd choice, ...) pulled from the shared pool — a
  drag-to-reorder single list, not a multi-column board.
- The session aggregates everyone's rankings into a group-level ranking
  (e.g. Borda-count style scoring from each person's rank positions).

### Activity images

Image field workflow, in priority order:
1. If a direct image URL is pasted, use it as-is.
2. Else if a webpage URL is pasted (restaurant site / Facebook page), the
   server fetches that page server-side and extracts its `og:image` meta
   tag.
3. If neither yields an image, fall back to a generic stock photo from the
   Pexels API, keyed by a cuisine/activity tag.

No scraping of Google/Facebook search results — only a direct fetch of a
URL the user explicitly supplied (ToS-safe, low-maintenance).

## Map & transit

- Each activity with a location renders as a pin on a Longdo Map.
- A "Get there" button deep-links out to Google Maps / Apple Maps
  (transit mode, destination pre-filled) for real Bangkok public-transit
  directions (BTS/MRT/bus) from the user's current location. No in-house
  routing engine.

## Finalizing

- Admin manually finalizes: picks the actual date, start time, end time,
  and one activity (typically the best-overlap slot + top-ranked activity,
  but can override with anything).
- This locks the session read-only and everyone who opens the link sees a
  "Final Plan" screen: date/time, activity name, map pin, transit link.
- Admin can reopen (unlock) the session if plans change.

## Live updates

Polling (~3–4s interval) while a session page is open. No websockets/
realtime service.

## Data lifecycle

- Vercel Postgres (Neon) holds all relational data (sessions, participants,
  availability blocks, activities, rankings).
- A scheduled cleanup job auto-expires (deletes) a session and all its
  related data 90 days after the session's date range ends.

## Room size cap

- Admin sets a max participant count at session creation (editable later).
- Enforced against new (never-seen) names only, per the join logic above.

## Still needed before/at launch

- Longdo Map API key (to be provided by the user)
- A free Pexels API key (user needs to sign up)
