import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createSheetsClient, signJwt } from './catalog.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = { client_email: 'bot@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };

describe('Сервер каталога', () => {
  it('подписывает JWT сервисного аккаунта (RS256, только чтение)', () => {
    const jwt = signJwt(sa, 1000);
    const [h, c, s] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims).toMatchObject({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', iat: 1000, exp: 4600 });
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
  });
  it('без настроек отвечает 503', async () => {
    const r = await createSheetsClient({ env: {} }).getCatalog();
    expect(r.status).toBe(503);
  });
  it('читает листы, кэширует и отдаёт устаревшую копию при сбое Google', async () => {
    let t = 0;
    let fail = false;
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(String(url));
      if (String(url).includes('token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      if (fail) return new Response('', { status: 500 });
      expect(init.headers.Authorization).toBe('Bearer tok');
      return new Response(JSON.stringify({ valueRanges: [{ values: [['product_id'], ['P1']] }, { values: [['product_id', 'sale_price'], ['P1', 4400]] }] }));
    };
    const c = createSheetsClient({ env: { GOOGLE_SHEETS_ID: 'sheet1', GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa), CATALOG_TTL_SECONDS: '60' }, fetchImpl, now: () => t });
    const r1 = await c.getCatalog();
    expect(r1.body.sheets.prices[1]).toEqual(['P1', '4400']);
    expect(r1.body.sheets.suppliers).toEqual([]);
    expect(decodeURIComponent(calls[1])).toContain('ranges=Товары');
    await c.getCatalog();
    expect(calls).toHaveLength(2); // кэш
    t = 120_000;
    fail = true;
    const r3 = await c.getCatalog();
    expect(r3.body.stale).toBe(true);
  });
});
