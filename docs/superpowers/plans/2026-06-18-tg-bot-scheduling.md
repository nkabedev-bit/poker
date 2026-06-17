# TG-bot Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Добавить во вкладку «тг бот» отложенную рассылку (разовую, текст) и расписание турниров с версиями по датам.

**Architecture:** Расписание — ленивый выбор активной версии при чтении (без cron). Рассылка — очередь `scheduled_broadcasts` + тик pg_cron/pg_net, который дёргает Vercel только при наличии due-строк.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + pg_cron + pg_net), grammy, zod, vitest.

---

## File Structure

| Файл | Ответственность |
|---|---|
| `lib/timer/types.ts` | тип `ScheduleVersion`, поле `scheduleVersions` в `clientBot` |
| `lib/tournament-extras-shared.ts` | дефолт + нормализация версий + `pickActiveScheduleText` |
| `lib/client-bot/schedule-time.ts` (new) | конвертация Moscow⇄UTC для UI |
| `lib/client-bot/broadcast.ts` (new) | `getClientBot`, `sendTextToClientUsers` |
| `lib/env.ts` + `.env.example` | `CRON_SECRET` |
| `supabase/migrations/202606180001_scheduled_broadcasts.sql` (new) | таблица + RLS + pg_cron/pg_net |
| `app/api/tma/client-bot/broadcast/route.ts` | ветка `sendAt` → очередь |
| `app/api/tma/client-bot/scheduled/route.ts` (new) | GET список |
| `app/api/tma/client-bot/scheduled/[id]/route.ts` (new) | DELETE отмена |
| `app/api/cron/dispatch-broadcasts/route.ts` (new) | отправка по тику |
| `app/api/tma/client-bot/settings/route.ts` | сохранение `scheduleVersions` |
| `app/api/client-bot/webhook/route.ts` | активная версия в `handleScheduleMenuAction` |
| `app/tma/bot/page.tsx` | UI обеих отложек |

---

## Task 1: Schedule versions data model + active-version picker

**Files:** Modify `lib/timer/types.ts`, `lib/tournament-extras-shared.ts`; Test `tests/client-bot/schedule-versions.test.ts`

- [ ] **Step 1: Write failing test** `tests/client-bot/schedule-versions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { mergeTournamentExtras, pickActiveScheduleText } from "@/lib/tournament-extras-shared";

describe("schedule versions", () => {
  it("defaults scheduleVersions to empty array", () => {
    expect(mergeTournamentExtras({}).clientBot.scheduleVersions).toEqual([]);
  });

  it("drops invalid versions and sorts by date asc", () => {
    const extras = mergeTournamentExtras({
      clientBot: {
        scheduleVersions: [
          { effectiveFrom: "2026-07-01T00:00:00Z", text: "july" },
          { effectiveFrom: "bad", text: "x" },
          { effectiveFrom: "2026-06-01T00:00:00Z", text: "june" },
          { effectiveFrom: "2026-08-01T00:00:00Z", text: "" },
        ],
      },
    });
    expect(extras.clientBot.scheduleVersions.map((v) => v.text)).toEqual(["june", "july"]);
  });

  it("falls back to scheduleText when no version is active", () => {
    const cb = { scheduleText: "base", scheduleVersions: [
      { effectiveFrom: "2099-01-01T00:00:00Z", text: "future" },
    ] };
    expect(pickActiveScheduleText(cb, new Date("2026-06-18T00:00:00Z"))).toBe("base");
  });

  it("picks latest version with effectiveFrom <= now", () => {
    const cb = { scheduleText: "base", scheduleVersions: [
      { effectiveFrom: "2026-06-01T00:00:00Z", text: "june" },
      { effectiveFrom: "2026-06-15T00:00:00Z", text: "mid-june" },
      { effectiveFrom: "2099-01-01T00:00:00Z", text: "future" },
    ] };
    expect(pickActiveScheduleText(cb, new Date("2026-06-18T00:00:00Z"))).toBe("mid-june");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm vitest run tests/client-bot/schedule-versions.test.ts`

