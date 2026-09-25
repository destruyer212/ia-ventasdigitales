import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  DollarSign,
  Download,
  Pencil,
  Save,
  Eye,
  EyeOff,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase, supabaseUrl } from './supabaseClient';
import { kokoroImportedServices } from './kokoroProducts';
import './styles.css';

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (date, days) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + Number(days));
  return value.toISOString().slice(0, 10);
};

const money = (value) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(Number(value || 0));

const usd = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value || 0));

const soles = (value) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

// Compra (precio proveedor USD) + $0.50 de conversion/impuesto = costo real. Venta referencial = costo real x2.
const PURCHASE_FEE_USD = 0.5;
const SALE_MULTIPLIER = 2;
const realCostUsd = (costUsd) => (Number(costUsd || 0) > 0 ? Number(costUsd) + PURCHASE_FEE_USD : 0);
const realCostPen = (costUsd, exchangeRate) => realCostUsd(costUsd) * Number(exchangeRate || 3.75);
const catalogSaleUsd = (costUsd) => realCostUsd(costUsd) * SALE_MULTIPLIER;
// Cuentas compartidas: el costo de la cuenta se reparte entre sus cupos (perfiles que vendes).
const slotsOf = (value) => Math.max(1, Math.floor(Number(value) || 1));
const catalogSalePen = (costUsd, exchangeRate, slots = 1) =>
  Number(((catalogSaleUsd(costUsd) * Number(exchangeRate || 3.75)) / slotsOf(slots)).toFixed(2));
const saleCostPen = (sale, exchangeRate) => realCostPen(sale.costUsd, sale.exchangeRate || exchangeRate) / slotsOf(sale.slots);
const hasRealAccount = (sale) => Boolean(sale.account) && sale.account !== 'Sin cuenta asignada';

// Agrupa las ventas por cuenta comprada. En una cuenta compartida el costo se paga UNA vez
// y se recupera con la suma de los cupos vendidos (si vendes 3 de 5 y ya cubriste el costo, no pierdes).
function buildAccountGroups(sales, exchangeRate) {
  const map = new Map();
  sales.forEach((sale) => {
    const cupos = slotsOf(sale.slots);
    const productKey = sale.serviceId || sale.service;
    const key =
      cupos === 1
        ? `sale:${sale.id}`
        : sale.accountId
          ? `acc:${sale.accountId}`
          : hasRealAccount(sale)
            ? `mail:${sale.account.toLowerCase()}|${productKey}`
            : `svc:${productKey}`;
    const group = map.get(key) || { key, service: sale.service, account: hasRealAccount(sale) ? sale.account : '', slots: 1, sales: [], revenue: 0, unitCost: 0 };
    group.sales.push(sale);
    group.slots = Math.max(group.slots, cupos);
    group.revenue += Number(sale.price || 0);
    group.unitCost = Math.max(group.unitCost, realCostPen(sale.costUsd, sale.exchangeRate || exchangeRate));
    map.set(key, group);
  });

  const groups = Array.from(map.values()).map((group) => {
    const sold = group.sales.length;
    const accountsBought = Math.max(1, Math.ceil(sold / group.slots));
    const cost = accountsBought * group.unitCost;
    const free = accountsBought * group.slots - sold;
    const avgPrice = sold ? group.revenue / sold : 0;
    const balance = group.revenue - cost;
    const projected = balance + free * avgPrice;
    const needed = balance < -0.005 && avgPrice > 0 ? Math.ceil(-balance / avgPrice - 1e-9) : 0;
    return { ...group, sold, accountsBought, cost, free, avgPrice, balance, projected, needed };
  });

  const bySale = new Map();
  groups.forEach((group) => group.sales.forEach((sale) => bySale.set(sale.id, group)));
  return { groups, bySale };
}

const explainError = (error) =>
  /slots/i.test(error?.message || '')
    ? 'Falta actualizar la base de datos: abre Supabase > SQL Editor y ejecuta el archivo supabase_cupos.sql (agrega la columna de cupos).'
    : error?.message;
const saleProfit = (sale, exchangeRate) => Number(sale.price || 0) - saleCostPen(sale, exchangeRate);
const durationToDays = (value, unit) => {
  const amount = Number(value || 0);
  if (unit === 'months') return amount * 30;
  if (unit === 'years') return amount * 365;
  return amount;
};
const durationUnits = ['days', 'months', 'years'];
const durationUnitLabels = ['Dias', 'Meses', 'Anos'];

const daysBetween = (from, to) => {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.ceil((end - start) / 86400000);
};

const baseProviders = ['Shop_KOKORO', 'EM STORE', 'QAMIFY'];
const emptyData = { settings: { exchangeRate: 3.75 }, services: [], accounts: [], sales: [], providers: [] };
const trustedEmailKey = 'qyro_trusted_email';

const serviceCategories = [
  'Streaming',
  'IA / Chatbots',
  'IA Creativa',
  'Productividad',
  'Diseno',
  'Musica',
  'VPN',
  'Educacion',
  'Desarrollo',
  'Gaming',
  'Correo / Cuentas',
  'Redes Sociales',
  'Otros',
];

const instagramServiceDescription = `Servicios de Instagram

Seguidores de alta calidad (HQ). Servicio compatible con el algoritmo, disenado para aumentar el prestigio de tu perfil y tus tasas de interaccion.

Detalles del servicio:
- Perfiles de calidad: entregados via HQ, con foto de perfil.
- Entrega rapida: tu orden se procesa de inmediato.
- Mas interaccion: tu cuenta se ve mas popular.
- Impresiones: aumenta las posibilidades de llegar a Explorar.
- Garantia: 30 dias por caidas.
- 100% seguro: nunca pedimos tu contrasena, solo tu usuario.
- Soporte 24/7.

Antes de ordenar:
- Tu cuenta debe estar en publico.
- No cambies tu nombre de usuario.
- Puede haber caidas, por eso enviamos entre 20% y 40% mas seguidores.

Despues de pagar, se pedira tu usuario de Instagram, por ejemplo @tuusuario.

Servicio rapido, seguro y confiable.`;

const tiktokServiceDescription = `Servicios de TikTok

Seguidores de alta calidad (HQ). Servicio compatible con el algoritmo, disenado para aumentar el prestigio de tu perfil y tus tasas de interaccion.

Detalles del servicio:
- Perfiles de calidad: entregados via HQ, con foto de perfil.
- Entrega rapida: tu orden se procesa de inmediato.
- Mas interaccion: tu cuenta se ve mas popular.
- Impresiones: aumenta las posibilidades de llegar a Explorar.
- Garantia: 30 dias por caidas.
- 100% seguro: nunca pedimos tu contrasena, solo tu usuario.
- Soporte 24/7.

Antes de ordenar:
- Tu cuenta debe estar en publico.
- No cambies tu nombre de usuario.
- Puede haber caidas, por eso enviamos entre 20% y 40% mas seguidores.

Despues de pagar, se pedira tu usuario de TikTok, por ejemplo @tuusuario.

Servicio rapido, seguro y confiable.`;

const claudeTokenDescription = `Productos disponibles - Claude Tokens

Producto oficial de la tienda. Entrega automatica instantanea.

Descripcion:
- Paquete de tokens Claude segun el plan elegido.
- Modelos: 29 modelos, Claude Opus, Sonnet y Haiku.
- Base URL: https://api.nghimmo.com/v1
- Modelos completos e instrucciones: api.nghimmo.com/huongdan
- Verifica tu KEY en: api.nghimmo.com/check

Garantia y reembolso:
- Condicion: dentro del periodo de garantia.
- Reembolso segun los tokens sin usar.

Compra con confianza en KOKORO SHOP. Servicio rapido, seguro y confiable. Entrega automatica despues de la confirmacion del pago.`;

const codexTokenDescription = `Productos disponibles - Codex Tokens

Producto oficial de la tienda. Entrega automatica instantanea.

Descripcion:
- Paquete de tokens Codex segun el plan elegido.
- Modelos: ultima version gpt-5.6 (sol-terra), gpt-5.5, gpt-5.4 y mas.
- Base URL: https://api.nghimmo.com/v1
- Modelos completos e instrucciones: api.nghimmo.com/huongdan
- Verifica tu KEY en: api.nghimmo.com/check

Garantia y reembolso:
- Condicion: dentro del periodo de garantia.
- Reembolso segun los tokens sin usar.

Compra con confianza en KOKORO SHOP. Servicio rapido, seguro y confiable. Entrega automatica despues de la confirmacion del pago.`;

