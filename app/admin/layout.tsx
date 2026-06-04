import type { ReactNode } from "react";
import { resetTournament } from "@/app/admin/actions";
import { AdminHeaderActions } from "@/components/admin/admin-header-actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminScrollRestorer } from "@/components/admin/admin-scroll-restorer";
import { loadAdminState } from "@/lib/admin-state";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const state = await loadAdminState();
  const tournament = state?.tournament ?? null;
  const publicToken = tournament?.publicToken ?? "";
  const tournamentName = tournament?.name ?? "POKER CLUB / DEMO";
  const logoUrl = tournament?.logoUrl ?? null;

  return (
    <main className="admin-page">
      <AdminScrollRestorer />
      <header className="admin-header">
        <div className="admin-title-row">
          <div className="admin-logo">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Лейбл турнира" src={logoUrl} />
            ) : null}
          </div>
          <div>
            <h1>{tournamentName}</h1>
            <p>🏆 Новый турнир</p>
          </div>
        </div>
        <AdminHeaderActions
          publicUrl={`/screen/${publicToken}`}
          resetAction={resetTournament}
          stateUrl="/tournament-state"
        />
      </header>
      <AdminNav publicToken={publicToken} />
      <section className="admin-content">{children}</section>
    </main>
  );
}