- [ ] **Step 3: Add type** in `lib/timer/types.ts`:

```ts
export type ScheduleVersion = { effectiveFrom: string; text: string };
```
and add `scheduleVersions: ScheduleVersion[];` to `clientBot`.

- [ ] **Step 4: Implement** in `lib/tournament-extras-shared.ts`:
- import `ScheduleVersion` type.
- add `scheduleVersions: []` to `defaultTournamentExtras.clientBot`.
- add helpers + use in merge:

```ts
export function normalizeScheduleVersions(value: unknown): ScheduleVersion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is ScheduleVersion =>
      typeof v === "object" && v !== null &&
      typeof (v as ScheduleVersion).effectiveFrom === "string" &&
      typeof (v as ScheduleVersion).text === "string" &&
      (v as ScheduleVersion).text.trim().length > 0 &&
      !Number.isNaN(new Date((v as ScheduleVersion).effectiveFrom).getTime()))
    .map((v) => ({ effectiveFrom: v.effectiveFrom, text: v.text }))
    .sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
}

export function pickActiveScheduleText(
  clientBot: { scheduleText: string; scheduleVersions: ScheduleVersion[] },
  now: Date = new Date(),
): string {
  const active = clientBot.scheduleVersions
    .filter((v) => new Date(v.effectiveFrom).getTime() <= now.getTime())
    .at(-1); // already sorted asc by normalize
  return active ? active.text : clientBot.scheduleText;
}
```
In `mergeTournamentExtras`, replace clientBot spread to normalize versions:
```ts
clientBot: {
  ...defaultTournamentExtras.clientBot,
  ...(typeof input.clientBot === "object" && input.clientBot ? input.clientBot : {}),
  scheduleVersions: normalizeScheduleVersions(
    (input.clientBot as { scheduleVersions?: unknown } | undefined)?.scheduleVersions,
  ),
},
```
> `pickActiveScheduleText` relies on sorted-asc input; merge always sorts. Test passes raw arrays only through merge or pre-sorted.

- [ ] **Step 5: Run, expect PASS**

---

## Task 2: Moscow⇄UTC time helper

**Files:** Create `lib/client-bot/schedule-time.ts`; Test `tests/client-bot/schedule-time.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { moscowLocalToUtcISO, utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";

describe("schedule time (Europe/Moscow +03:00)", () => {
  it("converts moscow wall time to UTC ISO", () => {
    expect(moscowLocalToUtcISO("2026-06-19T14:00")).toBe("2026-06-19T11:00:00.000Z");
  });
  it("formats UTC ISO back to moscow datetime-local", () => {
    expect(utcISOToMoscowLocal("2026-06-19T11:00:00.000Z")).toBe("2026-06-19T14:00");
  });
  it("round-trips", () => {
    const local = "2026-12-31T23:30";
    expect(utcISOToMoscowLocal(moscowLocalToUtcISO(local))).toBe(local);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// Europe/Moscow — фикс +03:00, без DST с 2014.
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function moscowLocalToUtcISO(local: string): string {
  const normalized = local.length === 16 ? `${local}:00` : local;
  return new Date(`${normalized}+03:00`).toISOString();
}

export function utcISOToMoscowLocal(iso: string): string {
  const moscow = new Date(new Date(iso).getTime() + MOSCOW_OFFSET_MS);
  return moscow.toISOString().slice(0, 16);
}
```

- [ ] **Step 4: Run, expect PASS**

---

## Task 3: scheduled_broadcasts migration

**Files:** Create `supabase/migrations/202606180001_scheduled_broadcasts.sql`

- [ ] **Step 1: Write migration** (применяется вручную в SQL editor; `<APP_URL>`/`<CRON_SECRET>` заполнить):

