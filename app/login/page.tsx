import { Spade } from "lucide-react";
import { signInWithPassword } from "@/app/login/actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "invalid_credentials";
  const hasMissingEnv = params.error === "missing_env";

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">
          <Spade size={24} />
          <span>POKER MANAGER</span>
        </div>
        <div>
          <p className="eyebrow">Админ панель</p>
          <h1>Вход организатора</h1>
          <p className="muted">Управление таймером и настройками турнира.</p>
        </div>
        <form action={signInWithPassword} className="form-stack">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {hasMissingEnv ? (
            <p className="form-error">
              Supabase env vars не настроены. Заполни .env.local, чтобы войти в админку.
            </p>
          ) : null}
          {hasError ? (
            <p className="form-error">Неверный email или пароль.</p>
          ) : null}
          <button className="gold-button" type="submit">
            Войти
          </button>
        </form>
      </section>
    </main>
  );
}
