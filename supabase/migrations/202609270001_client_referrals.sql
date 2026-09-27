-- Кто пригласил игрока в клуб.
--
-- В анкете новичка появился необязательный вопрос «Если вас пригласил игрок, что состоит
-- в клубе — укажите его ник». Ответ ложится в анкету текстом (`pending_profile_answers ->
-- 'invitedBy'`), а связь с аккаунтом пригласившего — сюда. По ней потом считаются
-- достижения за активность приглашённых: ник можно сменить, аккаунт остаётся тем же.
--
-- Игроки связь не видят нигде: клиентские роуты перечисляют колонки поимённо, этой в них
-- нет.
--
-- Приложение пишет связь отдельным запросом после сохранения анкеты, поэтому регистрация
-- не падает, пока миграция не применена. Кто успел заполнить анкету в этом промежутке,
-- получит связь из текста ответа — последний шаг ниже.
--
-- Применять вручную в Supabase SQL editor. Повторный запуск безопасен.

alter table public.client_bot_users
  add column if not exists referred_by_user_id uuid
    references public.client_bot_users(id) on delete set null
    constraint client_bot_users_not_own_referral check (referred_by_user_id <> id);

create index if not exists client_bot_users_referred_by_user_id_idx
  on public.client_bot_users (referred_by_user_id);

-- Анкеты, заполненные до миграции. Ключ ника — то же выражение, что у `nickname_key`
-- (202609030001); пригласивший — игрок клуба с заполненной анкетой, как в приложении.
update public.client_bot_users as referral
set referred_by_user_id = referrer.id
from public.client_bot_users as referrer
where referral.referred_by_user_id is null
  and coalesce(referral.pending_profile_answers ->> 'invitedBy', '') <> ''
  and referrer.nickname_key = regexp_replace(
    lower(referral.pending_profile_answers ->> 'invitedBy'),
    '[^a-z0-9а-яё]',
    '',
    'g'
  )
  and referrer.id <> referral.id
  and referrer.profile_submitted_at is not null;
