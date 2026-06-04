# Poker Tournament Timer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internet-accessible MVP where an organizer controls one active poker tournament and a public screen updates live.

**Architecture:** A Next.js App Router application owns both the protected admin panel and the public screen route. Supabase stores tournament data, authenticates the admin, stores the logo, and sends public screen updates through Realtime Broadcast; public screens also refresh through a server route so table data stays protected.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Supabase Auth/Postgres/Storage/Realtime Broadcast, Zod, Vitest, Playwright.

---

## Source Spec

- `docs/superpowers/specs/2026-04-28-poker-tournament-mvp-design.md`

## Scope Check

This plan implements the MVP only: one active tournament, admin settings, blind editor, timer controls, secret public screen, realtime updates, and screenshot-matched styling. It does not implement players, tables, seating, prizes, rating, leaderboard, Telegram, import/export, or multiple tournaments.

## External References

- Supabase Realtime Broadcast: `https://supabase.com/docs/guides/realtime/broadcast`
- Supabase Realtime overview: `https://supabase.com/docs/guides/realtime`
- Supabase RLS: `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Supabase API security: `https://supabase.com/docs/guides/api/securing-your-api`

## File Structure

Create or modify these paths:

- `package.json` - project scripts and dependencies.
- `.env.example` - required environment variables.
- `supabase/migrations/202604280001_poker_mvp.sql` - database schema, RLS, seed data, public read RPC.
- `lib/env.ts` - typed environment access.
- `lib/supabase/browser.ts` - browser Supabase client.
- `lib/supabase/server.ts` - cookie-aware server Supabase client.
- `lib/supabase/admin.ts` - server-only service-role client.
- `lib/timer/types.ts` - shared tournament and timer types.
- `lib/timer/calculate.ts` - pure countdown calculations.
- `lib/timer/presets.ts` - Turbo, Standard, Deep Stack blind structures.
- `lib/realtime/broadcast.ts` - server-side Realtime Broadcast helper.
- `app/layout.tsx` - root layout.
- `app/globals.css` - dark poker theme matching screenshots.
- `middleware.ts` - auth protection for `/admin`.
- `app/login/page.tsx` - admin login page.
- `app/login/actions.ts` - login action.
- `app/admin/layout.tsx` - protected admin shell.
- `app/admin/page.tsx` - redirect to `/admin/settings`.
- `app/admin/settings/page.tsx` - tournament settings.
- `app/admin/settings/actions.ts` - settings persistence.
- `app/admin/blinds/page.tsx` - blind structure editor.
- `app/admin/blinds/actions.ts` - blind structure persistence.
- `app/admin/timer/page.tsx` - timer control surface.
- `app/admin/timer/actions.ts` - timer commands.
- `app/api/public-state/[token]/route.ts` - public snapshot by secret token.
- `app/screen/[token]/page.tsx` - public screen server page.
- `components/admin/admin-nav.tsx` - admin top tabs.
- `components/admin/settings-form.tsx` - settings form.
- `components/admin/blinds-editor.tsx` - blind editor.
- `components/admin/timer-controls.tsx` - admin timer controls.
- `components/public/public-screen.tsx` - realtime public screen client.
- `components/public/blinds-table.tsx` - public blind level table.
- `components/public/timer-display.tsx` - large countdown display.
- `tests/timer/calculate.test.ts` - unit tests for countdown behavior.
- `tests/e2e/public-screen.spec.ts` - Playwright smoke scenarios.

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git**

Run:

```bash
git init
```

Expected: git creates `.git/`.

- [ ] **Step 2: Create the Next.js app in the current folder**

Run:

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir false --import-alias "@/*"
```

Expected: Next.js creates `app/`, `package.json`, `tsconfig.json`, Tailwind config, and ESLint config.

- [ ] **Step 3: Install runtime and test dependencies**

Run:

```bash
pnpm add @supabase/supabase-js @supabase/ssr zod lucide-react clsx
pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

Expected: dependencies are added to `package.json`.

- [ ] **Step 4: Add required scripts to `package.json`**

