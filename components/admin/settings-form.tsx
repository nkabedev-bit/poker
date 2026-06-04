"use client";

import { useRef, useState } from "react";
import { CopyPublicLinkButton } from "@/components/admin/copy-public-link-button";
import { blindAlertSounds } from "@/lib/timer/blind-alert";
import type { BlindAlertSound, Tournament, TournamentExtras } from "@/lib/timer/types";

const blindAlertSoundLabels: Record<BlindAlertSound, string> = {
  standard: "Стандартный сигнал",
  double: "Двойной сигнал",
  chime: "Мягкий звонок",
  custom: "Свой сигнал",
  off: "Без звука",
};

type SettingsFormProps = {
  tournament: Tournament;
  extras: TournamentExtras;
  publicUrl: string;
  action: (formData: FormData) => void | Promise<void>;
};

const maxLogoSize = 4 * 1024 * 1024;
const maxSoundSize = 1024 * 1024;

type LogoUpload = {
  dataUrl: string;
  name: string;
  type: string;
};

export function SettingsForm({
  action,
  extras,
  publicUrl,
  tournament,
}: SettingsFormProps) {
  const settings = extras.settings;
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUpload, setLogoUpload] = useState<LogoUpload | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  const soundInputRef = useRef<HTMLInputElement>(null);
  const [soundFile, setSoundFile] = useState<File | null>(null);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [reentryEnabled, setReentryEnabled] = useState(settings.reentryEnabled);
  const [addonEnabled, setAddonEnabled] = useState(settings.addonEnabled);

  function updateLogoUpload(file: File | undefined) {
    setLogoUpload(null);
    setLogoError(null);

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Выберите изображение PNG");
      return;
    }
    if (file.size > maxLogoSize) {
      setLogoError("Файл больше 4 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setLogoError("Не удалось прочитать файл");
        return;
      }

      setLogoUpload({
        dataUrl: reader.result,
        name: file.name,
        type: file.type || "image/png",
      });
    };
    reader.onerror = () => setLogoError("Не удалось прочитать файл");
    reader.readAsDataURL(file);
  }

  function updateSoundUpload(file: File | undefined) {
    setSoundFile(null);
    setSoundError(null);

    if (!file) return;
    if (file.size > maxSoundSize) {
      setSoundError("Файл больше 1 MB");
      return;
    }
    setSoundFile(file);
  }

  const previewUrl = logoUpload?.dataUrl ?? tournament.logoUrl;

  return (
    <form action={action} className="poker-panel settings-form">
      <input name="buyIn" type="hidden" value={settings.buyIn} />
      <input name="rebuyPrice" type="hidden" value={settings.rebuyPrice} />
      <input name="addonPrice" type="hidden" value={settings.addonPrice} />
      <input name="addonChips" type="hidden" value={settings.addonChips} />
      <input name="addonMinutes" type="hidden" value={settings.addonMinutes} />
      <input name="registrationMinutes" type="hidden" value={tournament.registrationMinutes} />
      <div className="panel-heading">
        <h2>Основная информация</h2>
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
          🎯 Баунти
          <select
            aria-label="Тип баунти"
            name="bountyMode"
            defaultValue={
              settings.isBounty
                ? settings.bountyType === "mystery"
                  ? "mystery"
                  : "standard"
                : "off"
            }
          >
            <option value="off">Нет</option>
            <option value="standard">Обычный баунти</option>
            <option value="mystery">Mystery Bounty</option>
          </select>
        </label>
        <label>
          Количество столов
          <input name="tablesCount" type="number" min={1} defaultValue={settings.tablesCount} />
        </label>
        <label>
          Игроков за столом
          <input
            name="maxPlayersPerTable"
            type="number"
            min={1}
            defaultValue={settings.maxPlayersPerTable}
          />
        </label>
        <label>
          Включить ре-энтри?
          <select
            aria-label="Включить ре-энтри?"
            name="reentryEnabled"
            value={reentryEnabled ? "yes" : "no"}
            onChange={(event) => setReentryEnabled(event.target.value === "yes")}
          >
            <option value="no">Нет</option>
            <option value="yes">Да</option>
          </select>
        </label>
        {reentryEnabled ? (
          <label>
            Кол-во ре-энтри
            <input
              aria-label="Кол-во ре-энтри"
              inputMode="numeric"
              min={1}
              name="maxReentries"
              pattern="[0-9]*"
              type="number"
              defaultValue={settings.maxReentries}
            />
          </label>
        ) : null}
        <label>
          Добавить аддон
          <select
            aria-label="Добавить аддон"
            name="addonEnabled"
            value={addonEnabled ? "yes" : "no"}
            onChange={(event) => setAddonEnabled(event.target.value === "yes")}
          >
            <option value="no">Нет</option>
            <option value="yes">Да</option>
          </select>
        </label>
        {addonEnabled ? (
          <label>
            Кол-во аддонов
            <input
              aria-label="Кол-во аддонов"
              inputMode="numeric"
              min={1}
              name="maxAddons"
              pattern="[0-9]*"
              type="number"
              defaultValue={settings.maxAddons}
            />
          </label>
        ) : null}
      </div>
      <div className="logo-upload-section">
        <div className="panel-heading logo-upload-heading">
          <h2>🖼️ Загрузить ваш логотип</h2>
        </div>
        <div className="logo-upload">
          <div className="logo-preview">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Логотип турнира" src={previewUrl} />
            ) : (
              <span>здесь будет ваш логотип</span>
            )}
          </div>
          <div className="logo-upload-controls">
            <input
              accept="image/png"
              className="logo-file-input"
              name="logo"
              ref={logoInputRef}
              type="file"
              onChange={(event) => updateLogoUpload(event.target.files?.[0])}
            />
            <button
              className="logo-upload-button"
              type="button"
              onClick={() => logoInputRef.current?.click()}
            >
              🖼️ Загрузить логотип
            </button>
            <span className={logoError ? "logo-upload-status form-error" : "logo-upload-status"}>
              {logoError
                ? logoError
                : logoUpload
                  ? `Выбран: ${logoUpload.name}`
                  : "PNG до 4 MB"}
            </span>
            <label className="logo-url-field">
              Или ссылка на логотип
              <input
                name="logoUrl"
                defaultValue={tournament.logoUrl ?? ""}
                placeholder="https://..."
                type="url"
              />
            </label>
          </div>
        </div>
        <p className="field-help">Поддерживается формат PNG. Логотип отобразится на турнирном экране.</p>
      </div>

      <div className="sound-upload-section">
        <div className="panel-heading logo-upload-heading">
          <h2>🔊 Звук перед сменой блайндов</h2>
        </div>
        <div className="form-grid">
          <label>
            Звук перед сменой
            <select
              aria-label="Звук перед сменой блайндов"
              name="blindAlertSound"
              defaultValue={settings.blindAlertSound}
            >
              {blindAlertSounds.map((sound) => (
                <option key={sound} value={sound}>
                  {blindAlertSoundLabels[sound]}
                </option>
              ))}
            </select>
          </label>
          <label>
            За сколько секунд
            <input
              aria-label="За сколько секунд до смены блайндов играть звук"
              inputMode="numeric"
              max={300}
              min={1}
              name="blindAlertSeconds"
              pattern="[0-9]*"
              type="number"
              defaultValue={settings.blindAlertSeconds}
            />
          </label>
        </div>
        <div className="logo-upload">
          <div className="logo-upload-controls" style={{ marginLeft: 0 }}>
            <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Загрузить свой сигнал</span>
            <input
              accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.m4a"
              className="logo-file-input"
              name="blindAlertFile"
              ref={soundInputRef}
              type="file"
              onChange={(event) => updateSoundUpload(event.target.files?.[0])}
            />
            <button
              className="logo-upload-button"
              type="button"
              onClick={() => soundInputRef.current?.click()}
            >
              🔊 Выбрать файл
            </button>
            <span className={soundError ? "logo-upload-status form-error" : "logo-upload-status"}>
              {soundError
                ? soundError
                : soundFile
                  ? `Выбран: ${soundFile.name}`
                  : settings.blindAlertCustomSoundName
                    ? `Загружен: ${settings.blindAlertCustomSoundName}`
                    : "MP3, WAV, OGG, M4A до 1 MB"}
            </span>
          </div>
        </div>
      </div>

      <div className="public-link-box">
        <span>{publicUrl}</span>
      </div>
      <div className="button-row">
        <button className="gold-button" type="submit">
          Сохранить
        </button>
        <CopyPublicLinkButton value={publicUrl} />
      </div>
    </form>
  );
}
