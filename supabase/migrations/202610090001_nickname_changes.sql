-- Смена ника самим игроком из мини-аппа.
--
-- Ник — не просто подпись: профиль, рейтинг, медали и достижения находят игры игрока
-- «по Telegram id ИЛИ по ключу ника» (lib/results/player-stats.ts). У веб-игрока без
-- Telegram и у вечеров, перенесённых из старых таблиц, кроме ника ничего нет. Поэтому
-- одной смены display_name мало — история переименовывается вместе с аккаунтом, одной
-- транзакцией, как это делалось руками для Chura и Олюшки (scratch/chura-rename.sql).
--
-- nickname_changes — журнал смен: из него считается «раз в 30 дней», показывается
-- «ранее: …» на карточке игрока и отвечает команда /changes в админ-боте.
--
-- Приложение переживает отсутствие миграции: пока она не применена, кнопка смены ника
-- отвечает, что функция ещё не включена, а остальное работает как раньше.
--
-- Применять вручную в SQL editor. Повторный запуск безопасен.

create table if not exists public.nickname_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.client_bot_users(id) on delete cascade,
  old_name text not null,
  new_name text not null,
  -- Тот же ключ, что у client_bot_users.nickname_key: по нему старая ссылка на профиль
  -- игрока находит его под новым ником.
  old_key text generated always as (regexp_replace(lower(old_name), '[^a-z0-9а-яё]', '', 'g')) stored,
  changed_at timestamptz not null default now()
);

create index if not exists nickname_changes_user_idx
  on public.nickname_changes (user_id, changed_at desc);

create index if not exists nickname_changes_old_key_idx
  on public.nickname_changes (old_key, changed_at desc);

create index if not exists nickname_changes_changed_at_idx
  on public.nickname_changes (changed_at desc);

alter table public.nickname_changes enable row level security;

-- Читает и пишет только сервер приложения.
revoke all on table public.nickname_changes from anon, authenticated;
grant all on table public.nickname_changes to service_role;

