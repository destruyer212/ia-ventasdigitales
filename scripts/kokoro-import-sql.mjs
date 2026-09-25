import { kokoroImportedServices } from '../src/kokoroProducts.js';

const userId = process.env.QYRO_USER_ID;
if (!userId) {
  throw new Error('Set QYRO_USER_ID before generating the import SQL.');
}

const json = JSON.stringify(kokoroImportedServices);

console.log(`
insert into public.providers (user_id, name, note)
values
  ('${userId}', 'Shop_KOKORO', 'Proveedor principal del catalogo Shop_KOKORO'),
  ('${userId}', 'EM STORE', 'Proveedor base'),
  ('${userId}', 'QAMIFY', 'Proveedor base')
on conflict (user_id, name) do update set note = excluded.note;

update public.services
set provider = 'Shop_KOKORO', stock = coalesce(stock, 0)
where user_id = '${userId}' and (provider is null or provider = '');

with incoming as (
  select *
  from jsonb_to_recordset($json$${json}$json$::jsonb) as x(
    name text,
    description text,
    category text,
    provider text,
    stock int,
    "costUsd" numeric,
    price numeric,
    duration int,
    slots int
  )
),
updated as (
  update public.services s
  set
    description = coalesce(i.description, ''),
    category = coalesce(i.category, 'Otros'),
    provider = coalesce(i.provider, 'Shop_KOKORO'),
    stock = coalesce(i.stock, 0),
    cost_usd = coalesce(i."costUsd", 0),
    price_pen = coalesce(
      nullif(i.price, 0),
      case
        when coalesce(i."costUsd", 0) > 0
          then round(((i."costUsd" + 0.50) * 2 * 3.75 / greatest(coalesce(i.slots, 1), 1))::numeric, 2)
        else 0
      end
    ),
    duration_days = coalesce(i.duration, 30),
    slots = greatest(coalesce(i.slots, 1), 1)
  from incoming i
  where s.user_id = '${userId}' and lower(trim(s.name)) = lower(trim(i.name))
  returning lower(trim(s.name)) as name
)
insert into public.services (
  user_id,
  name,
  description,
  category,
  provider,
  stock,
  cost_usd,
  price_pen,
  duration_days,
  slots
)
select
  '${userId}',
  i.name,
  coalesce(i.description, ''),
  coalesce(i.category, 'Otros'),
  coalesce(i.provider, 'Shop_KOKORO'),
  coalesce(i.stock, 0),
  coalesce(i."costUsd", 0),
  coalesce(
    nullif(i.price, 0),
    case
      when coalesce(i."costUsd", 0) > 0
        then round(((i."costUsd" + 0.50) * 2 * 3.75 / greatest(coalesce(i.slots, 1), 1))::numeric, 2)
      else 0
    end
  ),
  coalesce(i.duration, 30),
  greatest(coalesce(i.slots, 1), 1)
from incoming i
where not exists (select 1 from updated u where u.name = lower(trim(i.name)))
  and not exists (
    select 1
    from public.services s
    where s.user_id = '${userId}' and lower(trim(s.name)) = lower(trim(i.name))
  );
`);
