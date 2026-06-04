import { LeaderboardTables } from "@/components/admin/pts-manager";
import { refreshLeaderboard } from "@/app/admin/extras/actions";
import { loadAdminExtras } from "@/lib/admin-state";

export default async function LeaderboardPage() {
  const extras = await loadAdminExtras();

  return (
    <div className="settings-stack">
      <section className="poker-panel">
        <div className="button-row">
          <a className="gold-button" href="#rating">👤 Игроки</a>
          <a className="gold-outline-button" href="#history">🏆 История турниров</a>
        </div>
      </section>
      <div id="rating">
        <LeaderboardTables extras={extras} />
      </div>
      <section className="poker-panel" id="history">
        <h2>🏆 История турниров</h2>
        <form action={refreshLeaderboard}>
          <button className="ghost-button" type="submit">🔄 Обновить</button>
        </form>
        <p className="muted">Нажмите «Обновить» для загрузки истории</p>
      </section>
    </div>
  );
}