-- Меняет ник игрока и переписывает под него всю историю.
--
-- Отвечает {ok: true, oldName, newName, availableAt} или {error: <код>}:
--   invalid    — в нике нет ни буквы, ни цифры;
--   no_profile — анкета не заполнена;
--   same       — ник не изменился;
--   cooldown   — с прошлой смены не прошло 30 дней (+ availableAt);
--   in_game    — игрок в рассадке текущего турнира: на финише результаты запишутся
--                по нику из рассадки;
--   taken      — ник занят другим аккаунтом или чужой историей игр;
--   conflict   — в истории два вечера, которые после смены совпали бы (правит админ).
create or replace function public.change_player_nickname(p_user_id uuid, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cooldown constant interval := interval '30 days';
  v_now timestamptz := now();
  v_new_name text := btrim(coalesce(p_nickname, ''));
  v_new_key text := regexp_replace(lower(btrim(coalesce(p_nickname, ''))), '[^a-z0-9а-яё]', '', 'g');
  v_account record;
  v_old_name text;
  v_old_key text;
  v_last_change timestamptz;
  v_reclaiming boolean;
  v_extras record;
  v_labels jsonb;
  v_carried_label jsonb;
begin
  if v_new_key = '' then
    return jsonb_build_object('error', 'invalid');
  end if;

  -- Два игрока, взявшие один ник в одну секунду: второй дождётся первого и увидит,
  -- что ник занят.
  perform pg_advisory_xact_lock(hashtext('nickname:' || v_new_key));

  -- Документ турнира — первым, как во всех правках турнира: проверка рассадки и перенос
  -- метки игрока не должны разойтись с регистрацией, идущей в ту же секунду.
  perform 1 from public.tournament_extras for update;

  select id, telegram_id, display_name, profile_submitted_at
  into v_account
  from public.client_bot_users
  where id = p_user_id
  for update;

  if not found or v_account.profile_submitted_at is null then
    return jsonb_build_object('error', 'no_profile');
  end if;

  v_old_name := btrim(coalesce(v_account.display_name, ''));
  v_old_key := regexp_replace(lower(v_old_name), '[^a-z0-9а-яё]', '', 'g');

  if v_new_name = v_old_name then
    return jsonb_build_object('error', 'same');
  end if;

  select max(changed_at) into v_last_change
  from public.nickname_changes
  where user_id = p_user_id;

  if v_last_change is not null and v_last_change + v_cooldown > v_now then
    return jsonb_build_object('error', 'cooldown', 'availableAt', v_last_change + v_cooldown);
  end if;

  if exists (
    select 1
    from public.tournament_extras as extras,
      jsonb_array_elements(
        case when jsonb_typeof(extras.data->'players') = 'array'
          then extras.data->'players' else '[]'::jsonb end
      ) as player
    where player->>'accountId' = p_user_id::text
      or (v_account.telegram_id is not null and player->>'telegramId' = v_account.telegram_id::text)
  ) then
    return jsonb_build_object('error', 'in_game');
  end if;

  if v_new_key <> v_old_key then
    if exists (
      select 1 from public.client_bot_users
      where nickname_key = v_new_key and id <> p_user_id
    ) then
      return jsonb_build_object('error', 'taken');
    end if;

    -- Свой прежний ник: вечера под ним без Telegram id и так считались его.
    v_reclaiming := exists (
      select 1 from public.nickname_changes
      where user_id = p_user_id and old_key = v_new_key
    );

    -- Чужая история под этим ником стала бы его историей: игры ищутся и по ключу ника.
    if exists (
      select 1 from public.tournament_results as result
      where result.player_key = v_new_key
        and (
          (result.telegram_id is not null and result.telegram_id is distinct from v_account.telegram_id)
          or (result.telegram_id is null and not v_reclaiming)
        )
    ) or exists (
      select 1 from public.season_standings as standing
      where regexp_replace(lower(standing.player_name), '[^a-z0-9а-яё]', '', 'g') = v_new_key
        and (
          (standing.telegram_id is not null and standing.telegram_id is distinct from v_account.telegram_id)
          or (standing.telegram_id is null and not v_reclaiming)
        )
    ) or (
      not v_reclaiming and exists (
        select 1 from public.monthly_rating_archive as archived
        where regexp_replace(lower(archived.player_name), '[^a-z0-9а-яё]', '', 'g') = v_new_key
      )
    ) then
      return jsonb_build_object('error', 'taken');
    end if;
  end if;

  begin
    update public.client_bot_users
    set display_name = v_new_name,
      -- Анкета в базе называет игрока тем же ником, что и аккаунт.
      pending_profile_answers = case
        when pending_profile_answers ? 'nickname'
          then jsonb_set(pending_profile_answers, '{nickname}', to_jsonb(v_new_name))
        else pending_profile_answers
      end
    where id = p_user_id;

    -- Вечера игрока: по Telegram id и по старому ключу ника, кроме строк с чужим id.
    update public.tournament_results
    set player_name = v_new_name
    where (v_account.telegram_id is not null and telegram_id = v_account.telegram_id)
      or (
        v_old_key <> ''
        and player_key = v_old_key
        and (telegram_id is null or telegram_id = v_account.telegram_id)
      );

    -- Закрытые сезоны и месячный архив: клуб решил, что старые таблицы показывают
    -- игрока под одним ником.
    update public.season_standings
    set player_name = v_new_name
    where (v_account.telegram_id is not null and telegram_id = v_account.telegram_id)
      or (
        v_old_key <> ''
        and regexp_replace(lower(player_name), '[^a-z0-9а-яё]', '', 'g') = v_old_key
        and (telegram_id is null or telegram_id = v_account.telegram_id)
      );

    update public.monthly_rating_archive
    set player_name = v_new_name
    where v_old_key <> ''
      and regexp_replace(lower(player_name), '[^a-z0-9а-яё]', '', 'g') = v_old_key;

    update public.raffle_winners
    set player_name = v_new_name
    where account_id = p_user_id
      or (
        account_id is null
        and (
          (v_account.telegram_id is not null and telegram_id = v_account.telegram_id)
          or (v_old_key <> '' and regexp_replace(lower(player_name), '[^a-z0-9а-яё]', '', 'g') = v_old_key)
        )
      );

    update public.player_debts
    set player_name = v_new_name
    where account_id = p_user_id or debtor_key = p_user_id::text;

    update public.debt_payments
    set player_name = v_new_name
    where account_id = p_user_id or debtor_key = p_user_id::text;

    -- Метка игрока («дилер», уровень) хранится по нику — trim + lower, как
    -- normalizePlayerLabelKey в lib/player-labels.ts. Она переезжает на новый ник, а
    -- метка, оставшаяся на новом нике от кого-то, снимается: этот ник теперь его.
    if lower(v_old_name) <> lower(v_new_name) then
      for v_extras in select tournament_id, data from public.tournament_extras loop
        v_labels := case when jsonb_typeof(v_extras.data->'playerLabels') = 'object'
          then v_extras.data->'playerLabels' else '{}'::jsonb end;
        v_carried_label := v_labels->lower(v_old_name);
        v_labels := (v_labels - lower(v_old_name)) - lower(v_new_name);

        if v_carried_label is not null then
          v_labels := v_labels || jsonb_build_object(lower(v_new_name), v_carried_label);
        end if;

        if v_labels is distinct from (v_extras.data->'playerLabels') then
          update public.tournament_extras
          set data = jsonb_set(data, '{playerLabels}', v_labels)
          where tournament_id = v_extras.tournament_id;
        end if;
      end loop;
    end if;

    insert into public.nickname_changes (user_id, old_name, new_name, changed_at)
    values (p_user_id, v_old_name, v_new_name, v_now);
  exception when unique_violation then
    return jsonb_build_object('error', 'conflict');
  end;

  return jsonb_build_object(
    'ok', true,
    'oldName', v_old_name,
    'newName', v_new_name,
    'availableAt', v_now + v_cooldown
  );
end;
$$;

revoke all on function public.change_player_nickname(uuid, text) from public, anon, authenticated;
grant execute on function public.change_player_nickname(uuid, text) to service_role;