Modify `package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 5: Create `.env.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-publishable-or-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key
ADMIN_EMAIL=admin@example.com
```

- [ ] **Step 6: Ensure `.gitignore` covers local secrets and generated files**

`.gitignore` must include:

```gitignore
.env
.env.local
.next
node_modules
.superpowers
playwright-report
test-results
```

- [ ] **Step 7: Verify bootstrap**

Run:

```bash
pnpm lint
pnpm build
```

Expected: both commands complete successfully.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example .gitignore app next.config.* tsconfig.json postcss.config.* eslint.config.* tailwind.config.* 2>/dev/null || git add .
git commit -m "chore: scaffold poker timer app"
```

## Task 2: Supabase Schema and Seed Data

**Files:**
- Create: `supabase/migrations/202604280001_poker_mvp.sql`

- [ ] **Step 1: Create schema migration**

Create `supabase/migrations/202604280001_poker_mvp.sql` with:

```sql
create extension if not exists pgcrypto;

create type public.registration_status as enum ('open', 'closed');
create type public.timer_status as enum ('not_started', 'running', 'paused', 'break', 'finished');

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Friday Night Poker',
  logo_url text,
  starting_stack integer not null default 10000 check (starting_stack > 0),
  registration_minutes integer not null default 180 check (registration_minutes >= 0),
  registration_status public.registration_status not null default 'open',
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.blind_levels (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  level_order integer not null check (level_order > 0),
  small_blind integer,
  big_blind integer,
  ante integer,
  duration_seconds integer not null check (duration_seconds > 0),
  is_break boolean not null default false,
  break_duration_seconds integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, level_order),
  check (
    (is_break = true and small_blind is null and big_blind is null)
    or
    (is_break = false and small_blind is not null and big_blind is not null)
  )
);

create table public.timer_state (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references public.tournaments(id) on delete cascade,
  status public.timer_status not null default 'not_started',
  current_level_index integer not null default 0 check (current_level_index >= 0),
  level_started_at timestamptz,
  paused_remaining_seconds integer,
  registration_closes_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tournaments_touch_updated_at
before update on public.tournaments
for each row execute function public.touch_updated_at();

create trigger blind_levels_touch_updated_at
before update on public.blind_levels
for each row execute function public.touch_updated_at();

create trigger timer_state_touch_updated_at
before update on public.timer_state
for each row execute function public.touch_updated_at();

alter table public.tournaments enable row level security;
alter table public.blind_levels enable row level security;
alter table public.timer_state enable row level security;

create policy "authenticated tournament read"
on public.tournaments for select to authenticated using (true);

create policy "authenticated tournament write"
on public.tournaments for all to authenticated using (true) with check (true);

create policy "authenticated blind read"
on public.blind_levels for select to authenticated using (true);

create policy "authenticated blind write"
on public.blind_levels for all to authenticated using (true) with check (true);

create policy "authenticated timer read"
on public.timer_state for select to authenticated using (true);

create policy "authenticated timer write"
on public.timer_state for all to authenticated using (true) with check (true);

insert into public.tournaments (id, name, starting_stack, registration_minutes)
values ('00000000-0000-0000-0000-000000000001', 'POKER CLUB / DEMO', 10000, 180)
on conflict (id) do nothing;

insert into public.blind_levels (tournament_id, level_order, small_blind, big_blind, ante, duration_seconds, is_break)
values
  ('00000000-0000-0000-0000-000000000001', 1, 25, 50, null, 1200, false),
  ('00000000-0000-0000-0000-000000000001', 2, 50, 100, null, 1200, false),
  ('00000000-0000-0000-0000-000000000001', 3, 75, 150, null, 1200, false),
  ('00000000-0000-0000-0000-000000000001', 4, 100, 200, 25, 1200, false)
on conflict (tournament_id, level_order) do nothing;

insert into public.timer_state (tournament_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (tournament_id) do nothing;

create or replace function public.get_public_state(token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tournament_record public.tournaments%rowtype;
  state_record public.timer_state%rowtype;
  levels_json jsonb;
begin
  select * into tournament_record
  from public.tournaments
  where public_token = token
  limit 1;

  if tournament_record.id is null then
    return null;
  end if;

  select * into state_record
  from public.timer_state
  where tournament_id = tournament_record.id
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(bl) order by bl.level_order), '[]'::jsonb)
  into levels_json
  from public.blind_levels bl
  where bl.tournament_id = tournament_record.id;

  return jsonb_build_object(
    'tournament', to_jsonb(tournament_record),
    'timerState', to_jsonb(state_record),
    'blindLevels', levels_json
  );
end;
$$;

revoke all on function public.get_public_state(text) from public;
grant execute on function public.get_public_state(text) to anon, authenticated;
```

