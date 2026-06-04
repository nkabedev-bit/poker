import type { Tournament } from "@/lib/timer/types";

type SettingsFormProps = {
  tournament: Tournament;
  publicUrl: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function SettingsForm({ tournament, publicUrl, action }: SettingsFormProps) {
  return (
    <form action={action} className="poker-panel settings-form">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Основная информация</p>
          <h2>Настройки турнира</h2>
        </div>
        <a className="gold-outline-button" href={publicUrl} target="_blank">
          Открыть экран
        </a>
      </div>
      <div className="form-grid">
        <label>
          Название турнира
          <input name="name" defaultValue={tournament.name} required />
        </label>
        <label>
          Стартовый стек
          <input
            name="startingStack"
            type="number"
            min={1}
            defaultValue={tournament.startingStack}
            required
          />
        </label>
        <label>
          Регистрация, мин
          <input
            name="registrationMinutes"
            type="number"
            min={0}
            defaultValue={tournament.registrationMinutes}
            required
          />
        </label>
      </div>
      <div className="logo-upload">
        <div className="logo-preview">
          {tournament.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Логотип турнира" src={tournament.logoUrl} />
          ) : (
            <span>Здесь будет ваш логотип</span>
          )}
        </div>
        <label>
          Лейбл турнира
          <input accept="image/png,image/jpeg,image/webp,image/svg+xml" name="logo" type="file" />
        </label>
      </div>
      <div className="public-link-box">
        <span>{publicUrl}</span>
      </div>
      <div className="button-row">
        <button className="gold-button" type="submit">
          Сохранить
        </button>
        <button className="ghost-button" type="button">
          Скопировать ссылку
        </button>
      </div>
    </form>
  );
}
