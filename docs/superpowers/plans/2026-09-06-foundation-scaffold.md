# Foundation Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployed, empty-but-working Next.js app — themed, connected to a Postgres database, with a test harness — that every later subsystem plan (identity/join, scheduling grid, activities/ranking, map/transit, admin controls, finalize, data lifecycle) builds on top of.

**Architecture:** Manually scaffolded (not `create-next-app`, since the directory already contains `.git` and `SPEC.md`) Next.js App Router project using TypeScript and Tailwind CSS v4. Drizzle ORM targets Postgres in both production (Vercel Postgres/Neon via `pg`) and tests (embedded `@electric-sql/pglite`, so tests need no Docker or cloud credentials). Deployed to Vercel via the already-connected GitHub repo.

**Tech Stack:** Next.js (latest), React (latest), TypeScript, Tailwind CSS v4, Drizzle ORM, `pg`, `@electric-sql/pglite` (test-only), Vitest, Vercel.

**Spec:** [SPEC.md](../../../SPEC.md)

## Global Constraints

- Next.js latest, App Router, TypeScript, Tailwind CSS — per SPEC.md "Stack"
- Drizzle ORM + Vercel Postgres (Neon) — per SPEC.md "Stack"
- Deployed on Vercel, using the existing repo `https://github.com/blackfenzer/meet-eat.git` — per SPEC.md "Stack" and current git remote
- Theme colors, exact hex: `#8B0909` `#B20808` `#EDD9CC` `#B8A597` `#806350` — per SPEC.md "Theme"
- No user accounts/login anywhere in the app — per SPEC.md "Roles & identity"
- Package manager: npm

---

### Task 1: Manual Next.js scaffold + test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Test: `src/lib/sanity.test.ts`

**Interfaces:**
- Produces: a working `npm run dev` / `npm run build` / `npm test` toolchain that every later task relies on.

- [x] **Step 1: Create `.gitignore`**

```
node_modules
.next
.env*.local
.vercel
dist
*.tsbuildinfo
```

- [x] **Step 2: Create minimal `package.json`**

```json
{
  "name": "meet-eat",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

- [x] **Step 3: Install dependencies**

Run: `npm install next@latest react@latest react-dom@latest`
Run: `npm install -D typescript @types/react @types/node @types/react-dom vitest`

Expected: both commands exit 0 and `package.json` now lists these under `dependencies`/`devDependencies` with resolved versions.

- [x] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [x] **Step 5: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [x] **Step 6: Create `src/app/globals.css`**

```css
:root {
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}
```

- [x] **Step 7: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meet & Eat",
  description: "Plan when and where to meet up and eat.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [x] **Step 8: Create `src/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main>
      <h1>Meet &amp; Eat</h1>
    </main>
  );
}
```

- [x] **Step 9: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [x] **Step 10: Write a sanity test (`src/lib/sanity.test.ts`)**

```ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [x] **Step 11: Run the test to verify it passes**

Run: `npx vitest run`
Expected: PASS — 1 test passed.

- [x] **Step 12: Verify the app builds**

Run: `npm run build`
Expected: `Compiled successfully`, no type errors.

- [x] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts src/app vitest.config.ts .gitignore
git commit -m "chore: scaffold Next.js app with test harness"
```

---

### Task 2: Tailwind v4 theme with brand colors

**Files:**
- Modify: `package.json` (add `tailwindcss`, `@tailwindcss/postcss`)
- Create: `postcss.config.mjs`
- Modify: `src/app/globals.css`
- Modify: `src/app/page.tsx`
- Test: `src/app/globals.test.ts`

**Interfaces:**
- Consumes: `src/app/globals.css` from Task 1
- Produces: Tailwind utility classes `bg-maroon`, `bg-brick`, `bg-cream`, `bg-taupe`, `bg-umber` (and their `text-*`/`border-*` equivalents) available anywhere in the app via Tailwind v4's `@theme` color tokens.

- [x] **Step 1: Write the failing test (`src/app/globals.test.ts`)**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("theme tokens", () => {
  const css = readFileSync(new URL("./globals.css", import.meta.url), "utf-8");

  it.each([
    ["--color-maroon", "#8B0909"],
    ["--color-brick", "#B20808"],
    ["--color-cream", "#EDD9CC"],
    ["--color-taupe", "#B8A597"],
    ["--color-umber", "#806350"],
  ])("defines %s as %s", (token, hex) => {
    expect(css).toContain(`${token}: ${hex}`);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/globals.test.ts`
Expected: FAIL — `globals.css` doesn't contain the tokens yet.

- [x] **Step 3: Install Tailwind v4**