const baseSampleServices = [
  { name: 'Disney 4 Plans', category: 'Streaming', costUsd: 0, price: 0, duration: 30 },
  { name: 'Prime Video 2 Plans', category: 'Streaming', costUsd: 0, price: 0, duration: 30 },
  { name: 'Max Plan Standar SBB 1M', category: 'Streaming', costUsd: 2.5, price: 0, duration: 30 },
  { name: 'Link Apple TV 1M', category: 'Streaming', costUsd: 1.5, price: 0, duration: 30 },
  { name: 'Link YouTube Premium 3M', category: 'Streaming', costUsd: 2.9, price: 0, duration: 90 },
  { name: 'Zoom PRO 2 Plans', category: 'Productividad', costUsd: 0, price: 0, duration: 30 },
  { name: 'Apple Music 5M', category: 'Musica', costUsd: 2, price: 0, duration: 150 },
  { name: 'Code Spotify Premium 3M', category: 'Musica', costUsd: 1, price: 0, duration: 90 },
  { name: 'ChatGPT Free Account + Hotmail', category: 'IA / Chatbots', costUsd: 0, price: 0, duration: 30 },
  { name: 'ChatGPT PLUS 3 Plans', category: 'IA / Chatbots', costUsd: 0, price: 0, duration: 30 },
  { name: 'ChatGPT Trial 1 Month Offer', category: 'IA / Chatbots', costUsd: 0, price: 0, duration: 30 },
  { name: 'Gemini AI PRO 3M', category: 'IA / Chatbots', costUsd: 1, price: 0, duration: 90 },
  { name: 'Gemini AI PRO 18M', category: 'IA / Chatbots', costUsd: 1.35, price: 0, duration: 540 },
  { name: 'Google AI Pro 12M', category: 'IA / Chatbots', costUsd: 15, price: 0, duration: 365 },
  { name: 'API Tokens Claude, Codex y Cursor', category: 'IA / Chatbots', costUsd: 0, price: 0, duration: 30 },
  { name: 'Super Grok 9-10 Days', category: 'IA / Chatbots', costUsd: 4.62, price: 0, duration: 10 },
  { name: 'Perplexity Pro 1M', category: 'IA / Chatbots', costUsd: 7.8, price: 0, duration: 30 },
  { name: 'Leonardo AI 2 Plans', category: 'IA Creativa', costUsd: 0, price: 0, duration: 30 },
  { name: 'ElevenLabs Creator 3M', category: 'IA Creativa', costUsd: 14.3, price: 0, duration: 90 },
  { name: 'Runway Pro 12M', category: 'IA Creativa', costUsd: 27, price: 0, duration: 365 },
  { name: 'Manus Pro 12M', category: 'IA Creativa', costUsd: 39, price: 0, duration: 365 },
  { name: 'Higgsfield Plus 12M', category: 'IA Creativa', costUsd: 85, price: 0, duration: 365 },
  { name: 'Adobe Creative Cloud 3 Plans', category: 'Diseno', costUsd: 0, price: 0, duration: 30 },
  { name: 'Photoshop 6M Web', category: 'Diseno', costUsd: 0.9, price: 0, duration: 180 },
  { name: 'Canva 3 Plans', category: 'Diseno', costUsd: 0, price: 0, duration: 30 },
  { name: 'Figma Pro 2 Year', category: 'Diseno', costUsd: 6.3, price: 0, duration: 730 },
  { name: 'Capcut PRO 5 Plans', category: 'Diseno', costUsd: 0, price: 0, duration: 30 },
  { name: 'Framer Pro 12M', category: 'Diseno', costUsd: 6.5, price: 0, duration: 365 },
  { name: 'Gamma Pro 12M', category: 'Productividad', costUsd: 15.6, price: 0, duration: 365 },
  { name: 'Notion Business 2 Plans', category: 'Productividad', costUsd: 0, price: 0, duration: 30 },
  { name: 'QuillBot Premium 1M', category: 'Productividad', costUsd: 1.75, price: 0, duration: 30 },
  { name: 'iLovePDF Premium 1Y', category: 'Productividad', costUsd: 1.48, price: 0, duration: 365 },
  { name: 'Descript Creator 12M', category: 'Productividad', costUsd: 19.5, price: 0, duration: 365 },
  { name: 'Granola Business 1M', category: 'Productividad', costUsd: 3.9, price: 0, duration: 30 },
  { name: 'Brain FM 3M', category: 'Productividad', costUsd: 1.5, price: 0, duration: 90 },
  { name: 'Headspace 4M', category: 'Productividad', costUsd: 0.3, price: 0, duration: 120 },
  { name: 'N8N Starter 12M', category: 'Desarrollo', costUsd: 12, price: 0, duration: 365 },
  { name: 'Replit Core 12M', category: 'Desarrollo', costUsd: 26, price: 0, duration: 365 },
  { name: 'Factory 12M', category: 'Desarrollo', costUsd: 32.5, price: 0, duration: 365 },
  { name: 'Warp Build 12M', category: 'Desarrollo', costUsd: 9.1, price: 0, duration: 365 },
  { name: 'Railway Hobby 12M', category: 'Desarrollo', costUsd: 10.4, price: 0, duration: 365 },
  { name: 'Gumloop Pro 12M', category: 'Desarrollo', costUsd: 6, price: 0, duration: 365 },
  { name: 'Bolt.new Pro 12M', category: 'Desarrollo', costUsd: 23.4, price: 0, duration: 365 },
  { name: 'Pangram Pro 12M', category: 'Desarrollo', costUsd: 10.4, price: 0, duration: 365 },
  { name: 'Mobbin 10x Seat 12M', category: 'Diseno', costUsd: 9.1, price: 0, duration: 365 },
  { name: 'ChatPRD 12M', category: 'Productividad', costUsd: 4.5, price: 0, duration: 365 },
  { name: 'Supabase Pro', category: 'Desarrollo', costUsd: 26, price: 0, duration: 30 },
  { name: 'Lovable 2 Plans', category: 'Desarrollo', costUsd: 0, price: 0, duration: 30 },
  { name: 'Hotmail Outlook Account', category: 'Correo / Cuentas', costUsd: 0.1, price: 0, duration: 30 },
  { name: 'Windows - Microsoft 20 Plans', category: 'Correo / Cuentas', costUsd: 0, price: 0, duration: 30 },
  { name: 'Facebook Business Manager', category: 'Redes Sociales', costUsd: 30, price: 0, duration: 30 },
  { name: 'LinkedIn Sales Navigator 2M New User', category: 'Redes Sociales', costUsd: 0, price: 0, duration: 60 },
  { name: '400+ Groups Telegram', category: 'Redes Sociales', costUsd: 15, price: 0, duration: 30 },
  { name: 'Redes Sociales 18 Plans', category: 'Redes Sociales', costUsd: 0, price: 0, duration: 30 },
  { name: 'Instagram 1K Seguidores HQ', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 4, price: 0, duration: 30 },
  { name: 'Instagram 5K Seguidores HQ', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 7, price: 0, duration: 30 },
  { name: 'Instagram 10K Seguidores HQ', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 11, price: 0, duration: 30 },
  { name: 'Instagram 20K Seguidores HQ', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 20, price: 0, duration: 30 },
  { name: 'Instagram 50K Seguidores HQ', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 40, price: 0, duration: 30 },
  { name: 'Instagram 100K Seguidores HQ', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 70, price: 0, duration: 30 },
  { name: 'Instagram 100K Reproducciones', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 3, price: 0, duration: 30 },
  { name: 'Instagram 5K Me gusta', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 2, price: 0, duration: 30 },
  { name: 'Instagram 10K Me gusta', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 3.5, price: 0, duration: 30 },
  { name: 'Instagram 100K Me gusta', description: instagramServiceDescription, category: 'Redes Sociales', costUsd: 15, price: 0, duration: 30 },
  { name: 'TikTok 1K Seguidores HQ', description: tiktokServiceDescription, category: 'Redes Sociales', costUsd: 8, price: 0, duration: 30 },
  { name: 'TikTok 2K Seguidores HQ', description: tiktokServiceDescription, category: 'Redes Sociales', costUsd: 15, price: 0, duration: 30 },
  { name: 'TikTok 5K Seguidores HQ', description: tiktokServiceDescription, category: 'Redes Sociales', costUsd: 35, price: 0, duration: 30 },
  { name: 'TikTok 10K Reproducciones', description: tiktokServiceDescription, category: 'Redes Sociales', costUsd: 2, price: 0, duration: 30 },
  { name: 'TikTok 100K Reproducciones', description: tiktokServiceDescription, category: 'Redes Sociales', costUsd: 15, price: 0, duration: 30 },
  { name: 'TikTok 1K Me gusta', description: tiktokServiceDescription, category: 'Redes Sociales', costUsd: 2, price: 0, duration: 30 },
  { name: 'TikTok 5K Me gusta', description: tiktokServiceDescription, category: 'Redes Sociales', costUsd: 8, price: 0, duration: 30 },
  { name: 'TikTok 10K Me gusta', description: tiktokServiceDescription, category: 'Redes Sociales', costUsd: 15, price: 0, duration: 30 },
  { name: 'API 10M Token Claude 1D (FW)', description: claudeTokenDescription, category: 'IA / Chatbots', costUsd: 2, price: 0, duration: 1 },
  { name: 'API 50M Token Claude 1D (FW)', description: claudeTokenDescription, category: 'IA / Chatbots', costUsd: 3.97, price: 0, duration: 1 },
  { name: 'API 100M Token Claude 1D (FW)', description: claudeTokenDescription, category: 'IA / Chatbots', costUsd: 4.94, price: 0, duration: 1 },
  { name: 'API Claude 100M 30Day (10DW)', description: claudeTokenDescription, category: 'IA / Chatbots', costUsd: 6.3, price: 0, duration: 30 },
  { name: 'API Claude 500M 30Day (10DW)', description: claudeTokenDescription, category: 'IA / Chatbots', costUsd: 18, price: 0, duration: 30 },
  { name: 'API 10M Token Codex 1D (FW)', description: codexTokenDescription, category: 'IA / Chatbots', costUsd: 1.72, price: 0, duration: 1 },
  { name: 'API 50M Token Codex 1D (FW)', description: codexTokenDescription, category: 'IA / Chatbots', costUsd: 2.82, price: 0, duration: 1 },
  { name: 'API 100M Token Codex 1D (FW)', description: codexTokenDescription, category: 'IA / Chatbots', costUsd: 3.97, price: 0, duration: 1 },
  { name: 'API 200M Token Codex 7D (FW)', description: codexTokenDescription, category: 'IA / Chatbots', costUsd: 12.22, price: 0, duration: 7 },
  { name: 'API 300M Token Codex 15D (FW)', description: codexTokenDescription, category: 'IA / Chatbots', costUsd: 17.14, price: 0, duration: 15 },
  { name: 'API 500M Token Codex 30D (FW)', description: codexTokenDescription, category: 'IA / Chatbots', costUsd: 22.96, price: 0, duration: 30 },
  { name: 'Discord Nitro 3M Code', category: 'Gaming', costUsd: 1.34, price: 0, duration: 90 },
  { name: 'Roblox GiftCards 3 Plans', category: 'Gaming', costUsd: 0, price: 0, duration: 30 },
  { name: 'Steam Account', category: 'Gaming', costUsd: 2, price: 0, duration: 30 },
  { name: 'Duolingo 2 Plans', category: 'Educacion', costUsd: 0, price: 0, duration: 30 },
  { name: 'Coursera Premium 12M', category: 'Educacion', costUsd: 1.75, price: 0, duration: 365 },
  { name: 'Coursera 12M + Gemini PRO 3M', category: 'Educacion', costUsd: 0, price: 0, duration: 365 },
  { name: 'Surfshark VPN 2M Code', category: 'VPN', costUsd: 0.9, price: 0, duration: 60 },
  { name: 'Nord VPN Basic 3M', category: 'VPN', costUsd: 3, price: 0, duration: 90 },
  { name: 'Express VPN 3 Days', category: 'VPN', costUsd: 0.99, price: 0, duration: 3 },
  { name: 'BOT KOKORO SHOP', category: 'Otros', costUsd: 60, price: 0, duration: 30 },
  { name: 'PRUEBA TEST BOT', category: 'Otros', costUsd: 0.05, price: 0, duration: 30 },
  { name: 'Links Shop de CCs', category: 'Otros', costUsd: 20, price: 0, duration: 30 },
  { name: '16 SMS Panels', category: 'Otros', costUsd: 15, price: 0, duration: 30 },
];

const withDefaultServiceMeta = (service) => ({
  provider: 'Shop_KOKORO',
  stock: 0,
  slots: 1,
  ...service,
});

