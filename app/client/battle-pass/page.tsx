import { Swords } from "lucide-react";
import { PageTitle, ScreenMessage } from "../_components/ui";

/**
 * The season's battle pass, announced before it exists: which achievements count
 * and what they win is still being settled, so for now the tab only says it is coming.
 */
export default function ClientBattlePassPage() {
  return (
    <div className="client-stagger pt-1">
      <PageTitle>Боевой пропуск</PageTitle>
      <ScreenMessage icon={<Swords size={30} />} lively title="Скоро" />
    </div>
  );
}
