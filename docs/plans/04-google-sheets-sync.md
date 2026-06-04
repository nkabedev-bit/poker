# План работ: Оптимизация работы с Google Sheets API (Google Sheets Sync Decoupling)

## Проблема
Во время записи вылета эндпоинт `POST /api/tma/eliminations` блокируется медленными запросами к Google Sheets API (выполняется до 4 последовательных запросов по HTTP). Это увеличивает время ответа сервера до нескольких секунд и создает риск падения по тайм-ауту. В случае лимитов со стороны Google (Error 429) вся транзакция вылета падает с ошибкой 500, приводя к несогласованности данных.

---

## Предлагаемое решение
1. **Убрать лишние запросы:** Исключить повторную перезапись заголовков (`updateSheetHeaders`) при каждом вылете игрока. Записывать заголовки только один раз при создании листа.
2. **Асинхронность (Non-blocking):** Отправлять запросы к Google Sheets в фоновом режиме, чтобы эндпоинт вылета возвращал ответ администратору мгновенно, не дожидаясь ответа от Google API.
3. **Отказоустойчивость:** Реализовать логирование ошибок без падения основного процесса.

---

## Пошаговый план реализации

### Шаг 1. Оптимизация вызовов Google Sheets API
В файле `lib/google-sheets.ts` изменить функцию `getOrCreateSheet`:
```typescript
async function getOrCreateSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  headers = ELIMINATION_SHEET_HEADERS,
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s: sheets_v4.Schema$Sheet) => s.properties?.title === sheetName
  );

  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });

      // Записываем заголовки ТОЛЬКО при создании нового листа
      await updateSheetHeaders(sheets, spreadsheetId, sheetName, headers);
    } catch {
      console.log("Sheet creation race condition handled");
    }
  }
  // УДАЛИТЬ: await updateSheetHeaders(...) отсюда, чтобы не перезаписывать их каждый раз
}
```

### Шаг 2. Асинхронное выполнение запросов к Google Sheets
Для серверов Next.js/Vercel:
1. Использовать `request.waitUntil()` (в Next.js middleware / Edge Runtime) или просто запускать промис без `await` в Serverless-окружении (однако в Vercel процесс может быть заморожен сразу после отправки HTTP-ответа, если нет активных фоновых воркеров).
2. **Рекомендуемый подход для Vercel Free:** Выполнять запись в Google Sheets через фоновую задачу. Для этого можно отправлять асинхронный POST-запрос на специальный внутренний роут `/api/sync/sheets`, не ожидая ответа:
   ```typescript
   // В эндпоинте вылета:
   fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/sync/sheets`, {
     method: "POST",
     body: JSON.stringify(syncPayload),
     headers: { "Content-Type": "application/json" }
   }).catch(err => console.error("Async sync trigger failed", err));
   ```
3. **Альтернативный простой подход (try-catch изоляция):** Оставить вызов синхронным, но обернуть в изолированный блок `try/catch`. В случае ошибки Google API логировать её, но возвращать администратору успешный статус вылета (так как в базе данных Supabase изменения уже успешно применились).

### Шаг 3. Изоляция ошибок в `POST /api/tma/eliminations/route.ts`
Переписать блок вызова Google Sheets:
```typescript
try {
  const { rowId, sheetName } = await appendEliminationRow({
    eliminatedName: eliminatedPlayer.name,
    finishPlace: eliminationResult.finishPlace,
    killers: sanitizedKillers,
    currentRound,
    standingsRows: buildPtsStandingsRows(...),
    usesReentry,
  });
  
  await updateBountyLogSheetsRow(auth.supabase, {
    id: String(bountyRecord.id),
    rowId,
    sheetName,
    tournamentId: t.id,
  });
} catch (sheetError) {
  // Ошибка интеграции с Google Sheets не должна прерывать процесс вылета в турнире
  console.error("Non-critical Google Sheets sync error:", sheetError);
}
```
Это гарантирует, что даже если Google Sheets будет недоступен или заблокирован лимитами, турнир продолжится без сбоев.