```sql
create table if not exists public.scheduled_broadcasts (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  send_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed','canceled')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  result jsonb
);

create index if not exists scheduled_broadcasts_due_idx
  on public.scheduled_broadcasts (status, send_at);

alter table public.scheduled_broadcasts enable row level security;
-- Без policies: anon/authenticated доступа нет. service_role обходит RLS.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_due_broadcasts()
returns void
language plpgsql
security definer
as $$
declare
  due_count int;
begin
  select count(*) into due_count
    from public.scheduled_broadcasts
   where status = 'pending' and send_at <= now();

  if due_count > 0 then
    perform net.http_post(
      url := '<APP_URL>/api/cron/dispatch-broadcasts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
        'Content-Type', 'application/json'
      )
    );
  end if;
end;
$$;

select cron.schedule(
  'dispatch-broadcasts',
  '*/5 * * * *',
  $$ select public.dispatch_due_broadcasts(); $$
);
```

- [ ] **Step 2:** записать в memory, что миграцию надо применить вручную (см. финал).

---

## Task 4: CRON_SECRET env

**Files:** Modify `lib/env.ts`, `.env.example`

- [ ] **Step 1:** в `serverEnvSchema` добавить `CRON_SECRET: z.string().min(1)`, и в `getServerEnv()` — `CRON_SECRET: process.env.CRON_SECRET`.
- [ ] **Step 2:** в `.env.example` добавить `CRON_SECRET=replace-me`.

> Внимание: `getServerEnv()` уже используется в `requireTmaAuth`. Делая `CRON_SECRET` обязательным, мы заставляем выставить его в проде. Допустимо (security). Подтвердить, что в Vercel env переменная задаётся.

---

## Task 5: Client-bot broadcast lib

**Files:** Create `lib/client-bot/broadcast.ts`

- [ ] **Step 1: Implement**

```ts
import "server-only";
import { Bot } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";

export function getClientBot(): Bot | null {
  const token = process.env.CLIENT_TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return new Bot(token);
}

export async function sendTextToClientUsers(
  bot: Bot,
  supabase: SupabaseClient,
  message: string,
): Promise<{ sent: number; failed: number; total: number }> {
  const { data: users, error } = await supabase
    .from("client_bot_users")
    .select("chat_id")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  for (const user of users ?? []) {
    try {
      await bot.api.sendMessage(Number(user.chat_id), message);
      sent += 1;
    } catch (error) {
      console.error("Scheduled broadcast send failed", { chatId: user.chat_id, error });
      failed += 1;
    }
  }
  return { sent, failed, total: users?.length ?? 0 };
}
```

---

## Task 6: broadcast route — sendAt branch

**Files:** Modify `app/api/tma/client-bot/broadcast/route.ts`

- [ ] **Step 1:** убрать локальный `getClientBot`, импортировать из `@/lib/client-bot/broadcast`.
- [ ] **Step 2:** после `const files = ...`, добавить ветку отложки:

```ts
const sendAtRaw = String(formData.get("sendAt") ?? "").trim();
if (sendAtRaw) {
  const sendAt = new Date(sendAtRaw);
  if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "sendAt must be a future date" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Message is required for scheduled broadcast" }, { status: 400 });
  }
  if (files.length > 0) {
    return NextResponse.json(
      { error: "Attachments are not supported for scheduled broadcasts" },
      { status: 400 },
    );
  }
  const { data, error } = await auth.supabase
    .from("scheduled_broadcasts")
    .insert({ message, send_at: sendAt.toISOString() })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scheduled: true, id: data.id, sendAt: sendAt.toISOString() });
}
```
(остальной мгновенный путь — без изменений.)

---

## Task 7: scheduled list + cancel routes

**Files:** Create `app/api/tma/client-bot/scheduled/route.ts`, `app/api/tma/client-bot/scheduled/[id]/route.ts`

- [ ] **Step 1: list (GET)** `scheduled/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data, error } = await auth.supabase
    .from("scheduled_broadcasts")
    .select("id, message, send_at, status, sent_at, result")
    .order("send_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
```

- [ ] **Step 2: cancel (DELETE)** `scheduled/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const { data, error } = await auth.supabase
    .from("scheduled_broadcasts")
    .update({ status: "canceled" })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found or not pending" }, { status: 404 });
  return NextResponse.json({ canceled: true, id: data.id });
}
```

---

## Task 8: cron dispatch route