- [ ] **Step 2: Apply migration**

Run:

```bash
supabase db push
```

Expected: the tables, policies, function, and seed tournament exist in Supabase.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202604280001_poker_mvp.sql
git commit -m "feat: add poker tournament schema"
```

## Task 3: Environment and Supabase Clients

**Files:**
- Create: `lib/env.ts`
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Create `lib/env.ts`**

```ts
import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
});

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  });
}
```

- [ ] **Step 2: Create browser client**

`lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
```

- [ ] **Step 3: Create server client**

`lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            return;
          }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Create server-only admin client**

`lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  const env = getServerEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
```

- [ ] **Step 5: Verify TypeScript**

Run:

```bash
pnpm build
```

Expected: build completes without TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts lib/supabase
git commit -m "feat: add supabase clients"
```

## Task 4: Timer Domain Logic

**Files:**
- Create: `lib/timer/types.ts`
- Create: `lib/timer/calculate.ts`
- Create: `lib/timer/presets.ts`
- Create: `tests/timer/calculate.test.ts`

- [ ] **Step 1: Write failing timer tests**

Create `tests/timer/calculate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calculateRemainingSeconds, getCurrentAndNextLevel } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

const levels: BlindLevel[] = [
  { id: "1", levelOrder: 1, smallBlind: 25, bigBlind: 50, ante: null, durationSeconds: 1200, isBreak: false, breakDurationSeconds: null },
  { id: "2", levelOrder: 2, smallBlind: 50, bigBlind: 100, ante: null, durationSeconds: 1200, isBreak: false, breakDurationSeconds: null },
];

describe("calculateRemainingSeconds", () => {
  it("returns full level duration before timer starts", () => {
    const state: TimerState = { status: "not_started", currentLevelIndex: 0, levelStartedAt: null, pausedRemainingSeconds: null, registrationClosesAt: null, finishedAt: null };
    expect(calculateRemainingSeconds(state, levels, new Date("2026-04-28T17:00:00Z"))).toBe(1200);
  });

  it("counts down from levelStartedAt while running", () => {
    const state: TimerState = { status: "running", currentLevelIndex: 0, levelStartedAt: "2026-04-28T17:00:00.000Z", pausedRemainingSeconds: null, registrationClosesAt: null, finishedAt: null };
    expect(calculateRemainingSeconds(state, levels, new Date("2026-04-28T17:05:00Z"))).toBe(900);
  });

  it("uses pausedRemainingSeconds while paused", () => {
    const state: TimerState = { status: "paused", currentLevelIndex: 0, levelStartedAt: "2026-04-28T17:00:00.000Z", pausedRemainingSeconds: 444, registrationClosesAt: null, finishedAt: null };
    expect(calculateRemainingSeconds(state, levels, new Date("2026-04-28T17:10:00Z"))).toBe(444);
  });

  it("never returns a negative countdown", () => {
    const state: TimerState = { status: "running", currentLevelIndex: 0, levelStartedAt: "2026-04-28T17:00:00.000Z", pausedRemainingSeconds: null, registrationClosesAt: null, finishedAt: null };
    expect(calculateRemainingSeconds(state, levels, new Date("2026-04-28T18:00:00Z"))).toBe(0);
  });
});

