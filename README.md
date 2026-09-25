# IA Ventas Digitales

Sistema web para controlar ventas de IA, streaming y cuentas compartidas.

## Logica del sistema

- Servicios: define lo que vendes, costo, precio y duracion.
- Ventas: registra cliente, WhatsApp, cuenta asignada, inicio, vencimiento, costo en dolares y venta en soles.
- Ganancias: calcula automaticamente venta en soles menos costo convertido desde dolares.
- Alertas: marca activo, vence hoy, vence pronto o vencido.
- Cuentas: guarda correo, clave, PIN, perfil y notas internas.

## Ejecutar local

```bash
npm install
npm run dev
```

## Variables de Supabase

Crea un archivo `.env` local copiando `.env.example`:

```bash
VITE_SUPABASE_URL=https://zikinzvbvpkeuwuuldow.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_public_key
```

En Vercel agrega esas mismas variables en Project Settings > Environment Variables.

No uses la contrasena de Postgres en el frontend. La app web usa `anon public key` + Supabase Auth + RLS.

## Subir a Vercel

1. Sube este proyecto a GitHub.
2. Entra a Vercel y elige `New Project`.
3. Importa el repositorio.
4. Framework: Vite.
5. Build command: `npm run build`.
6. Output directory: `dist`.

## Recomendacion para nube gratis

Esta primera version guarda datos en el navegador con `localStorage`. Eso sirve para probar la logica y el diseño.

Para usarla desde varios celulares o computadoras con los mismos datos, conecta Supabase:

- Vercel: muestra la web.
- Supabase Auth: controla tu inicio de sesion.
- Supabase Database: guarda servicios, cuentas, clientes y ventas.
- Supabase RLS: evita que otra persona vea tus datos.
- Supabase Edge Function: ideal para cifrar/descifrar contrasenas sin exponer la llave en el navegador.

Vercel aguanta muy bien la web gratis, pero no debe ser tu base de datos. Vercel muestra la app; Supabase guarda los datos.

## Modelo recomendado para Supabase

```sql
create table services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  category text not null,
  cost_usd numeric not null default 0,
  price_pen numeric not null default 0,
  duration_days int not null default 30,
  created_at timestamptz not null default now()
);

create table master_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  service_id uuid references services(id),
  email text not null,
  encrypted_password text,
  recovery_note text,
  supplier text,
  max_profiles int not null default 1,
  note text,
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  service_id uuid references services(id),
  master_account_id uuid references master_accounts(id),
  client_name text not null,
  client_phone text,
  profile_name text,
  profile_pin text,
  starts_at date not null,
  ends_at date not null,
  cost_usd numeric not null default 0,
  exchange_rate numeric not null default 3.75,
  price_pen numeric not null default 0,
  paid boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
```

Logica clave: una fila de `master_accounts` puede tener muchas filas en `sales`. Asi un correo de Amazon puede estar ligado a muchos clientes/perfiles, cada uno con su propio PIN, vencimiento y ganancia.

Logica de moneda: el proveedor se paga en dolares (`cost_usd`), el cliente paga en soles (`price_pen`), y cada venta guarda su propio `exchange_rate`. La ganancia real se calcula asi:

```text
ganancia_soles = price_pen - (cost_usd * exchange_rate)
```

Para contrasenas reales, no guardes texto plano. Guarda `encrypted_password` cifrado desde una Edge Function o desde tu backend, y deja visible en pantalla solo cuando el usuario lo pida.
