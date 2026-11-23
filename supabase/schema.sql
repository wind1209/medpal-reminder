-- 慢病用药提醒助手 · Supabase 数据库结构
-- 用法：Supabase 控制台 → SQL Editor → 新建查询 → 粘贴本文件 → Run
-- 所有表都启用行级安全（RLS），用户只能读写自己的数据。

create extension if not exists "pgcrypto";

-- ---------- 药品 ----------
create table if not exists public.medications (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  name       text not null,
  alias      text default '',
  spec       text default '',
  category   text default '其他',
  form       text default '片剂',
  usage_text text default '',
  stock      numeric default 0,
  low_stock  numeric default 5,
  note       text default '',
  art        text default '',
  source     text default 'manual',
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, id)
);

-- ---------- 用药计划 ----------
create table if not exists public.plans (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  med_id     text not null,
  per_dose   numeric default 1,
  unit       text default '片',
  times      text[] default array['08:00'],
  food       text default 'any',
  start_date date default current_date,
  end_date   date,
  remind     boolean default true,
  active     boolean default true,
  updated_at timestamptz default now(),
  primary key (user_id, id)
);

-- ---------- 服药记录 ----------
create table if not exists public.dose_logs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  med_id     text not null,
  plan_id    text not null,
  dose_date  date not null,
  dose_time  text not null,
  status     text not null check (status in ('taken', 'missed', 'skipped')),
  amount     numeric default 1,
  taken_at   timestamptz,
  note       text default '',
  updated_at timestamptz default now(),
  primary key (user_id, id)
);

-- ---------- 问答记录 ----------
create table if not exists public.chat_messages (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  engine     text default 'offline',
  created_at timestamptz default now(),
  primary key (user_id, id)
);

-- ---------- 应用设置 ----------
create table if not exists public.app_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  device_id  text default '',
  payload    jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

create index if not exists dose_logs_user_date_idx on public.dose_logs (user_id, dose_date desc);
create index if not exists plans_user_med_idx on public.plans (user_id, med_id);
create index if not exists chat_user_created_idx on public.chat_messages (user_id, created_at);

-- ---------- 行级安全 ----------
alter table public.medications   enable row level security;
alter table public.plans         enable row level security;
alter table public.dose_logs     enable row level security;
alter table public.chat_messages enable row level security;
alter table public.app_settings  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['medications', 'plans', 'dose_logs', 'chat_messages', 'app_settings']
  loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);

    execute format(
      'create policy "own_select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy "own_insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own_update" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "own_delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------- 邮箱验证码登录 ----------
-- Supabase 控制台 → Authentication → Providers → Email：
--   开启 Email provider；关闭 "Confirm email" 之外无需改动；
--   本应用使用 signInWithOtp + verifyOtp(type: 'email')，即邮箱 6 位验证码登录。
-- Authentication → URL Configuration：把站点地址填入 Site URL 与 Redirect URLs。