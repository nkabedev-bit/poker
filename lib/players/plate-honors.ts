import "server-only";

import type { PlateForm } from "@/lib/players/plates";

/**
 * Who holds each plate of honour, by club account. Kept on the server: the mini-app is
 * told only which plates its own player holds, never the list.
 *
 * Accounts rather than nicknames, so a player who changes their nickname keeps the plate.
 */
const PLATE_HONOR_ACCOUNTS: Partial<Record<PlateForm, readonly string[]>> = {
  apc: [
    // The nine players who played the APC club cup for the club.
    "0532e710-7675-4029-b42f-33e09d22ae4d", // 1$
    "ca9b21dc-aacc-42cf-b7dd-d2e455f31120", // Seller
    "b5c0b6b4-0bad-429f-aed6-89f2198fea83", // Олюшка
    "1641b0df-f57f-4c58-b9cd-9203ccee6f35", // MaksB
    "64acbac6-5eb2-41d3-be2d-ec53450bb802", // Smartrichstyle
    "866d67e0-aa90-4170-a1f2-3bb16e344ec9", // Secret
    "dd5b8d92-0f0b-4b3e-864f-96e964828e81", // Seka_Machine
    "eb4b11e7-77ec-43c2-ba7f-713d172fc856", // Даня Хэнс
    "5d8226e4-4f05-4446-8e6f-a8946b9308ea", // Superman
    // Given by the club afterwards.
    "179c18b6-b1a5-414c-b4ec-f089d49784e6", // Gal
    "f004dbf8-cc2f-4b19-af00-9bc609c171f1", // Sick boy
    "66142e61-c6ce-4063-b44d-c64bcaae7ae0", // Ston3r_18
    "842afd72-e8f7-4e3d-afbe-ddcc68ce8e31", // Chura
    "0f78d620-c69b-4c02-82e2-b2d7ad6cbe1e", // hUN7E
  ],
  // Secret took second place at the APC cup.
  apc_second: ["866d67e0-aa90-4170-a1f2-3bb16e344ec9"],
  // The club championship of Russia in sport poker.
  championship: [
    "f004dbf8-cc2f-4b19-af00-9bc609c171f1", // Sick boy
    "3b85b827-b657-44aa-ae96-799dafa6e77e", // Киберпсих
    "ca9b21dc-aacc-42cf-b7dd-d2e455f31120", // Seller
    "64acbac6-5eb2-41d3-be2d-ec53450bb802", // Smartrichstyle
    "b5c0b6b4-0bad-429f-aed6-89f2198fea83", // Олюшка
    "0f78d620-c69b-4c02-82e2-b2d7ad6cbe1e", // hUN7E
  ],
  // Seller reached the final of the championship's individual event.
  championship_finalist: ["ca9b21dc-aacc-42cf-b7dd-d2e455f31120"],
};

/** The plates of honour an account holds, in the picker's order. */
export function listHonorPlates(accountId: string | null | undefined): PlateForm[] {
  if (!accountId) return [];

  return (Object.keys(PLATE_HONOR_ACCOUNTS) as PlateForm[]).filter((form) =>
    PLATE_HONOR_ACCOUNTS[form]?.includes(accountId),
  );
}