const mergeServices = (services) => {
  const seen = new Set();
  return services.map(withDefaultServiceMeta).filter((service) => {
    const key = String(service.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sampleServices = mergeServices([...baseSampleServices, ...kokoroImportedServices]);

function statusFor(end) {
  const diff = daysBetween(todayISO(), end);
  if (diff < 0) return { key: 'expired', label: 'Vencido', tone: 'danger' };
  if (diff === 0) return { key: 'today', label: 'Vence hoy', tone: 'warning' };
  if (diff <= 3) return { key: 'soon', label: `Vence en ${diff} dias`, tone: 'warning' };
  return { key: 'active', label: 'Activo', tone: 'success' };
}

const fromServiceRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  category: row.category,
  provider: row.provider || 'Shop_KOKORO',
  stock: Number(row.stock || 0),
  costUsd: Number(row.cost_usd || 0),
  price: Number(row.price_pen || 0),
  duration: Number(row.duration_days || 30),
  slots: slotsOf(row.slots),
});

const fromProviderRow = (row) => ({
  id: row.id,
  name: row.name,
  note: row.note || '',
});

const fromAccountRow = (row) => ({
  id: row.id,
  serviceId: row.service_id,
  service: row.service_name || 'Sin servicio',
  email: row.email,
  password: row.encrypted_password || '',
  recovery: row.recovery_note || '',
  supplier: row.supplier || '',
  maxProfiles: Number(row.max_profiles || 1),
  start: row.starts_at || todayISO(),
  duration: Number(row.duration_days || 30),
  end: row.expires_at || addDays(row.starts_at || todayISO(), row.duration_days || 30),
  note: row.note || '',
});

const fromSaleRow = (row) => ({
  id: row.id,
  serviceId: row.service_id,
  accountId: row.master_account_id || '',
  client: row.client_name,
  phone: row.client_phone || '',
  service: row.service_name || 'Sin servicio',
  account: row.account_email || 'Sin cuenta asignada',
  profile: row.profile_name || '',
  pin: row.profile_pin || '',
  start: row.starts_at,
  end: row.ends_at,
  costUsd: Number(row.cost_usd || 0),
  exchangeRate: Number(row.exchange_rate || 3.75),
  price: Number(row.price_pen || 0),
  slots: slotsOf(row.slots),
  paid: row.paid,
  note: row.note || '',
});

function App() {
  const [session, setSession] = useState(null);
  const allowAdminSignup = new URLSearchParams(window.location.search).get('admin') === '1';
  const [authMode, setAuthMode] = useState(allowAdminSignup ? 'signup' : 'login');
  const [message, setMessage] = useState('');
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(emptyData);
  const [view, setView] = useState('dashboard');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [editingServiceId, setEditingServiceId] = useState('');
  const [serviceFormKey, setServiceFormKey] = useState(0);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState('');
  const [trustedEmail, setTrustedEmail] = useState(() => localStorage.getItem(trustedEmailKey) || '');
  const [saleDraft, setSaleDraft] = useState({
    serviceId: '',
    serviceSearch: '',
    duration: '30',
    durationUnit: 'days',
    costUsd: '',
    slots: '1',
    exchangeRate: '3.75',
    price: '',
  });
  const emptyAccountDraft = { serviceId: '', serviceSearch: '', duration: '1', durationUnit: 'months' };
  const [accountDraft, setAccountDraft] = useState(emptyAccountDraft);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.id) loadCloudData(session.user.id);
    else setData(emptyData);
  }, [session?.user?.id]);

  const loadCloudData = async (userId) => {
    setLoading(true);
    const [servicesResult, accountsResult, salesResult, settingsResult, providersResult] = await Promise.all([
      supabase.from('services').select('*').order('created_at', { ascending: false }),
      supabase.from('master_accounts').select('*').order('created_at', { ascending: false }),
      supabase.from('sales').select('*').order('created_at', { ascending: false }),
      supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('providers').select('*').order('created_at', { ascending: false }),
    ]);

    const providersMissing = providersResult.error?.code === '42P01' || providersResult.error?.message?.includes('schema cache');
    const error = servicesResult.error || accountsResult.error || salesResult.error || settingsResult.error || (providersMissing ? null : providersResult.error);
    if (error) {
      const missingTable = error.code === '42P01' || error.message?.includes('schema cache');
      setSchemaMissing(missingTable);
      if (missingTable) {
        setData({
          ...emptyData,
          services: sampleServices.map((service, index) => ({
            id: `preview-${index}`,
            ...service,
            price: catalogSalePen(service.costUsd, 3.75),
          })),
          providers: baseProviders.map((name, index) => ({ id: `preview-provider-${index}`, name, note: 'Proveedor base' })),
        });
      }
      setMessage(
        missingTable
          ? 'Vista previa activa: falta crear las tablas en Supabase. El catalogo se ve, pero para guardar en nube ejecuta supabase_schema.sql en SQL Editor.'
          : `Error de Supabase: ${error.message}`
      );
      setLoading(false);
      return;
    }

    setSchemaMissing(false);
    setData({
      settings: { exchangeRate: Number(settingsResult.data?.exchange_rate || 3.75) },
      services: servicesResult.data.map(fromServiceRow),
      accounts: accountsResult.data.map(fromAccountRow),
      sales: salesResult.data.map(fromSaleRow),
      providers: providersMissing ? baseProviders.map((name, index) => ({ id: `base-provider-${index}`, name, note: 'Proveedor base' })) : providersResult.data.map(fromProviderRow),
    });
    setLoading(false);
  };

  const accountGroups = useMemo(() => buildAccountGroups(data.sales, data.settings.exchangeRate), [data.sales, data.settings.exchangeRate]);
  const sharedGroups = accountGroups.groups.filter((group) => group.slots > 1);

  const stats = useMemo(() => {
    const revenue = data.sales.reduce((sum, item) => sum + Number(item.price || 0), 0);
    const cost = accountGroups.groups.reduce((sum, group) => sum + group.cost, 0);
    const profit = revenue - cost;
    const projected = accountGroups.groups.reduce((sum, group) => sum + group.projected, 0);
    const freeSlots = accountGroups.groups.reduce((sum, group) => sum + group.free, 0);
    const soon = data.sales.filter((sale) => ['today', 'soon'].includes(statusFor(sale.end).key)).length;
    const expired = data.sales.filter((sale) => statusFor(sale.end).key === 'expired').length;
    return { revenue, cost, profit, projected, freeSlots, soon, expired, active: data.sales.length - expired };
  }, [data.sales, accountGroups]);

  const filteredSales = data.sales.filter((sale) =>
    `${sale.client} ${sale.phone} ${sale.service} ${sale.account} ${sale.profile} ${sale.pin}`.toLowerCase().includes(query.toLowerCase())
  );

  const clients = useMemo(() => {
    const grouped = new Map();
    data.sales.forEach((sale) => {
      const key = `${sale.client || 'Sin nombre'}|${sale.phone || ''}`.toLowerCase();
      const current = grouped.get(key) || {
        id: key,
        name: sale.client || 'Sin nombre',
        phone: sale.phone || '',
        sales: [],
        revenue: 0,
        profit: 0,
      };
      current.sales.push(sale);
      current.revenue += Number(sale.price || 0);
      current.profit += saleProfit(sale, data.settings.exchangeRate);
      grouped.set(key, current);
    });

    return Array.from(grouped.values())
      .map((client) => {
        const active = client.sales.filter((sale) => statusFor(sale.end).key === 'active').length;
        const warning = client.sales.filter((sale) => ['today', 'soon'].includes(statusFor(sale.end).key)).length;
        const expired = client.sales.filter((sale) => statusFor(sale.end).key === 'expired').length;
        const lastEnd = client.sales.map((sale) => sale.end).sort().at(-1);
        return { ...client, active, warning, expired, lastEnd };
      })
      .filter((client) => `${client.name} ${client.phone} ${client.sales.map((sale) => sale.service).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [data.sales, data.settings.exchangeRate, query]);

  const categoryOptions = useMemo(
    () => ['Todas', ...serviceCategories.filter((category) => data.services.some((service) => service.category === category))],
    [data.services]
  );

  const providerOptions = useMemo(() => {
    const names = new Set(baseProviders);
    data.providers.forEach((provider) => provider.name && names.add(provider.name));
    data.services.forEach((service) => service.provider && names.add(service.provider));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [data.providers, data.services]);

  const providerStats = useMemo(() => {
    const providers = new Map();
    providerOptions.forEach((name) => providers.set(name, { id: name, name, note: '', products: 0, stock: 0 }));
    data.providers.forEach((provider) =>
      providers.set(provider.name, { ...(providers.get(provider.name) || {}), ...provider, products: providers.get(provider.name)?.products || 0, stock: providers.get(provider.name)?.stock || 0 })
    );
    data.services.forEach((service) => {
      const name = service.provider || 'Sin proveedor';
      const current = providers.get(name) || { id: name, name, note: '', products: 0, stock: 0 };
      current.products += 1;
      current.stock += Number(service.stock || 0);
      providers.set(name, current);
    });
    return Array.from(providers.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.providers, data.services, providerOptions]);

  const filteredServices = data.services.filter((service) => {
    const normalizedQuery = query.toLowerCase();
    const matchesQuery = `${service.name} ${service.category} ${service.provider} ${service.stock} ${service.description}`.toLowerCase().includes(normalizedQuery);
    const matchesCategory = categoryFilter === 'Todas' || service.category === categoryFilter;
    return matchesQuery && matchesCategory;
  });

  const accountsWithUsage = useMemo(
    () =>
      data.accounts.map((account) => {
        const linkedSales = data.sales.filter((sale) => sale.accountId === account.id || (!sale.accountId && sale.account === account.email));
        return { ...account, linkedSales, available: Number(account.maxProfiles || 0) - linkedSales.length };
      }),
    [data.accounts, data.sales]
  );

  const selectSaleService = (service) => {
    const hasCost = Number(service.costUsd || 0) > 0;
    const hasSavedPrice = Number(service.price || 0) > 0;
    setSaleDraft({
      serviceId: service.id,
      serviceSearch: service.name,
      duration: String(service.duration || 30),
      durationUnit: 'days',
      costUsd: hasCost ? String(service.costUsd) : '',
      slots: String(slotsOf(service.slots)),
      exchangeRate: String(data.settings.exchangeRate),
      price: hasSavedPrice
        ? String(Number(Number(service.price).toFixed(2)))
        : hasCost
          ? String(catalogSalePen(service.costUsd, data.settings.exchangeRate, service.slots))
          : '',
    });
  };

  const selectAccountService = (service) => {
    setAccountDraft({
      serviceId: service.id,
      serviceSearch: service.name,
      duration: String(service.duration || 30),
      durationUnit: 'days',
    });
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    const trustDevice = form.get('trustedDevice') === 'on';
    const wantsPasswordSave = trustDevice || event.nativeEvent?.submitter?.value === 'save-password';
    const canSignUp = allowAdminSignup && authMode === 'signup';
    const result =
      canSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) setMessage(result.error.message);
    else {
      if (trustDevice) {
        localStorage.setItem(trustedEmailKey, email);
        setTrustedEmail(email);
      } else {
        localStorage.removeItem(trustedEmailKey);
        setTrustedEmail('');
      }

      if (wantsPasswordSave && 'PasswordCredential' in window && navigator.credentials?.store) {
        try {
          await navigator.credentials.store(new PasswordCredential({ id: email, password, name: 'QYRO' }));
        } catch {
          // Safari/iOS decide cuándo mostrar el guardado; si no soporta esta API, el login normal igual activa Keychain.
        }
      }

      if (canSignUp) setMessage('Cuenta creada. Si Supabase pide confirmacion, revisa tu correo.');
    }
    setSaving(false);
  };

  const insertAndReload = async (table, payload, form) => {
    if (schemaMissing) {
      setMessage('Primero crea las tablas en Supabase para guardar cambios reales en la nube.');
      return;
    }
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from(table).insert(payload);
    if (error) setMessage(explainError(error));
    else {
      form.reset();
      await loadCloudData(session.user.id);
    }
    setSaving(false);
    return !error;
  };

  const addSale = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const service = data.services.find((item) => item.id === form.get('serviceId')) || data.services.find((item) => item.name === form.get('serviceSearch'));
    const account = data.accounts.find((item) => item.id === form.get('accountId'));
    const start = form.get('start') || todayISO();
    await insertAndReload(
      'sales',
      {
        user_id: session.user.id,
        service_id: service?.id || null,
        master_account_id: account?.id || null,
        client_name: form.get('client'),
        client_phone: form.get('phone'),
        service_name: service?.name || form.get('service'),
        account_email: account?.email || form.get('account') || 'Sin cuenta asignada',
        profile_name: form.get('profile'),
        profile_pin: form.get('pin'),
        starts_at: start,
        ends_at: addDays(start, durationToDays(form.get('duration') || service?.duration || 30, form.get('durationUnit') || 'days')),
        cost_usd: Number(form.get('costUsd') || service?.costUsd || 0),
        exchange_rate: Number(form.get('exchangeRate') || data.settings.exchangeRate),
        price_pen: Number(form.get('price') || service?.price || 0),
        slots: slotsOf(form.get('slots') || service?.slots),
        paid: form.get('paid') === 'on',
        note: form.get('note'),
      },
      event.currentTarget
    );
    setSaleDraft({
      serviceId: '',
      serviceSearch: '',
      duration: '30',
      durationUnit: 'days',
      costUsd: '',
      slots: '1',
      exchangeRate: String(data.settings.exchangeRate),
      price: '',
    });
  };

  const updateAccount = async (event, account) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const service =
      data.services.find((item) => item.id === form.get('serviceId')) ||
      data.services.find((item) => item.name === form.get('serviceSearch'));
    const email = String(form.get('email') || '').trim();
    const payload = {
      service_id: service?.id || null,
      service_name: service?.name || form.get('serviceSearch') || account.service,
      email,
      encrypted_password: form.get('password'),
      recovery_note: form.get('recovery'),
      supplier: form.get('supplier'),
      max_profiles: Math.max(1, Number(form.get('maxProfiles') || 1)),
      starts_at: form.get('accountStart') || account.start,
      duration_days: durationToDays(form.get('accountDuration') || 30, form.get('accountDurationUnit') || 'days'),
      note: form.get('note'),
    };

    if (schemaMissing) {
      setMessage('Primero crea las tablas en Supabase para guardar cambios reales en la nube.');
      return;
    }
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('master_accounts').update(payload).eq('id', account.id);
    // Las ventas guardan una copia del correo: se actualiza para que sigan apuntando a la cuenta.
    const salesError =
      !error && email !== account.email
        ? (await supabase.from('sales').update({ account_email: email }).eq('master_account_id', account.id)).error
        : null;
    if (error || salesError) setMessage(explainError(error || salesError));
    else {
      setEditingAccountId('');
      await loadCloudData(session.user.id);
    }
    setSaving(false);
  };

  const addAccount = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const service =
      data.services.find((item) => item.id === form.get('serviceId')) ||
      data.services.find((item) => item.name === form.get('serviceSearch'));
    await insertAndReload(
      'master_accounts',
      {
        user_id: session.user.id,
        service_id: service?.id || null,
        service_name: service?.name || form.get('serviceSearch'),
        email: form.get('email'),
        encrypted_password: form.get('password'),
        recovery_note: form.get('recovery'),
        supplier: form.get('supplier'),
        max_profiles: Number(form.get('maxProfiles') || 1),
        starts_at: form.get('accountStart') || todayISO(),
        duration_days: durationToDays(form.get('accountDuration') || 30, form.get('accountDurationUnit') || 'days'),
        note: form.get('note'),
      },
      event.currentTarget
    );
    setAccountDraft(emptyAccountDraft);
  };

  const addService = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const provider = form.get('provider') || 'Shop_KOKORO';
    const saved = await insertAndReload(
      'services',
      {
        user_id: session.user.id,
        name: form.get('name'),
        description: form.get('description'),
        category: form.get('category'),
        provider,
        stock: Math.max(0, Number(form.get('stock') || 0)),
        cost_usd: Number(form.get('costUsd')),
        slots: slotsOf(form.get('slots')),
        price_pen: Number(form.get('price')) || catalogSalePen(Number(form.get('costUsd')), data.settings.exchangeRate, form.get('slots')),
        duration_days: durationToDays(form.get('duration'), form.get('durationUnit') || 'days'),
      },
      event.currentTarget
    );
    if (saved) setServiceFormKey((key) => key + 1);
  };

  const updateSale = async (saleId, changes) => {
    const pricePen = Number(Number(changes.price || 0).toFixed(2));
    const pin = String(changes.pin || '').trim();
    const profile = String(changes.profile || '').trim();
    if (schemaMissing || String(saleId).startsWith('preview-')) {
      setData({ ...data, sales: data.sales.map((sale) => (sale.id === saleId ? { ...sale, price: pricePen, pin, profile } : sale)) });
      return true;
    }
    setSaving(true);
    setMessage('');
    const { error } = await supabase
      .from('sales')
      .update({ price_pen: pricePen, profile_pin: pin, profile_name: profile })
      .eq('id', saleId);
    if (error) setMessage(explainError(error));
    else await loadCloudData(session.user.id);
    setSaving(false);
    return !error;
  };

  const removeItem = async (collection, id) => {
    if (schemaMissing || String(id).startsWith('preview-')) {
      setData({ ...data, [collection]: data[collection].filter((item) => item.id !== id) });
      return;
    }
    setSaving(true);
    const tableName = { services: 'services', accounts: 'master_accounts', sales: 'sales', providers: 'providers' }[collection];
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) setMessage(explainError(error));
    await loadCloudData(session.user.id);
    setSaving(false);
  };

  const updateService = async (event, serviceId) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const costUsd = Number(form.get('costUsd') || 0);
    const payload = {
      name: form.get('name'),
      description: form.get('description'),
      category: form.get('category'),
      provider: form.get('provider') || 'Shop_KOKORO',
      stock: Math.max(0, Number(form.get('stock') || 0)),
      cost_usd: costUsd,
      slots: slotsOf(form.get('slots')),
      price_pen: Number(form.get('price')) || catalogSalePen(costUsd, data.settings.exchangeRate, form.get('slots')),
      duration_days: durationToDays(form.get('duration') || 30, form.get('durationUnit') || 'days'),
    };

    if (schemaMissing || String(serviceId).startsWith('preview-')) {
      setData({
        ...data,
        services: data.services.map((service) =>
          service.id === serviceId
            ? {
                ...service,
                name: payload.name,
                description: payload.description,
                category: payload.category,
                provider: payload.provider,
                stock: payload.stock,
                costUsd: payload.cost_usd,
                slots: payload.slots,
                price: payload.price_pen,
                duration: payload.duration_days,
              }
            : service
        ),
      });
      setEditingServiceId('');
      return;
    }

    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('services').update(payload).eq('id', serviceId);
    if (error) setMessage(explainError(error));
    else {
      setEditingServiceId('');
      await loadCloudData(session.user.id);
    }
    setSaving(false);
  };

  const updateExchangeRate = async (event) => {
    const exchangeRate = Number(event.target.value || 0);
    setData({ ...data, settings: { ...data.settings, exchangeRate } });
    if (schemaMissing) return;
    await supabase.from('user_settings').upsert({
      user_id: session.user.id,
      exchange_rate: exchangeRate,
      updated_at: new Date().toISOString(),
    });
  };

  const seedServices = async () => {
    if (schemaMissing) {
      setData({
        ...data,
        services: sampleServices.map((service, index) => ({
          id: `preview-${index}`,
          ...service,
          price: catalogSalePen(service.costUsd, data.settings.exchangeRate),
        })),
        providers: baseProviders.map((name, index) => ({ id: `preview-provider-${index}`, name, note: 'Proveedor base' })),
      });
      setMessage('Catalogo cargado en vista previa. Para guardarlo en Supabase, crea las tablas primero.');
      return;
    }
    setSaving(true);
    await supabase.from('providers').upsert(
      baseProviders.map((name) => ({ user_id: session.user.id, name, note: name === 'Shop_KOKORO' ? 'Proveedor principal del catalogo importado' : 'Proveedor base' })),
      { onConflict: 'user_id,name' }
    );
    const payload = sampleServices.map((service) => ({
      user_id: session.user.id,
      name: service.name,
      description: service.description || '',
      category: service.category,
      provider: service.provider || 'Shop_KOKORO',
      stock: Number(service.stock || 0),
      cost_usd: service.costUsd,
      price_pen: service.price || catalogSalePen(service.costUsd, data.settings.exchangeRate),
      duration_days: service.duration,
      slots: slotsOf(service.slots),
    }));
    const { error } = await supabase.from('services').insert(payload);
    if (error) setMessage(explainError(error));
    await loadCloudData(session.user.id);
    setSaving(false);
  };

  const addProvider = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') || '').trim();
    if (!name) return;
    if (schemaMissing) {
      setData({
        ...data,
        providers: [...data.providers, { id: `preview-provider-${Date.now()}`, name, note: form.get('note') || '' }],
      });
      event.currentTarget.reset();
      return;
    }
    const saved = await insertAndReload(
      'providers',
      { user_id: session.user.id, name, note: form.get('note') || '' },
      event.currentTarget
    );
    if (saved) setMessage(`Proveedor ${name} guardado.`);
  };

  const importKokoroProducts = async () => {
    if (schemaMissing) {
      const current = data.services.map((service) => ({ provider: service.provider || 'Shop_KOKORO', stock: Number(service.stock || 0), ...service }));
      const merged = mergeServices([...current, ...kokoroImportedServices]);
      setData({
        ...data,
        services: merged.map((service, index) => ({ id: service.id || `preview-import-${index}`, ...service, price: service.price || catalogSalePen(service.costUsd, data.settings.exchangeRate, service.slots) })),
        providers: baseProviders.map((name, index) => ({ id: `preview-provider-${index}`, name, note: 'Proveedor base' })),
      });
      setMessage('Productos Shop_KOKORO cargados en vista previa.');
      return;
    }

    setSaving(true);
    setMessage('');
    const providerRows = baseProviders.map((name) => ({
      user_id: session.user.id,
      name,
      note: name === 'Shop_KOKORO' ? 'Proveedor principal del catalogo Shop_KOKORO' : 'Proveedor base',
    }));
    const providerResult = await supabase.from('providers').upsert(providerRows, { onConflict: 'user_id,name' });
    const providerError = providerResult.error;
    const normalize = (value) => String(value || '').trim().toLowerCase();
    const existingByName = new Map(data.services.map((service) => [normalize(service.name), service]));
    const fixExisting = data.services
      .filter((service) => !service.provider)
      .map((service) => supabase.from('services').update({ provider: 'Shop_KOKORO', stock: Number(service.stock || 0) }).eq('id', service.id));
    const results = await Promise.all([
      ...fixExisting,
      ...kokoroImportedServices.map((service) => {
        const existing = existingByName.get(normalize(service.name));
        const payload = {
          user_id: session.user.id,
          name: service.name,
          description: service.description || '',
          category: service.category || 'Otros',
          provider: service.provider || 'Shop_KOKORO',
          stock: Number(service.stock || 0),
          cost_usd: Number(service.costUsd || 0),
          price_pen: Number(service.price || catalogSalePen(service.costUsd, data.settings.exchangeRate, service.slots)),
          duration_days: Number(service.duration || 30),
          slots: slotsOf(service.slots),
        };
        return existing
          ? supabase.from('services').update(payload).eq('id', existing.id)
          : supabase.from('services').insert(payload);
      }),
    ]);
    const error = providerError || results.find((result) => result.error)?.error;
    if (error) setMessage(explainError(error));
    else setMessage(`Shop_KOKORO importado: ${kokoroImportedServices.length} productos revisados con proveedor y stock.`);
    await loadCloudData(session.user.id);
    setSaving(false);
  };

  const applyCatalogMarkup = async () => {
    const confirmed = window.confirm('Esto pone el precio final de TODOS los productos con costo en: (compra USD + $0.50) x2 x tipo de cambio, dividido entre los cupos de la cuenta. Los precios que bajaste a mano se reemplazan. Continuar?');
    if (!confirmed) return;
    if (schemaMissing) {
      setData({
        ...data,
        services: data.services.map((service) => ({
          ...service,
          price: catalogSalePen(service.costUsd, data.settings.exchangeRate, service.slots),
        })),
      });
      setMessage('Vista previa recalculada: (compra USD + $0.50) x2 convertido a soles.');
      return;
    }
    setSaving(true);
    setMessage('');
    const updates = data.services
      .filter((service) => Number(service.costUsd || 0) > 0)
      .map((service) =>
        supabase
          .from('services')
          .update({ price_pen: catalogSalePen(service.costUsd, data.settings.exchangeRate, service.slots) })
          .eq('id', service.id)
      );

    const results = await Promise.all(updates);
    const error = results.find((result) => result.error)?.error;
    if (error) setMessage(explainError(error));
    else setMessage('Precios actualizados: (compra USD + $0.50) x2 convertido a soles.');
    await loadCloudData(session.user.id);
    setSaving(false);
  };

  if (!isSupabaseConfigured) return <SetupScreen />;
  if (loading) return <div className="center-screen">Cargando sistema...</div>;
  if (!session) return <AuthScreen allowSignup={allowAdminSignup} mode={authMode} setMode={setAuthMode} message={message} saving={saving} trustedEmail={trustedEmail} onSubmit={handleAuth} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark brand-logo"><img src="/brand/qyro-logo.png" alt="QYRO" /></div>
          <div>
            <strong>QYRO</strong>
            <span>Intelligence, reimagined</span>
          </div>
        </div>

        <nav>
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}><LayoutDashboard /> Panel</button>
          <button className={view === 'sell' ? 'active' : ''} onClick={() => setView('sell')}><Plus /> Vender</button>
          <button className={view === 'registeredSales' ? 'active' : ''} onClick={() => setView('registeredSales')}><WalletCards /> Ventas registradas</button>
          <button className={view === 'clients' ? 'active' : ''} onClick={() => setView('clients')}><UserRound /> Clientes</button>
          <button className={view === 'newAccount' ? 'active' : ''} onClick={() => setView('newAccount')}><LockKeyhole /> Nueva cuenta</button>
          <button className={view === 'registeredAccounts' ? 'active' : ''} onClick={() => setView('registeredAccounts')}><ShieldCheck /> Cuentas registradas</button>
          <button className={view === 'providers' ? 'active' : ''} onClick={() => setView('providers')}><Tag /> Proveedores</button>
          <button className={view === 'services' ? 'active' : ''} onClick={() => setView('services')}><ShieldCheck /> Servicios</button>
        </nav>

        <div className="cloud-box">
          <Smartphone size={20} />
          <p>{session.user.email}</p>
          <button className="ghost full" onClick={() => supabase.auth.signOut()}><LogOut size={17} /> Salir</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control del negocio</p>
            <h1>{view === 'dashboard' ? 'Panel maestro' : view === 'sell' ? 'Vender' : view === 'registeredSales' ? 'Ventas registradas' : view === 'clients' ? 'Clientes' : view === 'newAccount' ? 'Nueva cuenta' : view === 'registeredAccounts' ? 'Cuentas registradas' : view === 'providers' ? 'Proveedores' : 'Catalogo de servicios'}</h1>
          </div>
          <label className="rate-box">
            <DollarSign size={17} />
            <span>TC</span>
            <input type="number" step="0.01" value={data.settings.exchangeRate} onChange={updateExchangeRate} />
          </label>
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, servicio o cuenta" />
          </label>
        </header>

        {message && (
          <div className="notice" role="alert">
            <span>{message}</span>
            <button type="button" title="Cerrar aviso" onClick={() => setMessage('')}><X size={16} /></button>
          </div>
        )}

        {view === 'dashboard' && (
          <>
            <section className="metrics">
              <Metric icon={<CircleDollarSign />} label="Ganancia real" value={soles(stats.profit)} sub={`${soles(stats.revenue)} cobrado - ${soles(stats.cost)} invertido`} />
              <Metric icon={<DollarSign />} label="Si llenas los cupos" value={soles(stats.projected)} sub={stats.freeSlots > 0 ? `${stats.freeSlots} cupos libres por vender` : 'Sin cupos libres'} />
              <Metric icon={<WalletCards />} label="Ventas activas" value={stats.active} sub={`${data.sales.length} ventas registradas`} />
              <Metric icon={<Bell />} label="Por vencer" value={stats.soon} sub="Hoy o en 3 dias" />
            </section>

            {data.services.length === 0 && (
              <section className="catalog-hero">
                <div>
                  <p className="eyebrow">Catalogo pendiente</p>
                  <h2>Carga todos tus productos base</h2>
                  <span>Netflix, Prime Video, ChatGPT, Gemini, herramientas IA, VPN, musica, diseno y mas. Costo real = compra USD + $0.50; venta de referencia = costo real x2 en soles.</span>
                </div>
                <button className="primary" onClick={() => { setView('services'); seedServices(); }} disabled={saving}>
                  <Sparkles size={18} /> Cargar catalogo
                </button>
              </section>
            )}

            {sharedGroups.length > 0 && (
              <Panel title="Cuentas compartidas" icon={<Users />}>
                <div className="shared-grid">
                  {sharedGroups.map((group) => <SharedAccountCard key={group.key} group={group} />)}
                </div>
              </Panel>
            )}

            <section className="split">
              <Panel title="Renovaciones urgentes" icon={<CalendarClock />}>
                <div className="stack">
                  {data.sales.filter((sale) => statusFor(sale.end).key !== 'active').map((sale) => <SaleRow key={sale.id} sale={sale} group={accountGroups.bySale.get(sale.id)} exchangeRate={data.settings.exchangeRate} />)}
                  {!data.sales.some((sale) => statusFor(sale.end).key !== 'active') && <Empty text="No hay vencimientos urgentes." />}
                </div>
              </Panel>

              <Panel title="Ganancia por venta (por cupo)" icon={<CircleDollarSign />}>
                <div className="stack">
                  {data.sales.slice(0, 5).map((sale) => (
                    <div className="profit-row" key={sale.id}>
                      <span>{sale.client}</span>
                      <strong className={saleProfit(sale, data.settings.exchangeRate) > 0.05 ? 'profit-positive' : 'profit-zero'}>{soles(saleProfit(sale, data.settings.exchangeRate))}</strong>
                    </div>
                  ))}
                  {data.sales.length === 0 && <Empty text="Registra tu primera venta." />}
                </div>
              </Panel>
            </section>
          </>
        )}

        {view === 'sell' && (
          <section className="single-panel">
            <Panel title="Vender" icon={<Plus />}>
              <form className="form" onSubmit={addSale}>
                <div className="form-row">
                  <Field label="Cliente"><input name="client" placeholder="Nombre del cliente" required /></Field>
                  <Field label="WhatsApp"><input name="phone" placeholder="Ej: 987 654 321" /></Field>
                </div>
                <Field label="Producto vendido">
                <ServicePicker
                  services={data.services}
                  value={saleDraft.serviceSearch}
                  selectedId={saleDraft.serviceId}
                  exchangeRate={data.settings.exchangeRate}
                  onInput={(value) => setSaleDraft({ ...saleDraft, serviceSearch: value, serviceId: '' })}
                  onSelect={selectSaleService}
                />
                </Field>
                <Field label="Cuenta maestra (boveda)">
                  <Select name="accountId" options={['', ...data.accounts.map((item) => `${item.id}|${item.email}`)]} labels={['Sin cuenta maestra', ...data.accounts.map((item) => `${item.email} - ${item.service}`)]} />
                </Field>
                <Field label="Cuenta manual" hint="Solo si la cuenta no esta guardada en la boveda.">
                  <input name="account" placeholder="Correo o usuario de la cuenta" />
                </Field>
                <div className="form-row">
                  <Field label="Perfil / usuario"><input name="profile" placeholder="Ej: Perfil 3" /></Field>
                  <Field label="PIN del cliente"><input name="pin" placeholder="Ej: 1234" /></Field>
                </div>
                <div className="form-row">
                  <Field label="Fecha de inicio"><input name="start" type="date" defaultValue={todayISO()} /></Field>
                  <Field label="Duracion del servicio">
                    <div className="duration-control">
                      <input name="duration" type="number" placeholder="Duracion" value={saleDraft.duration} onChange={(event) => setSaleDraft({ ...saleDraft, duration: event.target.value })} />
                      <Select name="durationUnit" options={durationUnits} labels={durationUnitLabels} value={saleDraft.durationUnit} onChange={(durationUnit) => setSaleDraft({ ...saleDraft, durationUnit })} />
                    </div>
                  </Field>
                </div>
                <div className="form-row three">
                  <Field label="Compra cuenta USD"><input name="costUsd" type="number" step="0.01" placeholder="Ej: 5.00" value={saleDraft.costUsd} onChange={(event) => setSaleDraft({ ...saleDraft, costUsd: event.target.value })} /></Field>
                  <Field label="Cupos de la cuenta"><input name="slots" type="number" min="1" step="1" placeholder="1" value={saleDraft.slots} onChange={(event) => setSaleDraft({ ...saleDraft, slots: event.target.value })} /></Field>
                  <Field label="Tipo de cambio"><input name="exchangeRate" type="number" step="0.01" placeholder="Ej: 3.75" value={saleDraft.exchangeRate} onChange={(event) => setSaleDraft({ ...saleDraft, exchangeRate: event.target.value })} /></Field>
                </div>
                <PriceBreakdown costUsd={saleDraft.costUsd} exchangeRate={saleDraft.exchangeRate} slots={saleDraft.slots} finalPen={saleDraft.price} />
                <Field label="Precio final de venta S/" hint="Lo que le cobras a este cliente (por su cupo). Puede ser menor que la venta x2.">
                  <div className="price-input-row">
                    <input name="price" type="number" step="0.01" placeholder="Ej: 41.25" value={saleDraft.price} onChange={(event) => setSaleDraft({ ...saleDraft, price: event.target.value })} required />
                    <button
                      type="button"
                      className="ghost"
                      disabled={!(Number(saleDraft.costUsd) > 0)}
                      onClick={() => setSaleDraft({ ...saleDraft, price: String(catalogSalePen(saleDraft.costUsd, saleDraft.exchangeRate, saleDraft.slots)) })}
                    >
                      Usar x2
                    </button>
                  </div>
                </Field>
                <Field label="Nota interna"><textarea name="note" placeholder="Detalles de la venta, acuerdos, etc." /></Field>
                <label className="check"><input name="paid" type="checkbox" defaultChecked /> Pagado</label>
                <button className="primary" disabled={saving}><Plus size={18} /> Registrar venta</button>
              </form>
            </Panel>
          </section>
        )}

        {view === 'registeredSales' && (
          <section className="single-panel wide">
            <Panel title="Ventas registradas" icon={<Users />}>
              <button className={showSecrets ? 'ghost toggle-on' : 'ghost'} onClick={() => setShowSecrets(!showSecrets)} aria-pressed={showSecrets}>
                {showSecrets ? <EyeOff size={18} /> : <Eye size={18} />}
                {showSecrets ? 'Ocultar cuenta y PIN' : 'Mostrar cuenta y PIN'}
              </button>
              <div className="stack">
                {filteredSales.map((sale) => (
                  <SaleRow
                    key={sale.id}
                    sale={sale}
                    group={accountGroups.bySale.get(sale.id)}
                    exchangeRate={data.settings.exchangeRate}
                    revealSecrets={showSecrets}
                    saving={saving}
                    onUpdate={(changes) => updateSale(sale.id, changes)}
                    onDelete={() => removeItem('sales', sale.id)}
                  />
                ))}
                {filteredSales.length === 0 && <Empty text="No hay ventas para mostrar." />}
              </div>
            </Panel>
          </section>
        )}

        {view === 'clients' && (
          <section className="clients-view">
            <section className="metrics">
              <Metric icon={<UserRound />} label="Clientes" value={clients.length} sub="Agrupados por nombre y WhatsApp" />
              <Metric icon={<WalletCards />} label="Membresias activas" value={clients.reduce((sum, client) => sum + client.active, 0)} sub="Servicios vigentes" />
              <Metric icon={<Bell />} label="Por vencer" value={clients.reduce((sum, client) => sum + client.warning, 0)} sub="Hoy o proximos dias" />
              <Metric icon={<CircleDollarSign />} label="Ganancia por cupos" value={soles(clients.reduce((sum, client) => sum + client.profit, 0))} sub="Lo que deja cada cliente segun su cupo" />
            </section>

            <section className="client-grid">
              {clients.map((client) => (
                <article className="client-card" key={client.id}>
                  <div className="client-head">
                    <div className="avatar">{client.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <strong>{client.name}</strong>
                      <span>{client.phone || 'Sin WhatsApp'}</span>
                    </div>
                  </div>
                  <div className="client-stats">
                    <span>{client.active} activas</span>
                    <span>{client.warning} por vencer</span>
                    <span>{client.expired} vencidas</span>
                  </div>
                  <div className="price-strip">
                    <div>
                      <span>Pagado</span>
                      <strong>{money(client.revenue)}</strong>
                    </div>
                    <div>
                      <span>Ganancia (su cupo)</span>
                      <strong>{soles(client.profit)}</strong>
                    </div>
                  </div>
                  <div className="membership-list">
                    {client.sales.map((sale) => {
                      const state = statusFor(sale.end);
                      return (
                        <div className="membership-item" key={sale.id}>
                          <div>
                            <strong>{sale.service}</strong>
                            <span>{sale.profile || 'Sin perfil'} · {sale.start} a {sale.end}</span>
                          </div>
                          <span className={`badge ${state.tone}`}>{state.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
              {clients.length === 0 && <Empty text="Aun no hay clientes. Registra una venta y aparecera aqui." />}
            </section>
          </section>
        )}

        {view === 'newAccount' && (
          <section className="single-panel">
            <Panel title="Nueva cuenta" icon={<LockKeyhole />}>
              <form className="form" onSubmit={addAccount}>
                <Field label="Producto de la cuenta">
                <ServicePicker
                  services={data.services}
                  value={accountDraft.serviceSearch}
                  selectedId={accountDraft.serviceId}
                  exchangeRate={data.settings.exchangeRate}
                  onInput={(value) => setAccountDraft({ ...accountDraft, serviceSearch: value, serviceId: '' })}
                  onSelect={selectAccountService}
                />
                </Field>
                <Field label="Correo o usuario"><input name="email" placeholder="cuenta@correo.com" required /></Field>
                <Field label="Contrasena"><input name="password" placeholder="Clave de la cuenta" /></Field>
                <Field label="Recuperacion"><input name="recovery" placeholder="Telefono, correo o codigo de respaldo" /></Field>
                <div className="form-row">
                  <Field label="Proveedor"><input name="supplier" placeholder="A quien se la compraste" /></Field>
                  <Field label="Perfiles / cupos"><input name="maxProfiles" type="number" placeholder="Ej: 5" defaultValue="5" /></Field>
                </div>
                <div className="form-row">
                  <Field label="Fecha de inicio"><input name="accountStart" type="date" defaultValue={todayISO()} /></Field>
                  <Field label="Duracion de la cuenta">
                  <div className="duration-control">
                    <input
                      name="accountDuration"
                      type="number"
                      placeholder="Duracion cuenta"
                      value={accountDraft.duration}
                      onChange={(event) => setAccountDraft({ ...accountDraft, duration: event.target.value })}
                    />
                    <Select
                      name="accountDurationUnit"
                      options={durationUnits}
                      labels={durationUnitLabels}
                      value={accountDraft.durationUnit}
                      onChange={(value) => setAccountDraft({ ...accountDraft, durationUnit: value })}
                    />
                  </div>
                  </Field>
                </div>
                <Field label="Notas"><textarea name="note" placeholder="Notas de uso o renovacion" /></Field>
                <button className="primary" disabled={saving}><Plus size={18} /> Guardar cuenta</button>
              </form>
            </Panel>
          </section>
        )}

        {view === 'registeredAccounts' && (
          <section className="single-panel wide">
            <Panel title="Cuentas registradas" icon={<ShieldCheck />}>
              <button className="ghost" onClick={() => setShowSecrets(!showSecrets)}>
                {showSecrets ? <EyeOff size={18} /> : <Eye size={18} />}
                {showSecrets ? 'Ocultar claves' : 'Mostrar claves'}
              </button>
              <div className="account-grid">
                {accountsWithUsage.map((account) => editingAccountId === account.id ? (
                  <AccountEditForm
                    key={account.id}
                    account={account}
                    services={data.services}
                    exchangeRate={data.settings.exchangeRate}
                    saving={saving}
                    onCancel={() => setEditingAccountId('')}
                    onSave={(event) => updateAccount(event, account)}
                  />
                ) : (
                  <article className="account-card vault-card" key={account.id}>
                    <span className={`badge ${statusFor(account.end).tone}`}>{statusFor(account.end).label}</span>
                    <div>
                      <strong>{account.service}</strong>
                      <span>{account.linkedSales.length}/{account.maxProfiles} cupos usados</span>
                    </div>
                    <p><Mail size={15} /> {showSecrets ? account.email : maskEmail(account.email)}</p>
                    <p>Cuenta: {account.start} a {account.end} · {statusFor(account.end).label}</p>
                    <p>Clave: {showSecrets ? account.password || 'Sin clave' : '********'}</p>
                    <p>Recuperacion: {showSecrets ? account.recovery || 'Sin dato' : '********'}</p>
                    {account.supplier && <small>Proveedor: {account.supplier}</small>}
                    {account.note && <small className="account-note">{showSecrets ? account.note : 'Nota oculta (puede tener claves). Usa "Mostrar claves" para verla.'}</small>}
                    <div className="profile-list">
                      {account.linkedSales.map((sale) => (
                        <div className="profile-pill" key={sale.id}>
                          <span>{sale.profile || sale.client}</span>
                          <strong>{showSecrets ? sale.pin || 'Sin PIN' : 'PIN ****'}</strong>
                        </div>
                      ))}
                      {account.available > 0 && <div className="profile-pill open-slot"><span>{account.available} cupos libres</span><strong>Disponible</strong></div>}
                    </div>
                    <div className="card-actions">
                      <button title="Editar cuenta" onClick={() => setEditingAccountId(account.id)}><Pencil size={16} /></button>
                      <button title="Copiar correo" onClick={() => navigator.clipboard?.writeText(account.email)}><Copy size={16} /></button>
                      <button title="Eliminar" onClick={() => removeItem('accounts', account.id)}><Trash2 size={16} /></button>
                    </div>
                  </article>
                ))}
                {accountsWithUsage.length === 0 && <Empty text="Guarda tu primera cuenta maestra." />}
              </div>
            </Panel>
          </section>
        )}

        {view === 'providers' && (
          <section className="single-panel wide">
            <section className="grid-two provider-view">
              <Panel title="Nuevo proveedor" icon={<Plus />}>
                <form className="form" onSubmit={addProvider}>
                  <Field label="Nombre del proveedor">
                    <input name="name" placeholder="Ej: Shop_KOKORO, EM STORE, QAMIFY" required />
                  </Field>
                  <Field label="Nota">
                    <textarea name="note" placeholder="Contacto, canal, condiciones, pais, etc." />
                  </Field>
                  <button className="primary" disabled={saving}><Plus size={18} /> Guardar proveedor</button>
                </form>
              </Panel>

              <Panel title="Proveedores registrados" icon={<Tag />}>
                <div className="provider-grid">
                  {providerStats.map((provider) => (
                    <article className="provider-card" key={provider.id || provider.name}>
                      <div>
                        <strong>{provider.name}</strong>
                        <span>{provider.note || 'Sin nota'}</span>
                      </div>
                      <div className="provider-stats">
                        <span>{provider.products} productos</span>
                        <span>{provider.stock} stock total</span>
                      </div>
                      {!baseProviders.includes(provider.name) && (
                        <button className="icon-danger" title="Eliminar proveedor" onClick={() => removeItem('providers', provider.id)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </Panel>
            </section>
          </section>
        )}

        {view === 'services' && (
          <section className="catalog-view">
            <section className="catalog-hero">
              <div>
                <p className="eyebrow">Catalogo inteligente</p>
                <h2>{data.services.length} productos configurados</h2>
                <span>Compra en USD + $0.50 (conversion/impuesto) = costo real. Venta de referencia = costo real x2, en soles con TC {data.settings.exchangeRate}.</span>
              </div>
              <div className="hero-actions">
                {data.services.length === 0 && <button className="primary" onClick={seedServices} disabled={saving}><Sparkles size={18} /> Cargar catalogo completo</button>}
                <button className="ghost" onClick={importKokoroProducts} disabled={saving}><Sparkles size={18} /> Importar Shop_KOKORO</button>
                {data.services.length > 0 && <button className="primary" onClick={applyCatalogMarkup} disabled={saving}><DollarSign size={18} /> Aplicar x2 a todos</button>}
                {data.services.length > 0 && <button className="ghost" onClick={() => downloadCatalogMarkdown(data.services, data.settings.exchangeRate)}><Download size={18} /> Exportar .md</button>}
              </div>
            </section>

            <section className="catalog-search-row">
              <label className="search catalog-search">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, proveedor, categoria o descripcion" />
                {query && <button type="button" title="Limpiar busqueda" onClick={() => setQuery('')}><X size={16} /></button>}
              </label>
              <button className="primary mobile-product-toggle" onClick={() => setShowServiceForm(true)}><Plus size={18} /> Nuevo producto</button>
            </section>

            <section className="catalog-toolbar">
              <div className="chip-row">
                {categoryOptions.map((category) => (
                  <button key={category} className={categoryFilter === category ? 'chip active' : 'chip'} onClick={() => setCategoryFilter(category)}>
                    {category}
                  </button>
                ))}
              </div>
            </section>

            <section className="catalog-layout">
              <div className={showServiceForm ? 'catalog-form-panel is-open' : 'catalog-form-panel'}>
              <Panel title="Nuevo producto" icon={<Plus />}>
                <form className="form" onSubmit={addService} key={serviceFormKey}>
                  <button type="button" className="ghost mobile-form-close" onClick={() => setShowServiceForm(false)}><X size={16} /> Cerrar</button>
                  <Field label="Nombre del producto"><input name="name" placeholder="Ej: Prime Video 6M" required /></Field>
                  <Field label="Descripcion"><textarea name="description" placeholder="Descripcion / condiciones del producto" /></Field>
                  <Field label="Categoria"><Select name="category" options={serviceCategories} /></Field>
                  <div className="form-row">
                    <Field label="Proveedor"><Select name="provider" options={providerOptions} defaultValue="Shop_KOKORO" /></Field>
                    <Field label="Stock"><input name="stock" type="number" min="0" step="1" defaultValue="0" /></Field>
                  </div>
                  <Field label="Duracion">
                    <div className="duration-control">
                      <input name="duration" type="number" placeholder="Duracion" defaultValue="1" />
                      <Select name="durationUnit" options={durationUnits} labels={durationUnitLabels} defaultValue="months" />
                    </div>
                  </Field>
                  <PriceFields exchangeRate={exchangeRateOrDefault(data.settings.exchangeRate)} required />
                  <div className="hint-line">Si dejas el precio final vacio, se guarda la venta x2.</div>
                  <button className="primary" disabled={saving}><Plus size={18} /> Agregar producto</button>
                </form>
              </Panel>
              </div>

              <section className="catalog-grid">
                {filteredServices.map((service) => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    exchangeRate={data.settings.exchangeRate}
                    editing={editingServiceId === service.id}
                    onEdit={() => setEditingServiceId(service.id)}
                    onCancel={() => setEditingServiceId('')}
                    onSave={(event) => updateService(event, service.id)}
                    onDelete={() => removeItem('services', service.id)}
                    providerOptions={providerOptions}
                  />
                ))}
                {filteredServices.length === 0 && <Empty text="No hay productos en esta categoria." />}
              </section>
            </section>
          </section>
        )}
      </section>
    </main>
  );
}

function ServiceCard({ service, exchangeRate, editing, onEdit, onCancel, onSave, onDelete, providerOptions }) {
  if (editing) {
    return <ServiceEditForm service={service} exchangeRate={exchangeRate} providerOptions={providerOptions} onCancel={onCancel} onSave={onSave} />;
  }

  return (
    <article className="service-card">
      <div className="service-card-top">
        <div className="service-logo"><Tag size={18} /></div>
        <div className="mini-actions">
          <button title="Editar" onClick={onEdit}><Pencil size={16} /></button>
          <button title="Eliminar" onClick={onDelete}><Trash2 size={16} /></button>
        </div>
      </div>
      <div>
        <strong>{service.name}</strong>
        <span>{service.category} · {service.provider || 'Sin proveedor'}</span>
        {service.description && <small className="service-description">{service.description}</small>}
      </div>
      <PriceBreakdown costUsd={service.costUsd} exchangeRate={exchangeRate} slots={service.slots} finalPen={service.price} />
      <div className="service-meta">
        <span>{service.duration} dias{slotsOf(service.slots) > 1 ? ` · ${slotsOf(service.slots)} cupos` : ''} · Stock {Number(service.stock || 0)} · TC {Number(exchangeRate || 3.75).toFixed(2)}</span>
        <button type="button" className="card-link" onClick={onEdit}><Pencil size={14} /> Editar precios</button>
      </div>
    </article>
  );
}

function ServiceEditForm({ service, exchangeRate, providerOptions, onCancel, onSave }) {
  const cardRef = useRef(null);

  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  return (
    <article className="service-card editing-card" ref={cardRef}>
      <form className="edit-form" onSubmit={onSave}>
        <div className="service-card-top">
          <div className="edit-title">
            <div className="service-logo"><Pencil size={18} /></div>
            <strong>Editando: {service.name}</strong>
          </div>
          <button type="button" title="Cancelar" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="edit-columns">
          <div className="edit-column">
            <Field label="Nombre del producto">
              <input name="name" defaultValue={service.name} placeholder="Nombre" required />
            </Field>
            <Field label="Descripcion">
              <textarea name="description" defaultValue={service.description} placeholder="Descripcion / condiciones del producto" />
            </Field>
            <div className="form-row">
              <Field label="Categoria">
                <Select name="category" options={serviceCategories} defaultValue={service.category} />
              </Field>
              <Field label="Proveedor">
                <Select name="provider" options={providerOptions} defaultValue={service.provider || 'Shop_KOKORO'} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Stock">
                <input name="stock" type="number" min="0" step="1" defaultValue={Number(service.stock || 0)} />
              </Field>
              <Field label="Duracion">
                <div className="duration-control">
                  <input name="duration" type="number" defaultValue={service.duration} placeholder="Duracion" />
                  <Select name="durationUnit" options={durationUnits} labels={durationUnitLabels} defaultValue="days" />
                </div>
              </Field>
            </div>
          </div>
          <div className="edit-column">
            <PriceFields exchangeRate={exchangeRate} initialCost={service.costUsd} initialPrice={service.price} initialSlots={service.slots} />
          </div>
        </div>
        <div className="edit-actions">
          <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="primary" type="submit"><Save size={17} /> Guardar cambios</button>
        </div>
      </form>
    </article>
  );
}

function AccountEditForm({ account, services, exchangeRate, saving, onCancel, onSave }) {
  const [product, setProduct] = useState({ serviceId: account.serviceId || '', serviceSearch: account.service || '' });
  const cardRef = useRef(null);

  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  return (
    <article className="account-card vault-card editing-account" ref={cardRef}>
      <form className="form" onSubmit={onSave}>
        <div className="edit-title">
          <div className="service-logo"><Pencil size={18} /></div>
          <strong>Editando cuenta</strong>
        </div>
        <Field label="Producto de la cuenta">
          <ServicePicker
            services={services}
            value={product.serviceSearch}
            selectedId={product.serviceId}
            exchangeRate={exchangeRate}
            onInput={(value) => setProduct({ serviceSearch: value, serviceId: '' })}
            onSelect={(service) => setProduct({ serviceId: service.id, serviceSearch: service.name })}
          />
        </Field>
        <Field label="Correo o usuario"><input name="email" defaultValue={account.email} required /></Field>
        <Field label="Contrasena"><input name="password" defaultValue={account.password} placeholder="Clave de la cuenta" /></Field>
        <Field label="Recuperacion"><input name="recovery" defaultValue={account.recovery} placeholder="Telefono, correo o codigo de respaldo" /></Field>
        <div className="form-row">
          <Field label="Proveedor"><input name="supplier" defaultValue={account.supplier} placeholder="A quien se la compraste" /></Field>
          <Field label="Perfiles / cupos"><input name="maxProfiles" type="number" min="1" defaultValue={account.maxProfiles} /></Field>
        </div>
        <div className="form-row">
          <Field label="Fecha de inicio"><input name="accountStart" type="date" defaultValue={account.start} /></Field>
          <Field label="Duracion de la cuenta">
            <div className="duration-control">
              <input name="accountDuration" type="number" min="1" defaultValue={account.duration} />
              <Select name="accountDurationUnit" options={durationUnits} labels={durationUnitLabels} defaultValue="days" />
            </div>
          </Field>
        </div>
        <Field label="Notas"><textarea name="note" defaultValue={account.note} placeholder="Notas de uso o renovacion" /></Field>
        <div className="edit-actions">
          <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
          <button className="primary" disabled={saving}><Save size={17} /> Guardar cambios</button>
        </div>
      </form>
    </article>
  );
}

function catalogMarkdown(services, exchangeRate) {
  const rate = exchangeRateOrDefault(exchangeRate);
  const cell = (value) => String(value ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const lines = [
    '# Catalogo de productos',
    '',
    `Generado el ${todayISO()} · ${services.length} productos · Tipo de cambio ${rate.toFixed(2)}`,
    '',
    '> Costo real = (compra USD + $0.50) x TC, dividido entre los cupos. Venta x2 = costo real x2. Precio final = lo que cobras.',
    '',
  ];
  const categories = [...new Set(services.map((service) => service.category || 'Otros'))].sort((a, b) => a.localeCompare(b));

  categories.forEach((category) => {
    const items = services
      .filter((service) => (service.category || 'Otros') === category)
      .sort((a, b) => a.name.localeCompare(b.name));
    lines.push(`## ${category} (${items.length})`, '');
    lines.push('| Producto | Proveedor | Stock | Duracion | Cupos | Compra USD | Costo real S/ | Venta x2 S/ | Precio final S/ |');
    lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
    items.forEach((service) => {
      const cupos = slotsOf(service.slots);
      const hasCost = Number(service.costUsd || 0) > 0;
      const slotCost = realCostPen(service.costUsd, rate) / cupos;
      lines.push(
        `| ${cell(service.name)} | ${cell(service.provider || 'Sin proveedor')} | ${Number(service.stock || 0)} | ${service.duration} dias | ${cupos} | ${hasCost ? usd(service.costUsd) : '-'} | ${hasCost ? slotCost.toFixed(2) : '-'} | ${hasCost ? catalogSalePen(service.costUsd, rate, cupos).toFixed(2) : '-'} | ${Number(service.price || 0) > 0 ? Number(service.price).toFixed(2) : '-'} |`
      );
    });
    lines.push('');
  });

  const described = services.filter((service) => service.description?.trim()).sort((a, b) => a.name.localeCompare(b.name));
  if (described.length) {
    lines.push('## Descripciones', '');
    described.forEach((service) => lines.push(`### ${service.name}`, '', service.description.trim(), ''));
  }
  return lines.join('\n');
}