Run: `npm install tailwindcss @tailwindcss/postcss`

- [x] **Step 4: Create `postcss.config.mjs`**

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [x] **Step 5: Update `src/app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-maroon: #8B0909;
  --color-brick: #B20808;
  --color-cream: #EDD9CC;
  --color-taupe: #B8A597;
  --color-umber: #806350;
}

:root {
  color-scheme: light;
}

body {
  margin: 0;
  background-color: var(--color-cream);
  color: var(--color-maroon);
}
```

- [x] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/app/globals.test.ts`
Expected: PASS — all 5 cases pass.

- [x] **Step 7: Update `src/app/page.tsx` to render swatches (visual smoke check)**

```tsx
const swatches = [
  { name: "maroon", className: "bg-maroon" },
  { name: "brick", className: "bg-brick" },
  { name: "cream", className: "bg-cream" },
  { name: "taupe", className: "bg-taupe" },
  { name: "umber", className: "bg-umber" },
];

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Meet &amp; Eat</h1>
      <div className="mt-4 flex gap-2">
        {swatches.map((s) => (
          <div key={s.name} className="flex flex-col items-center gap-1">
            <div
              className={`h-16 w-16 rounded border border-black/10 ${s.className}`}
            />
            <span className="text-xs">{s.name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [x] **Step 8: Run the dev server and verify in browser**

Run: `npm run dev`
Open `http://localhost:3000` and confirm five distinct color swatches render in the maroon/brick/cream/taupe/umber palette, then stop the dev server.

- [x] **Step 9: Commit**

```bash
git add package.json package-lock.json postcss.config.mjs src/app/globals.css src/app/globals.test.ts src/app/page.tsx
git commit -m "feat: add Tailwind v4 theme with brand colors"
```

---

### Task 3: Drizzle ORM + `sessions` table with local test database

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `src/db/test-client.ts`
- Create: `drizzle.config.ts`
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces: `sessions` Drizzle table (`src/db/schema.ts`), `db` client for production (`src/db/client.ts`, reads `process.env.DATABASE_URL`), `createTestDb()` async helper (`src/db/test-client.ts`) returning an in-memory Drizzle instance with the schema already applied — later plans' DB tests import `createTestDb` the same way.

- [x] **Step 1: Install dependencies**

Run: `npm install drizzle-orm pg @electric-sql/pglite`
Run: `npm install -D drizzle-kit @types/pg`

- [x] **Step 2: Write the failing test (`src/db/schema.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-client";
import { sessions } from "./schema";

describe("sessions table", () => {
  it("inserts and reads back a session", async () => {
    const db = await createTestDb();
    const id = crypto.randomUUID();

    await db.insert(sessions).values({
      id,
      title: "Friday dinner",
      adminToken: "test-admin-token",
      dateRangeStart: new Date("2026-09-10"),
      dateRangeEnd: new Date("2026-09-20"),
      dailyStartMinutes: 9 * 60,
      dailyEndMinutes: 23 * 60,
      maxParticipants: 10,
    });

    const rows = await db.select().from(sessions);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Friday dinner");
    expect(rows[0].anonymousMode).toBe(false);
    expect(rows[0].status).toBe("open");
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/db/schema.test.ts`
Expected: FAIL — `./test-client` and `./schema` don't exist yet.

- [x] **Step 4: Create `src/db/schema.ts`**

```ts
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  adminToken: text("admin_token").notNull(),
  dateRangeStart: timestamp("date_range_start", { mode: "date" }).notNull(),
  dateRangeEnd: timestamp("date_range_end", { mode: "date" }).notNull(),
  dailyStartMinutes: integer("daily_start_minutes").notNull(),
  dailyEndMinutes: integer("daily_end_minutes").notNull(),
  maxParticipants: integer("max_participants").notNull(),
  anonymousMode: boolean("anonymous_mode").notNull().default(false),
  status: text("status", { enum: ["open", "finalized"] })
    .notNull()
    .default("open"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
```

Note: `id` has no DB-side default — the application always supplies `crypto.randomUUID()` on insert. This keeps behavior identical between production Postgres and the `pglite` test database, which doesn't have the `pgcrypto`/`uuid-ossp` extensions.

- [x] **Step 5: Create `src/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
```

- [x] **Step 6: Create `src/db/test-client.ts`**

```ts
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await db.execute(sql`
    CREATE TABLE sessions (
      id uuid PRIMARY KEY,
      title text NOT NULL,
      admin_token text NOT NULL,
      date_range_start timestamp NOT NULL,
      date_range_end timestamp NOT NULL,
      daily_start_minutes integer NOT NULL,
      daily_end_minutes integer NOT NULL,
      max_participants integer NOT NULL,
      anonymous_mode boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'open',
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  return db;
}
```

- [x] **Step 7: Create `drizzle.config.ts`** (used later to migrate the real production database)

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [x] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/db/schema.test.ts`
Expected: PASS.

- [x] **Step 9: Run full test suite**

Run: `npx vitest run`
Expected: all tests (sanity, globals, schema) PASS.

- [x] **Step 10: Commit**

```bash
git add package.json package-lock.json src/db drizzle.config.ts
git commit -m "feat: add Drizzle ORM with sessions table and pglite test harness"
```

---

### Task 4: Deploy to Vercel

**Files:**
- Create: `.env.example`
- No code changes beyond documenting required environment variables.

**Interfaces:**
- Produces: a live Vercel deployment URL serving the Task 2 homepage; documents the environment variables (`DATABASE_URL`, `LONGDO_MAP_KEY`, `PEXELS_API_KEY`) every later plan will read via `process.env`.

- [x] **Step 1: Create `.env.example`**

```
DATABASE_URL=postgres://user:password@host/dbname
LONGDO_MAP_KEY=
PEXELS_API_KEY=
```

- [x] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: document required environment variables"
```

- [x] **Step 3: Push to GitHub**

Run: `git push origin main`
Expected: pushes cleanly to the already-configured `origin` (`https://github.com/blackfenzer/meet-eat.git`).

- [x] **Step 4: Provision a Postgres database (user action)**

In the Vercel dashboard, open the project → Storage tab → create a Postgres database (Neon-backed, free tier) and connect it to this project. This is a one-time manual step in Vercel's UI — copy the generated `DATABASE_URL` for the next step.

- [ ] **Step 5: Import the project into Vercel and deploy**

In the Vercel dashboard, "Add New Project" → import `blackfenzer/meet-eat` from GitHub. Vercel auto-detects Next.js. If the Postgres integration from Step 4 was connected to this project, `DATABASE_URL` is already set; otherwise add it manually under Project Settings → Environment Variables using the value from Step 4. Trigger a deploy.

- [ ] **Step 6: Verify the live deployment**

Open the deployment URL Vercel provides. Confirm the "Meet & Eat" heading and five color swatches render exactly as they did locally in Task 2 Step 8.

---

## Self-Review

**Spec coverage:** This plan intentionally covers only SPEC.md's "Stack" and "Theme" sections (project scaffold, theming, database wiring, deployment) — the foundation every other subsystem needs. It does **not** yet cover: identity/join logic, anonymous mode, scheduling grid, activities/ranking/images, map/transit, finalizing, live-update polling, or data-lifecycle cleanup. Those are intentionally deferred to the subsystem plans below, per the writing-plans skill's scope-check guidance (multi-subsystem specs get one plan per subsystem rather than one monolithic plan).

**Placeholder scan:** No TBD/TODO markers; every step has runnable commands or complete file contents.

**Type consistency:** `sessions` table fields (`id`, `title`, `adminToken`, `dateRangeStart`, `dateRangeEnd`, `dailyStartMinutes`, `dailyEndMinutes`, `maxParticipants`, `anonymousMode`, `status`, `createdAt`) are used identically across Task 3's schema, client, test-client, and test file.

## Roadmap: subsequent subsystem plans

Each will be written as its own plan doc (same TDD/bite-sized format) once the prior one is built and verified, so file paths and interfaces reflect what actually got built rather than upfront guesses:

1. **Identity & sessions** — session-creation form, admin secret-URL generation, participant join flow (new-name vs. existing-name+PIN login), room-cap enforcement, localStorage recognition.
2. **Scheduling grid** — date-range/time-window bounded calendar grid, 30-minute drag-select availability painting, overlap heatmap, polling refresh.
3. **Activities & ranking** — shared activity pool (admin + participant additions), `og:image`/Pexels image resolution, dnd-kit drag-to-reorder personal ranking, aggregate group ranking.
4. **Map & transit** — Longdo Map pin rendering per activity location, "Get there" deep link to Google/Apple Maps.
5. **Admin controls & anonymous mode** — admin panel (edit/kick participants, view/reset PINs, live-edit session settings), anonymous-mode display toggle.
6. **Finalize flow** — admin locks in date/time/activity, read-only "Final Plan" screen, reopen capability.
7. **Data lifecycle** — scheduled cleanup job auto-expiring sessions 90 days after their date range ends.
8. **Polish** — Motion-driven transitions throughout, full mobile-touch pass on the drag interactions, deployment hardening.

---

## Execution notes (2026-09-06)

Executed inline on `main` (user consented to skipping a worktree: greenfield repo,
one prior commit, and Task 4 pushes to `main` to trigger the Vercel deploy anyway).

**Status:** Tasks 1–3 complete. Task 4 Steps 1–3 complete (`.env.example`, commit,
push). Task 4 Steps 4–6 remain — they are Vercel dashboard actions only the repo
owner can perform.

**Verification:** 7 tests passing across 3 files (`npx vitest run`); `npm run build`
compiles with no type errors; the five brand swatches were confirmed in a real
browser at `localhost:3000` with computed colors read from the DOM, each matching
its spec hex exactly (`#8B0909 #B20808 #EDD9CC #B8A597 #806350`); zero console errors.

**Resolved versions:** Next 16.3.4, React 19.2.8, TypeScript 7.0.2, Vitest 5.0.0,
Tailwind 4.3.3, drizzle-orm 0.45.2, drizzle-kit 0.31.10, pglite 0.5.8, pg 8.23.0.

### Deviations from the plan as written

1. **Test database uses generated migrations, not hand-written DDL** (Task 3 Step 6,
   user-approved). `createTestDb()` now applies the real `drizzle/` migrations via
   `drizzle-orm/pglite/migrator`. The generated `0000_*.sql` is byte-equivalent to
   the DDL the plan hand-wrote, so behavior is identical — but Plans 2–7 can add
   tables by running `npm run db:generate` instead of mirroring DDL by hand, which
   removes the schema-drift risk of tests passing against a schema production lacks.
   Added `db:generate` / `db:migrate` npm scripts.
2. **Dropped the `"lint": "eslint ."` script** (Task 1 Step 2). ESLint was never
   installed by any step and no step ran it — a dead script that fails if invoked.
3. **`vitest.config.ts` → `vitest.config.mts`.** Vite warned that ESM syntax in a
   CommonJS-loaded config is unsupported by the `configLoader: 'native'` default
   planned for a future major. The `.m` extension is the documented remedy.
4. **`next-env.d.ts` is gitignored and untracked.** Next rewrites it between
   `next dev` and `next build` (`.next/types` vs `.next/dev/types`), leaving the tree
   permanently dirty. It is regenerated on every build, Vercel included. This matches
   what current `create-next-app` does.
5. **Added `.claude/launch.json`** so the dev server can be driven by the browser
   preview tooling in this and future sessions.
6. **Committed `docs/`**, which the plan did not mention but which holds this plan.

### Known, accepted

`npm audit` reports 4 moderate advisories, all `drizzle-kit` → `@esbuild-kit` →
`esbuild`. Dev-only, not shipped; the advisory concerns esbuild's dev server, which
drizzle-kit does not expose. `npm audit --omit=dev` reports **0 vulnerabilities**.
The offered fix downgrades drizzle-kit to 0.18.1, a breaking regression — declined.

### Database provisioned (2026-09-06)

Task 4 Step 4 done by the repo owner. `.env` holds `DATABASE_URL`,
`LONGDO_MAP_KEY` and `PEXELS_API_KEY` (all three set; `.env` is gitignored).
`npm run db:migrate` applied `0000_*.sql` to the Neon database `neondb`;
verified against the live DB: `public.sessions` exists with all 11 columns,
correct defaults, and one row in `drizzle.__drizzle_migrations`. A rolled-back
insert/read round trip through `pg` confirmed end-to-end connectivity with no
persisted data. Re-running `db:migrate` is a no-op (still 1 migration row).

Two things noted about this database:

- It carries Neon's managed-auth tables in a **`neon_auth`** schema
  (`user`, `session`, `account`, `verification`, `organization`, `member`,
  `invitation`, `jwks`, `project_config`) — all empty. They are Neon's own
  provisioning, unrelated to this app, and SPEC.md specifies no user accounts,
  so nothing here uses them. `drizzle.config.ts` now sets
  `schemaFilter: ["public"]` so drizzle-kit can never plan a drop against them.
  Note `neon_auth.session` (Neon's) is distinct from `public.sessions` (ours).
- `pg` warns that `sslmode` values `prefer`/`require`/`verify-ca` are currently
  treated as `verify-full` and will adopt weaker libpq semantics in pg v9. It
  works today; when upgrading pg, pin `sslmode=verify-full` explicitly in
  `DATABASE_URL` to keep current behavior.

**Remaining:** Task 4 Steps 5–6 only — import the repo into Vercel, set
`DATABASE_URL` (plus the two API keys) in Project Settings, deploy, and confirm
the swatch page renders on the live URL.
