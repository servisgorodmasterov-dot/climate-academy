// Чтение каталога из Google Таблицы на сервере. Браузер ключей не получает.
// Режим 1 (рекомендуется): сервисный аккаунт — таблица остаётся закрытой, доступ только у аккаунта.
// Режим 2: API-ключ — подходит только для таблицы с доступом «всем, у кого есть ссылка».
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SHEET_NAMES = {
  products: 'Товары',
  prices: 'Цены',
  works: 'Работы',
  kits: 'Комплектации',
  suppliers: 'Поставщики',
  consumables: 'Расходники',
  categories: 'Категории',
  objectTypes: 'Объекты',
  objectSlots: 'Позиции объектов',
};

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function serviceAccountFromEnv(env = process.env) {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (env.GOOGLE_SERVICE_ACCOUNT_FILE) return JSON.parse(readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8'));
  return null;
}

export function signJwt(sa, now = Math.floor(Date.now() / 1000), tokenUrl = 'https://oauth2.googleapis.com/token') {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: tokenUrl,
    iat: now,
    exp: now + 3600,
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = createSign('RSA-SHA256').update(body).sign(sa.private_key);
  return `${body}.${b64url(sig)}`;
}

export function createSheetsClient({ env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const sheetId = env.GOOGLE_SHEETS_ID;
  const apiKey = env.GOOGLE_API_KEY;
  const sa = serviceAccountFromEnv(env);
  const ttlMs = Number(env.CATALOG_TTL_SECONDS ?? 300) * 1000;
  const apiBase = env.SHEETS_API_BASE ?? 'https://sheets.googleapis.com/v4/spreadsheets';
  const tokenUrl = env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token';
  let token = null;
  let cache = null;

  const configured = Boolean(sheetId && (sa || apiKey));

  async function accessToken() {
    if (token && token.exp - 60_000 > now()) return token.value;
    const assertion = signJwt(sa, Math.floor(now() / 1000), tokenUrl);
    const res = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`Google OAuth: ${res.status}`);
    const j = await res.json();
    token = { value: j.access_token, exp: now() + (j.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function fetchSheets() {
    const params = new URLSearchParams();
    for (const name of Object.values(SHEET_NAMES)) params.append('ranges', name);
    params.set('valueRenderOption', 'UNFORMATTED_VALUE');
    params.set('dateTimeRenderOption', 'FORMATTED_STRING');
    const headers = {};
    if (sa) headers.Authorization = `Bearer ${await accessToken()}`;
    else params.set('key', apiKey);
    const res = await fetchImpl(`${apiBase}/${encodeURIComponent(sheetId)}/values:batchGet?${params}`, { headers });
    if (!res.ok) throw new Error(`Google Sheets: ${res.status}`);
    const j = await res.json();
    const sheets = {};
    const keys = Object.keys(SHEET_NAMES);
    (j.valueRanges ?? []).forEach((vr, i) => {
      sheets[keys[i]] = (vr.values ?? []).map((row) => row.map((c) => (c == null ? '' : String(c))));
    });
    for (const k of keys) sheets[k] ??= [];
    return sheets;
  }

  /** Каталог с кэшем; при ошибке Google отдаётся последняя успешная копия с пометкой stale. */
  async function getCatalog({ force = false } = {}) {
    if (!configured) return { status: 503, body: { error: 'Google Sheets не настроен: задайте GOOGLE_SHEETS_ID и GOOGLE_SERVICE_ACCOUNT_FILE (или GOOGLE_API_KEY)' } };
    if (!force && cache && now() - cache.at < ttlMs) return { status: 200, body: cache.body };
    try {
      const sheets = await fetchSheets();
      cache = { at: now(), body: { sheets, fetchedAt: new Date(now()).toISOString(), stale: false } };
      return { status: 200, body: cache.body };
    } catch (e) {
      if (cache) return { status: 200, body: { ...cache.body, stale: true, error: e.message } };
      return { status: 502, body: { error: e.message } };
    }
  }

  return { configured, getCatalog, mode: sa ? 'service-account' : apiKey ? 'api-key' : 'none' };
}
