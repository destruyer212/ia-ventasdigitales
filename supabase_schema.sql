create extension if not exists pgcrypto;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'Streaming',
  cost_usd numeric(12,2) not null default 0,
  price_pen numeric(12,2) not null default 0,
  duration_days int not null default 30,
  slots int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.master_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name text,
  email text not null,
  encrypted_password text,
  recovery_note text,
  supplier text,
  max_profiles int not null default 1,
  starts_at date not null default current_date,
  duration_days int not null default 30,
  expires_at date generated always as (starts_at + duration_days) stored,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  master_account_id uuid references public.master_accounts(id) on delete set null,
  client_name text not null,
  client_phone text,
  service_name text,
  account_email text,
  profile_name text,
  profile_pin text,
  starts_at date not null,
  ends_at date not null,
  cost_usd numeric(12,2) not null default 0,
  exchange_rate numeric(10,4) not null default 3.75,
  price_pen numeric(12,2) not null default 0,
  slots int not null default 1,
  paid boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  exchange_rate numeric(10,4) not null default 3.75,
  updated_at timestamptz not null default now()
);

create index if not exists services_user_id_idx on public.services(user_id);
create index if not exists master_accounts_user_id_idx on public.master_accounts(user_id);
create index if not exists sales_user_id_idx on public.sales(user_id);
create index if not exists sales_ends_at_idx on public.sales(ends_at);
create index if not exists sales_master_account_id_idx on public.sales(master_account_id);

alter table public.services enable row level security;
alter table public.master_accounts enable row level security;
alter table public.sales enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Users can read own services" on public.services;
drop policy if exists "Users can insert own services" on public.services;
drop policy if exists "Users can update own services" on public.services;
drop policy if exists "Users can delete own services" on public.services;

create policy "Users can read own services"
  on public.services for select
  using (auth.uid() = user_id);

create policy "Users can insert own services"
  on public.services for insert
  with check (auth.uid() = user_id);

create policy "Users can update own services"
  on public.services for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own services"
  on public.services for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own master accounts" on public.master_accounts;
drop policy if exists "Users can insert own master accounts" on public.master_accounts;
drop policy if exists "Users can update own master accounts" on public.master_accounts;
drop policy if exists "Users can delete own master accounts" on public.master_accounts;

create policy "Users can read own master accounts"
  on public.master_accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own master accounts"
  on public.master_accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own master accounts"
  on public.master_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own master accounts"
  on public.master_accounts for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own sales" on public.sales;
drop policy if exists "Users can insert own sales" on public.sales;
drop policy if exists "Users can update own sales" on public.sales;
drop policy if exists "Users can delete own sales" on public.sales;

create policy "Users can read own sales"
  on public.sales for select
  using (auth.uid() = user_id);

create policy "Users can insert own sales"
  on public.sales for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sales"
  on public.sales for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own sales"
  on public.sales for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own settings" on public.user_settings;
drop policy if exists "Users can insert own settings" on public.user_settings;
drop policy if exists "Users can update own settings" on public.user_settings;

create policy "Users can read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace view public.sales_profit as
select
  id,
  user_id,
  client_name,
  service_name,
  starts_at,
  ends_at,
  cost_usd,
  exchange_rate,
  price_pen,
  (cost_usd * exchange_rate) as cost_pen,
  (price_pen - (cost_usd * exchange_rate)) as profit_pen,
  paid,
  created_at
from public.sales;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.master_accounts to authenticated;
grant select, insert, update, delete on public.sales to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select on public.sales_profit to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- Migracion para bases existentes (cuentas compartidas por cupos).
alter table public.services add column if not exists slots int not null default 1;
alter table public.sales add column if not exists slots int not null default 1;
