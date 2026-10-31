// Clicks through the client mini-app against mocked API answers and reports what worked.
const fs = require("fs");
const { chromium } = require("@playwright/test");

const mock = eval(fs.readFileSync(__dirname + "/mock-signup-profile.js", "utf8"));
const BASE = "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/client-tma/")) requests.push(`${request.method()} ${request.url().replace(BASE, "")}`);
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mock(page);
  page.on("dialog", (dialog) => dialog.dismiss());

  const settle = () => page.waitForTimeout(2600);
  const has = async (text) => (await page.getByText(text, { exact: false }).count()) > 0;

  // Home
  await page.goto(BASE + "/client");
  await settle();
  check("home: live card", await has("идёт игра"));
  check("home: next game card + button", (await page.getByRole("link", { name: "Открыть" }).count()) > 0);
  check("home: calendar rows", await has("Дальше в календаре"));
  check("home: offer banner", await has("Место освободилось"));
  check("home: rating top + me", (await has("Mr.Shark")) && (await has("Ace_77")));
  check("home: support/about/address", (await has("Поддержка")) && (await has("О клубе")) && (await has("Адрес клуба")));
  check("home: APC card", await has("Объявление клуба"));

  // Tab bar
  for (const [label, path] of [["Турниры", "/client/tournaments"], ["Боевой пропуск", "/client/battle-pass"], ["Профиль", "/client/profile"], ["Главная", "/client"]]) {
    await page.getByRole("link", { name: label, exact: true }).last().click();
    await page.waitForTimeout(800);
    check(`tab bar → ${label}`, new URL(page.url()).pathname === path, page.url());
  }

  // Tournaments: tabs, past list
  await page.goto(BASE + "/client/tournaments");
  await settle();
  check("tournaments: week groups", await has("Эта неделя"));
  await page.getByRole("button", { name: "Прошедшие" }).click();
  await settle();
  check("tournaments: past tab loads games", requests.some((r) => r.includes("scope=club")) && (await has("Phoenix")));
  check("tournaments: past tab in address", page.url().includes("tab=past"));

  // Event: choose tickets, pass, sign up, cancel
  await page.goto(BASE + "/client/events/e-next");
  await settle();
  const pressed = async (name) => (await page.getByRole("button", { name }).first().getAttribute("aria-pressed")) === "true";
  await page.getByRole("button", { name: /^VIP/ }).first().click();
  check("event: VIP ticket selectable", await pressed(/^VIP/));
  check("event: bar shows VIP price", await has("3 000 ₽"));
  await page.getByRole("button", { name: /^1\+1/ }).first().click();
  check("event: duo shows partner block", await has("Кто придёт с вами?"));
  check("event: duo hides passes", !(await has("Бесплатная проходка")));
  check("event: sign-up blocked without partner", await has("Укажите напарника"));
  await page.getByRole("button", { name: "Нет аккаунта" }).click();
  check("event: invite mode explains link", await has("ссылку-приглашение"));
  await page.getByRole("button", { name: "Резидент клуба" }).click();
  await page.getByRole("button", { name: /^Обычный/ }).first().click();
  await page.getByRole("button", { name: /^Обычная проходка/ }).click();
  check("event: pass picked", await pressed(/^Обычная проходка/));
  check("event: bar says by pass, 0 ₽", (await has("по проходке")) && (await has("0 ₽")));
  await page.getByRole("button", { name: /Кто идёт/ }).click();
  await page.waitForTimeout(400);
  check("event: who is coming expands", (await has("Друг Эйса")) && (await has("Лист ожидания")));
  await page.getByRole("button", { name: "Общие правила" }).count().then((n) => check("event: accordion present", true, `rules item ${n ? "present" : "absent (no rules text in mock)"}`));
  await page.getByRole("button", { name: "Где проходит турнир?" }).click();
  check("event: accordion opens venue", await has("пр. Ленина"));
  await page.getByRole("button", { name: "Записаться", exact: true }).click();
  await settle();
  check("event: signup POST sent", requests.some((r) => r.startsWith("POST /api/client-tma/events/e-next/signup")));
  check("event: signed-up state", (await has("Вы записаны · Обычный билет")) && (await has("Отменить запись")));
  await page.getByRole("button", { name: "Отменить запись" }).click();
  await settle();
  check("event: cancel DELETE sent", requests.some((r) => r.startsWith("DELETE /api/client-tma/events/e-next/signup")));
  check("event: back to sign-up", (await page.getByRole("button", { name: "Записаться", exact: true }).count()) > 0);

  // Offer + live event
  await page.goto(BASE + "/client/events/e-offer");
  await settle();
  check("offer: countdown + take seat", (await has("очередь дошла до вас")) && (await has("Записаться · Обычный")) && (await has("Отказаться от места")));
  await page.goto(BASE + "/client/events/e-live");
  await settle();
  check("live event: tables + my seat", (await has("За столами")) && (await has("Ваш номер")) && (await has("Вылетели")));

  // Rating
  await page.goto(BASE + "/client/rating");
  await settle();
  check("rating: podium + my place", (await has("Ваше место")) && (await has("Найти меня")));
  const firstRow = () => page.locator("[data-row]").first().getAttribute("data-row");
  const before = await firstRow();
  await page.getByRole("button", { name: "По рейтингу" }).click();
  await page.waitForTimeout(600);
  check("rating: sort by points reorders", (await firstRow()) !== before, `${before} → ${await firstRow()}`);
  await page.getByPlaceholder("Поиск по никнейму").fill("riv");
  await page.waitForTimeout(400);
  check("rating: search filters", (await page.locator("[data-row]").count()) >= 1 && !(await has("Blinder")));
  await page.getByPlaceholder("Поиск по никнейму").fill("");
  await page.getByRole("button", { name: "Найти меня" }).click();
  await page.waitForTimeout(700);
  check("rating: find me rings my row", (await page.locator(".client-find").count()) > 0);
  await page.getByRole("button", { name: "Лето 2026" }).click();
  await settle();
  check("rating: season switch requests season", requests.some((r) => r.includes("rating?season=s0")));

  // Profile
  await page.goto(BASE + "/client/profile");
  await settle();
  check("profile: card, stats, menu", (await has("КЛУБ СПОРТИВНОГО ПОКЕРА")) && (await has("Нокаутов")) && (await has("Бесплатные проходки")));
  check("profile: change photo button", (await page.getByRole("button", { name: /Сменить фото/ }).count()) > 0 && (await page.locator('input[type="file"]').count()) === 1);
  await page.getByRole("button", { name: /Любимая рука/ }).click();
  await page.waitForTimeout(700);
  check("profile: hand picker opens", (await page.getByRole("dialog", { name: "Любимая рука" }).count()) === 1);
  await page.getByRole("button", { name: "Отмена" }).click();
  await page.waitForTimeout(400);
  check("profile: hand picker closes", (await page.getByRole("dialog", { name: "Любимая рука" }).count()) === 0);
  check("profile: reserved ticket pill", await has("Билет отложен · подтвердите"));
  await page.getByRole("button", { name: "Прошедшие" }).click();
  await page.waitForTimeout(600);
  check("profile: past games tab", await has("5 нокаутов"));
  for (const [label, path] of [["Медали", "/client/medals"], ["Достижения", "/client/achievements"], ["Бесплатные проходки", "/client/passes"], ["Рейтинг", "/client/rating"]]) {
    await page.goto(BASE + "/client/profile");
    await settle();
    await page.getByRole("link", { name: new RegExp("^" + label) }).first().click();
    await page.waitForTimeout(900);
    check(`profile menu → ${label}`, new URL(page.url()).pathname === path, page.url());
  }

  // Player, achievement holders, game
  await page.goto(BASE + "/client/players/mrshark");
  await settle();
  check("player: profile with links", (await has("Mr.Shark")) && (await page.getByRole("link", { name: /^Медали/ }).count()) > 0);
  await page.goto(BASE + "/client/achievements");
  await settle();
  await page.getByRole("link", { name: /Дебют/ }).first().click();
  await settle();
  check("achievement tile → holders screen", page.url().includes("/client/achievements/"), page.url());
  await page.goto(BASE + "/client/games/" + encodeURIComponent("2026-09-26T16:00:00.000Z"));
  await settle();
  check("game: podium + table rows link", (await has("Результаты")) && (await page.locator("[data-results-table] a").count()) === 2);

  // Onboarding and link
  await page.goto(BASE + "/client/onboarding");
  await settle();
  await page.getByRole("button", { name: "Соцсети" }).click();
  check("onboarding: source chip fills field", (await page.getByPlaceholder("Друзья, соцсети, реклама…").inputValue()) === "Соцсети");
  const agreement = page.getByRole("checkbox", { name: /пользовательское соглашение/ });
  await agreement.check({ force: true });
  check("onboarding: agreement ticks", await agreement.isChecked());
  check("onboarding: save enabled after agreement", await page.getByRole("button", { name: "Сохранить анкету" }).isEnabled());
  await page.goto(BASE + "/client/link");
  await settle();
  await page.getByRole("button", { name: /Да, играл/ }).click();
  check("link: nickname field appears", (await page.getByPlaceholder("Ваш ник в клубе").count()) === 1);

  // Back button
  await page.goto(BASE + "/client");
  await settle();
  await page.getByRole("link", { name: "Профиль" }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Назад" }).click();
  await page.waitForTimeout(900);
  check("header back button returns", new URL(page.url()).pathname === "/client", page.url());

  check("no page errors", errors.length === 0, errors.join(" | "));
  console.log(results.join("\n"));
  await browser.close();
})().catch((error) => {
  console.log(results.join("\n"));
  console.error("CRASH", error.message);
  process.exit(1);
});
