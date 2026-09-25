-- Cupos por cuenta (cuentas compartidas). Ejecutar una vez en Supabase > SQL Editor.
alter table public.services add column if not exists slots int not null default 1;
alter table public.sales add column if not exists slots int not null default 1;
