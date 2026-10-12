/**
 * Saves the player's favourite hand, or takes it off with null. Both the profile's card
 * and the settings open the picker, so the request lives here.
 */
export async function postFavoriteHand(
  initData: string,
  hand: string | null,
): Promise<{ hand: string | null } | { error: string }> {
  try {
    const res = await fetch("/api/client-tma/favorite-hand", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
      body: JSON.stringify({ hand }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) return { error: data?.message ?? "Не удалось сохранить руку. Попробуйте ещё раз." };
    return { hand: (data?.hand as string | null | undefined) ?? null };
  } catch {
    return { error: "Нет связи с сервером. Попробуйте ещё раз." };
  }
}
