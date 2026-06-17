// Europe/Moscow — фикс +03:00, без DST с 2014.
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

// "2026-06-19T14:00" (московское настенное время) -> UTC ISO.
export function moscowLocalToUtcISO(local: string): string {
  const normalized = local.length === 16 ? `${local}:00` : local;
  return new Date(`${normalized}+03:00`).toISOString();
}

// UTC ISO -> "2026-06-19T14:00" для <input type="datetime-local"> (московское время).
export function utcISOToMoscowLocal(iso: string): string {
  const moscow = new Date(new Date(iso).getTime() + MOSCOW_OFFSET_MS);
  return moscow.toISOString().slice(0, 16);
}