describe("getCurrentAndNextLevel", () => {
  it("returns current and next blind levels", () => {
    expect(getCurrentAndNextLevel(levels, 0)).toEqual({ current: levels[0], next: levels[1] });
  });

  it("returns null next level on the final level", () => {
    expect(getCurrentAndNextLevel(levels, 1)).toEqual({ current: levels[1], next: null });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test tests/timer/calculate.test.ts
```

Expected: tests fail because `lib/timer/calculate.ts` and types do not exist.

- [ ] **Step 3: Create shared timer types**

`lib/timer/types.ts`:

```ts
export type TimerStatus = "not_started" | "running" | "paused" | "break" | "finished";
export type RegistrationStatus = "open" | "closed";

export type BlindLevel = {
  id: string;
  levelOrder: number;
  smallBlind: number | null;
  bigBlind: number | null;
  ante: number | null;
  durationSeconds: number;
  isBreak: boolean;
  breakDurationSeconds: number | null;
};

export type Tournament = {
  id: string;
  name: string;
  logoUrl: string | null;
  startingStack: number;
  registrationMinutes: number;
  registrationStatus: RegistrationStatus;
  publicToken: string;
};

export type TimerState = {
  status: TimerStatus;
  currentLevelIndex: number;
  levelStartedAt: string | null;
  pausedRemainingSeconds: number | null;
  registrationClosesAt: string | null;
  finishedAt: string | null;
};

export type PublicTournamentState = {
  tournament: Tournament;
  timerState: TimerState;
  blindLevels: BlindLevel[];
};
```

- [ ] **Step 4: Create timer calculations**

`lib/timer/calculate.ts`:

```ts
import type { BlindLevel, TimerState } from "@/lib/timer/types";

export function getLevelDuration(level: BlindLevel | null): number {
  if (!level) return 0;
  if (level.isBreak) return level.breakDurationSeconds ?? level.durationSeconds;
  return level.durationSeconds;
}

export function calculateRemainingSeconds(
  state: TimerState,
  levels: BlindLevel[],
  now: Date,
): number {
  const current = levels[state.currentLevelIndex] ?? null;
  const duration = getLevelDuration(current);

  if (state.status === "finished") return 0;
  if (state.status === "paused") return Math.max(0, state.pausedRemainingSeconds ?? duration);
  if (state.status === "not_started" || !state.levelStartedAt) return duration;

  const startedAt = new Date(state.levelStartedAt).getTime();
  const elapsedSeconds = Math.floor((now.getTime() - startedAt) / 1000);
  return Math.max(0, duration - elapsedSeconds);
}

export function getCurrentAndNextLevel(levels: BlindLevel[], currentLevelIndex: number) {
  return {
    current: levels[currentLevelIndex] ?? null,
    next: levels[currentLevelIndex + 1] ?? null,
  };
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
```

- [ ] **Step 5: Create blind presets**

`lib/timer/presets.ts`:

```ts
import type { BlindLevel } from "@/lib/timer/types";

export type BlindPresetName = "turbo" | "standard" | "deep";

export const blindPresets: Record<BlindPresetName, Omit<BlindLevel, "id">[]> = {
  turbo: [
    { levelOrder: 1, smallBlind: 25, bigBlind: 50, ante: null, durationSeconds: 600, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 2, smallBlind: 50, bigBlind: 100, ante: null, durationSeconds: 600, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 3, smallBlind: 100, bigBlind: 200, ante: 25, durationSeconds: 600, isBreak: false, breakDurationSeconds: null },
  ],
  standard: [
    { levelOrder: 1, smallBlind: 25, bigBlind: 50, ante: null, durationSeconds: 1200, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 2, smallBlind: 50, bigBlind: 100, ante: null, durationSeconds: 1200, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 3, smallBlind: 75, bigBlind: 150, ante: null, durationSeconds: 1200, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationSeconds: 1200, isBreak: false, breakDurationSeconds: null },
  ],
  deep: [
    { levelOrder: 1, smallBlind: 25, bigBlind: 50, ante: null, durationSeconds: 1800, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 2, smallBlind: 50, bigBlind: 100, ante: null, durationSeconds: 1800, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 3, smallBlind: 75, bigBlind: 150, ante: null, durationSeconds: 1800, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationSeconds: 1800, isBreak: false, breakDurationSeconds: null },
    { levelOrder: 5, smallBlind: 150, bigBlind: 300, ante: 25, durationSeconds: 1800, isBreak: false, breakDurationSeconds: null },
  ],
};
```

- [ ] **Step 6: Run unit tests**

Run:

```bash
pnpm test tests/timer/calculate.test.ts
```

Expected: all timer tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/timer tests/timer/calculate.test.ts
git commit -m "feat: add timer domain logic"
```

## Task 5: Auth and Admin Shell

**Files:**
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`
- Create: `components/admin/admin-nav.tsx`

- [ ] **Step 1: Add auth middleware**

Create `middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  if (!data.user && request.nextUrl.pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 2: Add login action**

Create `app/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect("/admin/settings");
}
```

- [ ] **Step 3: Add login page**

Create `app/login/page.tsx` with a dark card, email input, password input, submit button, and error text when `searchParams.error === "invalid_credentials"`. The form action must be `signInWithPassword`.

- [ ] **Step 4: Add admin nav**

Create `components/admin/admin-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Timer, Tv, Workflow } from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/admin/settings", label: "Настройки", icon: Settings },
  { href: "/admin/blinds", label: "Блайнды", icon: Workflow },
  { href: "/admin/timer", label: "Таймер", icon: Timer },
  { href: "/screen", label: "Экран", icon: Tv },
];

export function AdminNav({ publicToken }: { publicToken: string }) {
  const pathname = usePathname();

  return (
    <nav className="admin-tabs">
      {items.map((item) => {
        const href = item.href === "/screen" ? `/screen/${publicToken}` : item.href;
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={href} className={clsx("admin-tab", active && "admin-tab-active")}>
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Add admin layout**

Create `app/admin/layout.tsx` that fetches the seeded tournament through `createSupabaseServerClient()`, renders the screenshot-like header, and passes `publicToken` to `AdminNav`.

- [ ] **Step 6: Add admin index redirect**

Create `app/admin/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/settings");
}
```

- [ ] **Step 7: Verify auth protection**

Run:

```bash
pnpm build
```

Expected: build passes, `/admin` redirects to `/login` when not signed in.

- [ ] **Step 8: Commit**

```bash
git add middleware.ts app/login app/admin components/admin/admin-nav.tsx
git commit -m "feat: add admin auth shell"
```

## Task 6: Settings and Blind Editor

**Files:**
- Create: `app/admin/settings/page.tsx`
- Create: `app/admin/settings/actions.ts`
- Create: `components/admin/settings-form.tsx`
- Create: `app/admin/blinds/page.tsx`
- Create: `app/admin/blinds/actions.ts`
- Create: `components/admin/blinds-editor.tsx`

- [ ] **Step 1: Implement settings action**

Create `app/admin/settings/actions.ts` with `updateTournamentSettings(formData)` that validates `name`, `startingStack`, `registrationMinutes`, uploads `logo` to Supabase Storage when present, updates `tournaments`, calls `broadcastPublicState(publicToken)`, and redirects back to `/admin/settings`.

- [ ] **Step 2: Implement settings form**

Create `components/admin/settings-form.tsx` with inputs named `name`, `startingStack`, `registrationMinutes`, and `logo`. Add buttons labeled `Сохранить`, `Открыть экран`, and `Скопировать ссылку`. Use form action `updateTournamentSettings`.

- [ ] **Step 3: Implement settings page**

Create `app/admin/settings/page.tsx` that loads the single tournament and renders `SettingsForm`.

- [ ] **Step 4: Implement blind editor action**

Create `app/admin/blinds/actions.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { blindPresets, type BlindPresetName } from "@/lib/timer/presets";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { broadcastPublicState } from "@/lib/realtime/broadcast";

export async function applyBlindPreset(formData: FormData) {
  const preset = String(formData.get("preset")) as BlindPresetName;
  const levels = blindPresets[preset];
  if (!levels) redirect("/admin/blinds?error=invalid_preset");

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase.from("tournaments").select("id, public_token").single();
  if (!tournament) redirect("/admin/blinds?error=no_tournament");

  await supabase.from("blind_levels").delete().eq("tournament_id", tournament.id);
  await supabase.from("blind_levels").insert(
    levels.map((level) => ({
      tournament_id: tournament.id,
      level_order: level.levelOrder,
      small_blind: level.smallBlind,
      big_blind: level.bigBlind,
      ante: level.ante,
      duration_seconds: level.durationSeconds,
      is_break: level.isBreak,
      break_duration_seconds: level.breakDurationSeconds,
    })),
  );

  await broadcastPublicState(tournament.public_token);
  revalidatePath("/admin/blinds");
  redirect("/admin/blinds");
}
```

- [ ] **Step 5: Implement blind editor UI**

Create `components/admin/blinds-editor.tsx` as a client component that renders editable rows for level order, SB, BB, ante, duration minutes, and break flag. Add preset buttons `Турбо`, `Стандарт`, `Глубокий стек` that submit to `applyBlindPreset`.

- [ ] **Step 6: Implement blind page**

Create `app/admin/blinds/page.tsx` that loads blind levels ordered by `level_order` and renders `BlindsEditor`.

- [ ] **Step 7: Verify**

Run:

```bash
pnpm build
```

Expected: settings and blind pages compile.

- [ ] **Step 8: Commit**

```bash
git add app/admin/settings app/admin/blinds components/admin/settings-form.tsx components/admin/blinds-editor.tsx
git commit -m "feat: add tournament settings and blinds"
```

## Task 7: Timer Controls and Broadcast Helper

**Files:**
- Create: `lib/realtime/broadcast.ts`
- Create: `app/admin/timer/page.tsx`
- Create: `app/admin/timer/actions.ts`
- Create: `components/admin/timer-controls.tsx`

- [ ] **Step 1: Create broadcast helper**

Create `lib/realtime/broadcast.ts`:

```ts
import "server-only";
import { getServerEnv } from "@/lib/env";

export async function broadcastPublicState(publicToken: string) {
  const env = getServerEnv();
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `screen:${publicToken}`,
          event: "state-changed",
          payload: { token: publicToken, changedAt: new Date().toISOString() },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Broadcast failed with status ${response.status}`);
  }
}
```

- [ ] **Step 2: Implement timer actions**

Create `app/admin/timer/actions.ts` with server actions:

- `startTimer()`: sets status `running`, `level_started_at = now()`, and `registration_closes_at = now() + registration_minutes`.
- `pauseTimer()`: calculates remaining seconds from current level and stores status `paused`.
- `resumeTimer()`: sets status `running` and moves `level_started_at` so the stored remaining time is preserved.
- `nextLevel()`: increments `current_level_index`, sets status `running`, clears paused remaining seconds.
- `previousLevel()`: decrements `current_level_index` with floor `0`.
- `closeRegistration()`: updates tournament registration status to `closed`.
- `finishTournament()`: sets status `finished` and `finished_at = now()`.

Each action must call `broadcastPublicState(publicToken)` and `revalidatePath("/admin/timer")`.

- [ ] **Step 3: Implement timer controls component**

Create `components/admin/timer-controls.tsx` with the screenshot-like large admin timer panel. Buttons must call the actions and be labeled `Старт`, `Пауза`, `Продолжить`, `Пред. уровень`, `След. уровень`, `Закрыть регистрацию`, and `Завершить турнир`.

- [ ] **Step 4: Implement timer page**

Create `app/admin/timer/page.tsx` that loads tournament, timer state, and blind levels; computes current/next level; and renders `TimerControls`.

- [ ] **Step 5: Verify**

Run:

```bash
pnpm build
```

Expected: timer route compiles and server actions are valid.

- [ ] **Step 6: Commit**

```bash
git add lib/realtime/broadcast.ts app/admin/timer components/admin/timer-controls.tsx
git commit -m "feat: add timer controls"
```

## Task 8: Public Screen by Secret Token

**Files:**
- Create: `app/api/public-state/[token]/route.ts`
- Create: `app/screen/[token]/page.tsx`
- Create: `components/public/public-screen.tsx`
- Create: `components/public/blinds-table.tsx`
- Create: `components/public/timer-display.tsx`

- [ ] **Step 1: Implement public state route**

Create `app/api/public-state/[token]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("get_public_state", { token });

  if (error) {
    return NextResponse.json({ error: "Unable to load tournament state" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Public screen not found" }, { status: 404 });
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Implement public screen server page**

Create `app/screen/[token]/page.tsx` that fetches `/api/public-state/[token]` on the server, returns `notFound()` on 404, and renders `PublicScreen` with `initialState` and `token`.

- [ ] **Step 3: Implement `TimerDisplay`**

Create `components/public/timer-display.tsx` that receives `remainingSeconds`, current level, next level, and status, then renders a large `MM:SS` timer, progress bar, current blinds, next blinds, and status chip.

- [ ] **Step 4: Implement `BlindsTable`**

Create `components/public/blinds-table.tsx` that renders level order, SB, BB, ante, and break rows. Highlight the current row with the gold background from the screenshots.

- [ ] **Step 5: Implement realtime public screen**

Create `components/public/public-screen.tsx` as a client component. It must:

- Store `PublicTournamentState` in React state.
- Subscribe to Supabase channel `screen:${token}`.
- On `state-changed`, fetch `/api/public-state/${token}` and update state.
- Poll `/api/public-state/${token}` every 5000 ms as fallback.
- Tick local remaining seconds every 1000 ms using `calculateRemainingSeconds`.
- Render `BlindsTable` and `TimerDisplay`.

- [ ] **Step 6: Verify public route**

Run:

```bash
pnpm build
```

Expected: public route compiles and does not require auth.

- [ ] **Step 7: Commit**

```bash
git add app/api/public-state app/screen components/public
git commit -m "feat: add realtime public screen"
```

## Task 9: Screenshot-Matched Styling

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `components/admin/*`
- Modify: `components/public/*`

- [ ] **Step 1: Set global theme tokens**

In `app/globals.css`, define CSS variables:

```css
:root {
  --poker-bg: #05070c;
  --poker-panel: #111522;
  --poker-panel-2: #171b29;
  --poker-border: #2b3142;
  --poker-gold: #d4a93d;
  --poker-gold-soft: #f3d171;
  --poker-red: #7f1217;
  --poker-green: #167a3a;
  --poker-text: #f4f6fb;
  --poker-muted: #8d94a6;
}

body {
  background: var(--poker-bg);
  color: var(--poker-text);
}
```

- [ ] **Step 2: Add admin and public utility classes**

Add classes for `.admin-tabs`, `.admin-tab`, `.admin-tab-active`, `.poker-panel`, `.gold-button`, `.green-button`, `.red-button`, `.public-board`, `.blind-row-active`, and `.timer-display`. Use 6-8 px border radius, thin borders, and gold active states to match screenshots.

- [ ] **Step 3: Apply styles to admin**

Update admin components so forms are compact, panels are dark, active tabs have gold underline, primary actions use gold/green, and reset/destructive actions use red.

- [ ] **Step 4: Apply styles to public screen**

Update public components so the layout has a left blind table, a large center timer, gold title text, red/dark side panels, and high-contrast typography for TV use.

- [ ] **Step 5: Verify at desktop size**

Run:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000/admin/settings
http://localhost:3000/screen/<public-token>
```

Expected: both screens visually resemble the provided screenshots and no text overlaps at 1280x800.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx components
git commit -m "style: match poker manager screenshots"
```

## Task 10: Verification and E2E Smoke Tests

**Files:**
- Create: `tests/e2e/public-screen.spec.ts`
- Create: `playwright.config.ts`

- [ ] **Step 1: Create Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: Add public screen smoke test**

`tests/e2e/public-screen.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("public screen renders tournament timer shell", async ({ page }) => {
  const token = process.env.TEST_PUBLIC_TOKEN;
  test.skip(!token, "Set TEST_PUBLIC_TOKEN to the seeded tournament public token.");

  await page.goto(`/screen/${token}`);

  await expect(page.getByText(/POKER CLUB|Friday Night Poker/i)).toBeVisible();
  await expect(page.getByText(/Блайнды/i)).toBeVisible();
  await expect(page.locator(".timer-display")).toBeVisible();
});
```

- [ ] **Step 3: Run unit tests**

Run:

```bash
pnpm test
```

Expected: timer unit tests pass.

- [ ] **Step 4: Run build**

Run:

```bash
pnpm build
```

Expected: production build succeeds.

- [ ] **Step 5: Run e2e with a real public token**

Run after copying the seeded tournament `public_token` from Supabase:

```bash
TEST_PUBLIC_TOKEN=<public-token> pnpm e2e
```

Expected: public screen renders the tournament shell.

- [ ] **Step 6: Manual live-sync verification**

Open two browser windows:

```text
http://localhost:3000/admin/timer
http://localhost:3000/screen/<public-token>
```

Verify:

- Start updates the public timer.
- Pause stops the public countdown.
- Resume restarts countdown.
- Next level changes current and next blind values.
- Close registration changes public status.
- Refreshing the public screen returns the current state.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e playwright.config.ts
git commit -m "test: add public screen smoke coverage"
```

## Final Acceptance

The MVP is done when:

- `pnpm test` passes.
- `pnpm build` passes.
- `TEST_PUBLIC_TOKEN=<public-token> pnpm e2e` passes.
- Admin routes require login.
- Public screen opens without login by secret token.
- Public screen cannot mutate data.
- Timer, blind edits, logo/name edits, registration close, and level changes propagate from admin to public screen.
- Public UI visually matches the screenshots closely enough at 1280x800 to use on a TV or projector.
