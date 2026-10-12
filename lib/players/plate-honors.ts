import "server-only";

import type { PlateForm } from "@/lib/players/plates";

/**
 * Who holds each plate of honour, by club account. Kept on the server: the mini-app is
 * told only which plates its own player holds, never the list.
 *
 * Accounts rather than nicknames, so a player who changes their nickname keeps the plate.
 */
const PLATE_HONOR_ACCOUNTS: Partial<Record<PlateForm, readonly string[]>> = {
  // The nine players who played the APC club cup for the club.
  apc: [
    "0532e710-7675-4029-b42f-33e09d22ae4d", // 1$
    "ca9b21dc-aacc-42cf-b7dd-d2e455f31120", // Seller
    "b5c0b6b4-0bad-429f-aed6-89f2198fea83", // Олюшка
    "1641b0df-f57f-4c58-b9cd-9203ccee6f35", // MaksB
    "64acbac6-5eb2-41d3-be2d-ec53450bb802", // Smartrichstyle
    "866d67e0-aa90-4170-a1f2-3bb16e344ec9", // Secret
    "dd5b8d92-0f0b-4b3e-864f-96e964828e81", // Seka_Machine
    "eb4b11e7-77ec-43c2-ba7f-713d172fc856", // Даня Хэнс
    "5d8226e4-4f05-4446-8e6f-a8946b9308ea", // Superman
  ],
  // Secret took second place at the APC cup.
  apc_second: ["866d67e0-aa90-4170-a1f2-3bb16e344ec9"],
};

/** The plates of honour an account holds, in the picker's order. */
export function listHonorPlates(accountId: string | null | undefined): PlateForm[] {
  if (!accountId) return [];

  return (Object.keys(PLATE_HONOR_ACCOUNTS) as PlateForm[]).filter((form) =>
    PLATE_HONOR_ACCOUNTS[form]?.includes(accountId),
  );
}
