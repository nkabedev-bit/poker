// One-off: carries the unpaid rows of the finance spreadsheet into player_debts.
//
// Every date tab ("dd/mm") is read; a player whose "Итого" is above zero and whose
// "Оплатил" is not "Да" becomes a debt for that evening. Such debts close sign-ups at
// once but are never reminded about: the sheet may hold mistakes, and the desk checks
// them by hand in «Касса → Долги». Running it again adds nothing twice.
//
// Run inside the app container, which has the keys in its environment:
//   docker cp deploy/migrate/import-debts.mjs club-app:/tmp/
//   docker exec -e DRY=1 club-app node /tmp/import-debts.mjs   # look first
//   docker exec club-app node /tmp/import-debts.mjs
import crypto from "node:crypto";

const YEAR = 2026;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.env.DRY === "1";

// Mirrors lib/players/nickname-key.ts.
const nicknameKey = (value) => value.toLocaleLowerCase("ru-RU").replace(/[^a-z0-9а-яё]/g, "");

async function googleToken() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 600,
    iat: now,
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
  })}`;
  const signature = crypto.createSign("RSA-SHA256").update(body).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${body}.${signature}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Google token: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function sheets(token, path) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_FINANCE_SHEET_ID}${path}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Sheets: ${JSON.stringify(json)}`);
  return json;
}

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const token = await googleToken();
  const meta = await sheets(token, "?fields=sheets.properties.title");
  const tabs = meta.sheets.map((sheet) => sheet.properties.title).filter((title) => /^\d{2}\/\d{2}$/.test(title));
  const ranges = tabs.map((tab) => `ranges=${encodeURIComponent(`'${tab}'!A2:K200`)}`).join("&");
  const values = await sheets(token, `/values:batchGet?${ranges}`);

  const rows = [];
  const notes = [];
  const nowIso = new Date().toISOString();

  for (const [index, range] of values.valueRanges.entries()) {
    const [day, month] = tabs[index].split("/");
    const playedOn = `${YEAR}-${month}-${day}`;
    const games = await rest(
      `tournament_results?select=started_at&played_on=eq.${playedOn}&order=started_at&limit=1`,
    );
    const gameStartedAt = games[0]?.started_at ?? `${playedOn}T16:00:00.000Z`;

    for (const row of range.values ?? []) {
      const name = String(row[1] ?? "").trim();
      const total = Number(row[9]);
      const paid = String(row[10] ?? "").trim();
      if (!name || name === "ИТОГО" || !(total > 0) || paid === "Да") continue;

      const key = nicknameKey(name);
      const accounts = await rest(`client_bot_users?select=id&nickname_key=eq.${encodeURIComponent(key)}`);
      const accountId = accounts.length === 1 ? accounts[0].id : null;

      rows.push({
        account_id: accountId,
        amount: total,
        blocks_from: nowIso,
        debtor_key: accountId ?? `name:${key}`,
        game_started_at: gameStartedAt,
        player_name: name,
        remind: false,
        source: "import",
      });
      notes.push({ matches: accounts.length, paidCell: paid, tab: tabs[index] });
    }
  }

  rows.forEach((row, index) => {
    const note = notes[index];
    console.log(
      `${note.tab}  ${row.player_name.padEnd(16)} ${String(row.amount).padStart(6)} ₽  ` +
        `${row.account_id ? "аккаунт" : `ГОСТЬ (совпадений: ${note.matches})`}  Оплатил="${note.paidCell}"`,
    );
  });
  console.log(`Итого: ${rows.length} строк, ${rows.reduce((sum, row) => sum + row.amount, 0)} ₽`);

  if (DRY) {
    console.log("DRY=1 — ничего не записано");
    return;
  }

  const saved = await rest("player_debts?on_conflict=game_started_at,debtor_key", {
    body: JSON.stringify(rows),
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    method: "POST",
  });
  console.log(`Записано новых строк: ${saved.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
