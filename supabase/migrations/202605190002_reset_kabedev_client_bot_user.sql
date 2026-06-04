with forgotten_users as (
  update public.client_bot_users
  set
    display_name = null,
    pending_display_name = null,
    pending_profile_answers = '{}'::jsonb,
    profile_submitted_at = null,
    registered_player_id = null,
    registered_at = null,
    state = 'idle'
  where lower(coalesce(display_name, '')) = 'kabedev'
    or lower(coalesce(pending_display_name, '')) = 'kabedev'
    or lower(coalesce(username, '')) = 'kabedev'
  returning telegram_id
)
update public.tournament_extras
set data = jsonb_set(
  data,
  '{players}',
  coalesce(
    (
      select jsonb_agg(player)
      from jsonb_array_elements(coalesce(data->'players', '[]'::jsonb)) as player
      where lower(coalesce(player->>'name', '')) <> 'kabedev'
        and not exists (
          select 1
          from forgotten_users
          where (player->>'telegramId') ~ '^\d+$'
            and (player->>'telegramId')::bigint = forgotten_users.telegram_id
        )
    ),
    '[]'::jsonb
  ),
  true
)
where exists (
  select 1
  from jsonb_array_elements(coalesce(data->'players', '[]'::jsonb)) as player
  where lower(coalesce(player->>'name', '')) = 'kabedev'
    or exists (
      select 1
      from forgotten_users
      where (player->>'telegramId') ~ '^\d+$'
        and (player->>'telegramId')::bigint = forgotten_users.telegram_id
    )
);