**Files:** Create `app/api/cron/dispatch-broadcasts/route.ts`

- [ ] **Step 1: Implement** (service role, защита `CRON_SECRET`, атомарный захват due-строк):

```ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { getClientBot, sendTextToClientUsers } from "@/lib/client-bot/broadcast";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ error: "Server env not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bot = getClientBot();
  if (!bot) return NextResponse.json({ error: "CLIENT_TELEGRAM_BOT_TOKEN missing" }, { status: 503 });

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Атомарный захват: pending+due -> sending. Параллельный тик получит 0 строк.
  const { data: due, error } = await supabase
    .from("scheduled_broadcasts")
    .update({ status: "sending" })
    .lte("send_at", new Date().toISOString())
    .eq("status", "pending")
    .select("id, message");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  for (const row of due ?? []) {
    try {
      const result = await sendTextToClientUsers(bot, supabase, row.message);
      await supabase
        .from("scheduled_broadcasts")
        .update({ status: "sent", sent_at: new Date().toISOString(), result })
        .eq("id", row.id);
    } catch (err) {
      await supabase
        .from("scheduled_broadcasts")
        .update({ status: "failed", sent_at: new Date().toISOString(), result: { error: String(err) } })
        .eq("id", row.id);
    }
    processed += 1;
  }

  return NextResponse.json({ processed });
}
```

---

## Task 9: settings route — scheduleVersions

**Files:** Modify `app/api/tma/client-bot/settings/route.ts`

- [ ] **Step 1:** импортировать `normalizeScheduleVersions` из `@/lib/tournament-extras-shared`; в POST добавить в `clientBot`:
```ts
scheduleVersions: normalizeScheduleVersions(body.scheduleVersions),
```

---

## Task 10: webhook — active schedule version

**Files:** Modify `app/api/client-bot/webhook/route.ts`

- [ ] **Step 1:** импортировать `pickActiveScheduleText` из `@/lib/tournament-extras-shared`; в `handleScheduleMenuAction` заменить:
```ts
const scheduleText = context?.extras.clientBot.scheduleText.trim();
```
на
```ts
const scheduleText = context
  ? pickActiveScheduleText(context.extras.clientBot).trim()
  : "";
```

---

## Task 11: UI — bot page

**Files:** Modify `app/tma/bot/page.tsx`

- [ ] **Step 1:** расширить `ClientBotSettings` полем `scheduleVersions: { effectiveFrom: string; text: string }[]`; в `emptySettings` — `scheduleVersions: []`.
- [ ] **Step 2:** Рассылка — добавить чекбокс «Отправить позже» + `<input type="datetime-local">` (значение Moscow). При отправке: если включено — `formData.set("sendAt", moscowLocalToUtcISO(value))`. Импорт из `@/lib/client-bot/schedule-time`.
- [ ] **Step 3:** список запланированных: `GET /api/tma/client-bot/scheduled`, рендер с `utcISOToMoscowLocal(send_at)`, статусом, кнопкой «Отменить» (DELETE) для pending. Обновлять после планирования/отмены.
- [ ] **Step 4:** Расписание — под базовой textarea добавить редактор `scheduleVersions`: строки (datetime-local Moscow + textarea), «Добавить версию» / «Удалить». В `saveSettings` отправлять `scheduleVersions` с `effectiveFrom` в UTC ISO.
- [ ] **Step 5:** запустить `pnpm build` (или typecheck) — убедиться, что страница компилируется.

---

## Final verification

- [ ] `pnpm vitest run` — все зелёные.
- [ ] `pnpm build` — без ошибок типов.
- [ ] Применить миграцию вручную в Supabase SQL editor (заполнить `<APP_URL>`, `<CRON_SECRET>`).
- [ ] Выставить `CRON_SECRET` в Vercel env.

## Self-review notes

- Spec coverage: Фича2 — T1/T9/T10/T11; Фича1 — T3/T4/T5/T6/T7/T8/T11. TZ — T2. Покрыто.
- Идемпотентность cron — атомарный update pending→sending (T8).
- Backward compat — merge default `[]` (T1).
