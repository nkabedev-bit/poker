import { buildNicknameKey } from "@/lib/players/nickname-key";

// Secret took second place in the Side Event at the APC club cup in St Petersburg
// (10 October 2026), and the club shows it beside the player's tier. Keyed by nickname,
// like the club's other one-off rules: a new nickname means changing it here.
const SECRET_NICKNAME_KEY = buildNicknameKey("Secret");
const SECRET_APC_HONOR = "2-ое место в Side Event APC";

/** The plate a player has earned outside the club's own games, if any. */
export function getPlayerHonor(nickname: string | null | undefined) {
  return buildNicknameKey(nickname ?? "") === SECRET_NICKNAME_KEY ? SECRET_APC_HONOR : null;
}
