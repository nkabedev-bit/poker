"use client";

import { useRef, useState } from "react";
import { CopyPublicLinkButton } from "@/components/admin/copy-public-link-button";
import { blindAlertSounds } from "@/lib/timer/blind-alert";
import type {
  BlindAlertSound,
  BountyType,
  Tournament,
  TournamentExtras,
  TournamentFormat,
  TournamentPresetName,
} from "@/lib/timer/types";

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

type BountyMode = "off" | BountyType;

type TournamentPreset = {
  addonEnabled: boolean;
  bountyMode: BountyMode;
  label: string;
  maxAddons: number;
  maxReentries: number;
  startingStack: number;
  tournamentFormat: TournamentFormat;
};

// Presets for the tournaments the club actually runs. Picking one only PREFILLS the
// fields below — whatever the admin saves last wins, so every value stays editable.
const tournamentPresets: Record<TournamentPresetName, TournamentPreset> = {
  phoenix: {
    addonEnabled: false,
    bountyMode: "off",
    label: "Феникс",
    maxAddons: 1,
    maxReentries: 1,
    startingStack: 2000,
    tournamentFormat: "phoenix",
  },
  deepstack: {
    addonEnabled: false,
    bountyMode: "off",
    label: "Дип стек",
    maxAddons: 1,
    maxReentries: 2,
    startingStack: 4000,
    tournamentFormat: "deepstack",
  },
  bounty: {
    addonEnabled: true,
    bountyMode: "standard",
    label: "Обычный баунти",
    maxAddons: 1,
    maxReentries: 2,
    startingStack: 2000,
    tournamentFormat: "regular",
  },
  progressive: {
    addonEnabled: true,
    bountyMode: "progressive",
    label: "Прогрессив",
    maxAddons: 1,
    maxReentries: 2,
    startingStack: 2000,
    tournamentFormat: "regular",
  },
  mystery: {
    addonEnabled: true,
    bountyMode: "mystery",
    label: "Мистери",
    maxAddons: 1,
    maxReentries: 2,
    startingStack: 2000,
    tournamentFormat: "regular",
  },
  freeroll: {
    addonEnabled: true,
    bountyMode: "off",
    label: "Фриролл",
    maxAddons: 1,
    maxReentries: 2,
    startingStack: 2000,
    tournamentFormat: "freeroll",
  },
  lastchance: {
    addonEnabled: true,
    bountyMode: "off",
    label: "Ласт ченс",
    maxAddons: 1,
    maxReentries: 2,
    startingStack: 2000,
    tournamentFormat: "regular",
  },
};

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
  const [maxReentries, setMaxReentries] = useState(settings.maxReentries);
  const [tournamentFormat, setTournamentFormat] = useState<TournamentFormat>(
    settings.tournamentFormat ?? "regular",
  );
  const [maxAddons, setMaxAddons] = useState(settings.maxAddons);
  const [bountyMode, setBountyMode] = useState<BountyMode>(
    settings.isBounty ? settings.bountyType : "off",
  );
  const [startingStack, setStartingStack] = useState(tournament.startingStack);
  // The picked type is saved with the tournament: it names the game (and so the medal its
  // winner earns), while the fields below stay free to edit afterwards.
  const [presetName, setPresetName] = useState<string>(settings.tournamentPreset ?? "");

  function applyPreset(name: string) {
    setPresetName(name);
    const preset = tournamentPresets[name as TournamentPresetName];
    if (!preset) return;

    setAddonEnabled(preset.addonEnabled);
    setBountyMode(preset.bountyMode);
    setMaxAddons(preset.maxAddons);
    setMaxReentries(preset.maxReentries);
    setReentryEnabled(true);
    setStartingStack(preset.startingStack);
    setTournamentFormat(preset.tournamentFormat);
  }

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
            value={startingStack}
            onChange={(event) => setStartingStack(Number(event.target.value) || 0)}
            required
          />
        </label>
        <label>
          ⚡ Тип турнира
          <select
            aria-label="Тип турнира"
            name="tournamentPreset"
            value={presetName}
            onChange={(event) => applyPreset(event.target.value)}
          >
            <option value="">Не выбран</option>
            {Object.entries(tournamentPresets).map(([name, preset]) => (
              <option key={name} value={name}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          🏆 Формат турнира
          <select
            aria-label="Формат турнира"
            name="tournamentFormat"
            value={tournamentFormat}
            onChange={(event) => setTournamentFormat(event.target.value as TournamentFormat)}
          >
            <option value="regular">Обычный</option>
            <option value="phoenix">PHOENIX</option>
            <option value="deepstack">DEEP STACK</option>
            <option value="freeroll">FREEROLL</option>
          </select>
        </label>
        <label>
          🎯 Баунти
          <select
            aria-label="Тип баунти"
            name="bountyMode"
            value={bountyMode}
            onChange={(event) => setBountyMode(event.target.value as BountyMode)}
          >
            <option value="off">Нет</option>
            <option value="standard">Обычный баунти</option>
            <option value="progressive">Progressive Bounty</option>
            <option value="mystery">Mystery Bounty</option>
            <option value="dealer">Dealer Revenge</option>
            <option value="wanted">Wanted Bounty</option>
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
              value={maxReentries}
              onChange={(event) => setMaxReentries(Number(event.target.value) || 1)}
            />
            {bountyMode === "progressive" || bountyMode === "wanted" ? (
              <span className="field-help">
                В этом режиме ре-энтри безлимитные, пока открыто окно — лимит не действует
              </span>
            ) : null}
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
              value={maxAddons}
              onChange={(event) => setMaxAddons(Number(event.target.value) || 1)}
            />
          </label>
        ) : null}
      </div>
      <div className="panel-heading">
        <h2>💰 Цены</h2>
      </div>
      <div className="form-grid">
        <label>
          Билет, ₽
          <input
            aria-label="Цена билета"
            defaultValue={settings.buyIn}
            inputMode="numeric"
            min={0}
            name="buyIn"
            type="number"
          />
        </label>
        <label>
          VIP билет, ₽
          <input
            aria-label="Цена VIP билета"
            defaultValue={settings.vipBuyIn}
            inputMode="numeric"
            min={0}
            name="vipBuyIn"
            type="number"
          />
        </label>
        <label>
          Ре-энтри, ₽
          <input
            aria-label="Цена ре-энтри"
            defaultValue={settings.rebuyPrice}
            inputMode="numeric"
            min={0}
            name="rebuyPrice"
            type="number"
          />
        </label>
        <label>
          Двойной ре-энтри, ₽
          <input
            aria-label="Цена двойного ре-энтри"
            defaultValue={settings.doubleRebuyPrice}
            inputMode="numeric"
            min={0}
            name="doubleRebuyPrice"
            type="number"
          />
        </label>
        <label>
          Аддон, ₽
          <input
            aria-label="Цена аддона"
            defaultValue={settings.addonPrice}
            inputMode="numeric"
            min={0}
            name="addonPrice"
            type="number"
          />
        </label>
      </div>
      <p className="field-help">
        По этим ценам считается финансовая таблица. Во FREEROLL билет не начисляется.
      </p>

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