function downloadCatalogMarkdown(services, exchangeRate) {
  const blob = new Blob([catalogMarkdown(services, exchangeRate)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `catalogo-productos-${todayISO()}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function SetupScreen() {
  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="brand center-brand">
          <div className="brand-mark brand-logo"><img src="/brand/qyro-logo.png" alt="QYRO" /></div>
          <div>
            <strong>QYRO necesita Supabase</strong>
            <span>{supabaseUrl}</span>
          </div>
        </div>
        <p>Agrega estas variables en Vercel y en tu archivo local `.env`:</p>
        <pre>{`VITE_SUPABASE_URL=https://zikinzvbvpkeuwuuldow.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_public_key`}</pre>
      </section>
    </div>
  );
}

function AuthScreen({ allowSignup, mode, setMode, message, saving, trustedEmail, onSubmit }) {
  const isSignup = mode === 'signup';
  return (
    <div className="auth-shell">
      <section className="auth-card auth-card-premium">
        <div className="auth-glow" />
        <div className="auth-hero">
          <div className="auth-logo-scene">
            <img src="/brand/qyro-logo-full.png" alt="QYRO Intelligence, reimagined" />
          </div>
          <div className="brand center-brand auth-brand">
            <div className="brand-mark brand-logo"><img src="/brand/qyro-logo.png" alt="QYRO" /></div>
            <div>
              <strong>QYRO</strong>
              <span>{allowSignup ? 'Modo admin de usuarios' : 'Ventas digitales inteligentes'}</span>
            </div>
          </div>
          <div className="auth-badge"><ShieldCheck size={16} /> Acceso seguro</div>
          <h1>{isSignup ? 'Crear usuario admin' : 'Intelligence, reimagined.'}</h1>
          <p>Tu centro privado para catalogo, cuentas, clientes, vencimientos y ganancias.</p>
        </div>

        <form className="form auth-form" onSubmit={onSubmit} autoComplete={isSignup ? 'on' : 'on'}>
          <label className="auth-field">
            <span>Correo de acceso</span>
            <input
              name="email"
              type="email"
              inputMode="email"
              placeholder="tu-correo@dominio.com"
              defaultValue={trustedEmail}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
            />
          </label>
          <label className="auth-field">
            <span>Contrasena</span>
            <input
              name="password"
              type="password"
              placeholder={isSignup ? 'Crea una clave segura' : 'Rellenar con Face ID'}
              minLength="6"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
            />
          </label>
          <label className="auth-check">
            <input name="trustedDevice" type="checkbox" defaultChecked={Boolean(trustedEmail)} />
            <span>Confiar en este dispositivo y recordar mi correo</span>
          </label>
          <button className="primary auth-submit" disabled={saving}>
            <LockKeyhole size={18} />
            {saving ? 'Verificando...' : isSignup ? 'Crear cuenta' : 'Entrar seguro'}
          </button>
          <button className="ghost full auth-save" type="submit" value="save-password" disabled={saving}>
            Guardar contrasena en el navegador
          </button>
          <p className="auth-help">En iPhone, Safari mostrara Face ID cuando la clave quede guardada en iCloud Keychain.</p>
        </form>

        <div className="auth-security">
          <span><Smartphone size={16} /> Compatible con Face ID</span>
          <span><ShieldCheck size={16} /> Tus datos viven en Supabase</span>
        </div>

        {allowSignup && (
          <button className="ghost full" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
            {mode === 'signup' ? 'Ir a login' : 'Modo crear usuario'}
          </button>
        )}
        {message && <div className="notice">{message}</div>}
      </section>
    </div>
  );
}

function Metric({ icon, label, value, sub }) {
  return (
    <article className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function Panel({ title, icon, children }) {
  return (
    <section className="panel">
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ServicePicker({ services, value, selectedId, exchangeRate, onInput, onSelect }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const normalize = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const terms = normalize(value).split(/\s+/).filter(Boolean);
  const filtered = services
    .filter((service) => {
      const haystack = normalize(`${service.name} ${service.category} ${service.provider} stock ${service.stock} ${service.description} ${service.duration}d ${service.duration} dias`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 20);
  const selected = services.find((service) => service.id === selectedId);

  useEffect(() => {
    const closeFromOutside = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeFromOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('mousedown', closeFromOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  return (
    <div className="combo" ref={pickerRef}>
      <input type="hidden" name="serviceId" value={selectedId} />
      <div className="combo-input-wrap">
        <input
          name="serviceSearch"
          value={value}
          onChange={(event) => {
            onInput(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar y seleccionar producto"
          autoComplete="off"
          required
        />
        {value && (
          <button
            type="button"
            title="Limpiar busqueda"
            onClick={() => {
              onInput('');
              setOpen(false);
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {selected && (
        <div className="selected-service">
          <span>{selected.category} · {selected.provider || 'Sin proveedor'} · {selected.duration} dias</span>
          <strong>{Number(selected.price || 0) > 0 ? money(selected.price) : 'Precio manual'}</strong>
        </div>
      )}
      {selected && (
        <div className="selected-service-detail">
          <div>
            <span>Descripcion</span>
            <strong>{selected.description || 'Sin descripcion guardada'}</strong>
          </div>
          <div className="detail-grid">
            <span>Categoria: {selected.category}</span>
            <span>Duracion: {selected.duration} dias</span>
            <span>Proveedor: {selected.provider || 'Sin proveedor'}</span>
            <span>Stock: {Number(selected.stock || 0)}</span>
          </div>
          <PriceBreakdown costUsd={selected.costUsd} exchangeRate={exchangeRate} slots={selected.slots} finalPen={selected.price} />
        </div>
      )}
      {open && (
        <div className="combo-menu">
          {filtered.map((service) => {
            const hasPrice = Number(service.price || 0) > 0;
            return (
              <button
                type="button"
                key={service.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(service);
                  setOpen(false);
                }}
              >
                <span>
                  <strong>{service.name}</strong>
                  <small>{service.category} · {service.provider || 'Sin proveedor'} · {service.duration} dias · Stock {Number(service.stock || 0)}</small>
                </span>
                <em className={hasPrice ? '' : 'manual-price'}>{hasPrice ? money(service.price) : 'Sin precio'}</em>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="combo-empty">No hay productos con ese nombre.</div>}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="field-label">
      <span>{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}

function PriceBreakdown({ costUsd, exchangeRate, finalPen, slots = 1 }) {
  const rate = exchangeRateOrDefault(exchangeRate);
  const buyUsd = Number(costUsd || 0);
  if (!(buyUsd > 0)) {
    return <div className="hint-line">Falta la compra en USD para calcular costo real y venta x2.</div>;
  }
  const cupos = slotsOf(slots);
  const shared = cupos > 1;
  const realUsd = realCostUsd(buyUsd);
  const accountPen = realUsd * rate;
  const slotCostPen = accountPen / cupos;
  const suggestedUsd = catalogSaleUsd(buyUsd) / cupos;
  const finalValue = Number(finalPen || 0);
  const profit = finalValue - slotCostPen;
  const finalTone = finalValue <= 0 ? '' : profit > 0.05 ? 'is-gain' : 'is-loss';
  const perSlot = shared ? ' por cupo' : '';
  const finalNote =
    finalValue <= 0
      ? 'Aun sin precio'
      : profit > 0.05
        ? `Ganas ${soles(profit)}${perSlot}`
        : profit < -0.05
          ? `Pierdes ${soles(-profit)}${perSlot}`
          : 'Sin ganancia';
  const fullRevenue = finalValue * cupos;
  const fullProfit = fullRevenue - accountPen;
  const breakEven = finalValue > 0 ? Math.ceil((accountPen - 0.005) / finalValue) : 0;

  return (
    <div className="price-block">
      <div className="price-breakdown">
        <div>
          <span>Compra</span>
          <strong>{usd(buyUsd)}</strong>
          <small>{shared ? `Cuenta de ${cupos} cupos` : 'Precio proveedor'}</small>
        </div>
        <div>
          <span>{shared ? 'Costo real por cupo' : 'Costo real'}</span>
          <strong>{soles(slotCostPen)}</strong>
          <small>{shared ? `${soles(accountPen)} cuenta / ${cupos}` : `${usd(realUsd)} (+$0.50)`}</small>
        </div>
        <div className="is-reference">
          <span>{shared ? 'Venta x2 por cupo' : 'Venta x2'}</span>
          <strong>{soles(suggestedUsd * rate)}</strong>
          <small>{usd(suggestedUsd)} referencia</small>
        </div>
        <div className={finalTone}>
          <span>{shared ? 'Precio final por cupo' : 'Precio final'}</span>
          <strong>{finalValue > 0 ? soles(finalValue) : '-'}</strong>
          <small>{finalNote}</small>
        </div>
      </div>
      {shared && finalValue > 0 && (
        <div className={`price-summary ${fullProfit > 0.05 ? 'is-gain' : 'is-loss'}`}>
          <span>
            Vendiendo los {cupos} cupos: {cupos} x {soles(finalValue)} = <strong>{soles(fullRevenue)}</strong>
            {' '}→ {fullProfit >= 0 ? 'ganas' : 'pierdes'} <strong>{soles(Math.abs(fullProfit))}</strong> por cuenta
          </span>
          <small>
            {breakEven <= cupos
              ? `Recuperas lo invertido (${soles(accountPen)}) con ${breakEven} ${breakEven === 1 ? 'venta' : 'ventas'}.`
              : `Ni vendiendo los ${cupos} cupos recuperas los ${soles(accountPen)}.`}
          </small>
        </div>
      )}
    </div>
  );
}

function PriceFields({ exchangeRate, initialCost = '', initialPrice = '', initialSlots = 1, required = false }) {
  const [costUsd, setCostUsd] = useState(Number(initialCost) > 0 ? String(initialCost) : '');
  const [slots, setSlots] = useState(String(slotsOf(initialSlots)));
  const [pricePen, setPricePen] = useState(Number(initialPrice) > 0 ? String(Number(Number(initialPrice).toFixed(2))) : '');
  const suggestedPen = catalogSalePen(costUsd, exchangeRate, slots);

  return (
    <>
      <div className="form-row">
        <Field label="Compra proveedor USD">
          <input name="costUsd" type="number" step="0.01" value={costUsd} onChange={(event) => setCostUsd(event.target.value)} placeholder="Ej: 5.00" required={required} />
        </Field>
        <Field label="Cupos por cuenta">
          <input name="slots" type="number" min="1" step="1" value={slots} onChange={(event) => setSlots(event.target.value)} placeholder="1" />
        </Field>
      </div>
      <Field label={slotsOf(slots) > 1 ? 'Precio final venta S/ (por cupo)' : 'Precio final venta S/'} hint="1 cupo = cuenta completa para un cliente. Compartida entre 5 = 5 cupos.">
        <input name="price" type="number" step="0.01" value={pricePen} onChange={(event) => setPricePen(event.target.value)} placeholder={suggestedPen > 0 ? `x2: ${suggestedPen.toFixed(2)}` : 'Auto x2'} />
      </Field>
      <PriceBreakdown costUsd={costUsd} exchangeRate={exchangeRate} slots={slots} finalPen={pricePen || suggestedPen} />
      {suggestedPen > 0 && (
        <button type="button" className="ghost" onClick={() => setPricePen(String(suggestedPen))}>
          Usar venta x2 ({soles(suggestedPen)}{slotsOf(slots) > 1 ? ' por cupo' : ''})
        </button>
      )}
    </>
  );
}

function exchangeRateOrDefault(value) {
  return Number(value) > 0 ? Number(value) : 3.75;
}

function Select({ name, options, labels, defaultValue, value, onChange }) {
  const controlled = value !== undefined ? { value, onChange: (event) => onChange?.(event.target.value) } : { defaultValue };
  return (
    <label className="select">
      <select name={name} {...controlled}>
        {options.map((option, index) => {
          const value = String(option).includes('|') ? String(option).split('|')[0] : option;
          return <option key={`${option}-${index}`} value={value}>{labels?.[index] ?? option}</option>;
        })}
      </select>
      <ChevronDown size={16} />
    </label>
  );
}

function SaleRow({ sale, group, exchangeRate, revealSecrets = false, saving = false, onUpdate, onDelete }) {
  const state = statusFor(sale.end);
  const [editing, setEditing] = useState(false);
  const draftFromSale = () => ({ price: String(sale.price || ''), pin: sale.pin || '', profile: sale.profile || '' });
  const [draft, setDraft] = useState(draftFromSale);
  const rate = Number(sale.exchangeRate || exchangeRate || 3.75);
  const costPen = saleCostPen(sale, exchangeRate);
  const suggestedPen = catalogSalePen(sale.costUsd, rate, sale.slots);
  const cupos = slotsOf(sale.slots);
  const profit = saleProfit(sale, exchangeRate);
  const profitTone = profit > 0.05 ? 'is-gain' : 'is-loss';
  const profitNote = profit > 0.05 ? 'Ganancia' : profit < -0.05 ? 'Perdida' : 'Vendiste al costo';
  const hasAccount = sale.account && sale.account !== 'Sin cuenta asignada';

  const savePrice = async (event) => {
    event.preventDefault();
    const ok = await onUpdate?.(draft);
    if (ok) setEditing(false);
  };

  return (
    <article className="sale-row">
      <div className="sale-head">
        <div className="avatar">{(sale.client || '??').slice(0, 2).toUpperCase()}</div>
        <div className="sale-title">
          <strong>{sale.client}</strong>
          <span>{sale.service}</span>
        </div>
        <span className={`badge ${state.tone}`}>{state.label}</span>
        <div className="sale-actions">
          {onUpdate && (
            <button title="Editar precio, perfil y PIN" onClick={() => { setDraft(draftFromSale()); setEditing(!editing); }}>
              <Pencil size={16} />
            </button>
          )}
          {onDelete && <button className="icon-danger" title="Eliminar" onClick={onDelete}><Trash2 size={16} /></button>}
        </div>
      </div>

      <div className="sale-details">
        <span><UserRound size={14} /> Perfil: {sale.profile || 'Sin perfil'}</span>
        <span><Smartphone size={14} /> {sale.phone || 'Sin WhatsApp'}</span>
        <span><Mail size={14} /> {hasAccount ? (revealSecrets ? sale.account : maskEmail(sale.account)) : 'Sin cuenta asignada'}</span>
        <span><LockKeyhole size={14} /> PIN: {sale.pin ? (revealSecrets ? sale.pin : '****') : 'Sin PIN'}</span>
        <span><CalendarClock size={14} /> {sale.start} a {sale.end}</span>
      </div>

      <div className="price-breakdown sale-money">
        <div>
          <span>{cupos > 1 ? 'Costo real (cupo)' : 'Costo real'}</span>
          <strong>{soles(costPen)}</strong>
          <small>({usd(sale.costUsd)} + $0.50) x {rate.toFixed(2)}{cupos > 1 ? ` / ${cupos}` : ''}</small>
        </div>
        <div className="is-reference">
          <span>Venta x2</span>
          <strong>{Number(sale.costUsd) > 0 ? soles(suggestedPen) : '-'}</strong>
          <small>Referencia</small>
        </div>
        <div>
          <span>Vendido</span>
          <strong>{soles(sale.price)}</strong>
          <small>{sale.paid ? 'Pagado' : 'Pendiente de pago'}</small>
        </div>
        <div className={profitTone}>
          <span>{cupos > 1 ? 'Ganancia por cupo' : 'Ganancia'}</span>
          <strong>{soles(profit)}</strong>
          <small>{profitNote}</small>
        </div>
      </div>

      {group && group.slots > 1 && <SharedAccountStatus group={group} />}

      {editing && (
        <form className="sale-edit" onSubmit={savePrice}>
          <div className="form-row">
            <Field label="Perfil / usuario">
              <input value={draft.profile} onChange={(event) => setDraft({ ...draft, profile: event.target.value })} placeholder="Ej: Perfil 3" />
            </Field>
            <Field label="PIN del cliente">
              <input value={draft.pin} onChange={(event) => setDraft({ ...draft, pin: event.target.value })} placeholder="Ej: 1234" autoFocus />
            </Field>
          </div>
          <Field label="Precio final de venta S/">
            <input type="number" step="0.01" min="0" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} required />
          </Field>
          <div className="sale-edit-actions">
            {Number(sale.costUsd) > 0 && (
              <button type="button" className="ghost" onClick={() => setDraft({ ...draft, price: String(suggestedPen) })}>Usar x2 ({soles(suggestedPen)})</button>
            )}
            <button type="button" className="ghost" onClick={() => setEditing(false)}>Cancelar</button>
            <button className="primary" disabled={saving}><Save size={16} /> Guardar</button>
          </div>
        </form>
      )}
    </article>
  );
}

function SharedAccountStatus({ group }) {
  const recovered = group.balance >= -0.005;
  return (
    <div className={`price-summary ${recovered ? 'is-gain' : 'is-loss'}`}>
      <span>
        Cuenta compartida: <strong>{group.sold}/{group.accountsBought * group.slots}</strong> cupos vendidos · cobrado {soles(group.revenue)} de {soles(group.cost)} invertido
      </span>
      <small>
        {recovered
          ? `Inversion recuperada. Llevas +${soles(group.balance)} en esta cuenta.`
          : `Te faltan ${soles(-group.balance)} (unas ${group.needed} ${group.needed === 1 ? 'venta' : 'ventas'} mas) para recuperar lo invertido.`}
        {group.free > 0 ? ` Si vendes los ${group.free} cupos libres: ${soles(group.projected)} de ganancia.` : ''}
      </small>
    </div>
  );
}

function SharedAccountCard({ group }) {
  const recovered = group.balance >= -0.005;
  const capacity = group.accountsBought * group.slots;
  return (
    <article className={`shared-card ${recovered ? 'is-gain' : 'is-loss'}`}>
      <div className="shared-card-head">
        <strong>{group.service}</strong>
        <span className={`badge ${recovered ? 'success' : 'warning'}`}>{recovered ? 'Recuperada' : 'Recuperando'}</span>
      </div>
      <small>{group.account ? maskEmail(group.account) : 'Sin cuenta asignada'}</small>
      <div className="slot-bar" aria-label={`${group.sold} de ${capacity} cupos vendidos`}>
        {Array.from({ length: capacity }, (_, index) => (
          <span key={index} className={index < group.sold ? 'filled' : ''} />
        ))}
      </div>
      <div className="shared-card-numbers">
        <span>{group.sold}/{capacity} cupos</span>
        <span>Cobrado {soles(group.revenue)}</span>
        <span>Invertido {soles(group.cost)}</span>
      </div>
      <strong className={recovered ? 'profit-positive' : 'profit-zero'}>
        {recovered ? `+${soles(group.balance)}` : `-${soles(-group.balance)}`}
      </strong>
      <small>
        {recovered ? 'Ya no pierdes con esta cuenta.' : `Faltan ${group.needed} ${group.needed === 1 ? 'venta' : 'ventas'} para recuperar.`}
        {group.free > 0 ? ` Llenando cupos: ${soles(group.projected)}.` : ''}
      </small>
      <details className="buyers">
        <summary>
          <Users size={15} /> Compradores ({group.sold})
          <ChevronDown size={15} className="buyers-arrow" />
        </summary>
        <ul>
          {group.sales.map((sale) => {
            const state = statusFor(sale.end);
            return (
              <li key={sale.id}>
                <div>
                  <strong>{sale.client}</strong>
                  <small>{sale.profile ? `Perfil: ${sale.profile} · ` : ''}{sale.phone || 'Sin WhatsApp'} · vence {sale.end}</small>
                </div>
                <div className="buyer-side">
                  <strong>{soles(sale.price)}</strong>
                  <span className={`badge ${state.tone}`}>{sale.paid ? state.label : 'Por cobrar'}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </details>
    </article>
  );
}

function maskEmail(email = '') {
  const [name, domain] = email.split('@');
  if (!domain) return '********';
  return `${name.slice(0, 2)}****@${domain}`;
}

function Empty({ text }) {
  return (
    <div className="empty">
      <Check size={20} />
      <span>{text}</span>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);

