import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.js';
import { config, fixture, instance } from './fixture.js';
const origin = 'https://calendar.deweyscrewem.com';
const send = (url, options = {}) => new Promise((resolve, reject) => {
  const req = http.request(url, options, res => {
    let body = ''; res.setEncoding('utf8'); res.on('data', chunk => body += chunk);
    res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(Object.entries(res.headers).map(([k,v]) => [k, Array.isArray(v) ? v.join(';') : v])), json: async () => JSON.parse(body) }));
  });
  req.on('error', reject); req.end(options.body);
});
test('hosted proxy requires exact HTTPS origin, preserves secure sessions and throttles login', async () => {
  const f = fixture(), app = createApp({ config: { ...config, publicOrigin: origin }, fetchImpl: f.fetchImpl });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/demo/`;
  const headers = { Host: new URL(origin).host, 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.20', origin, 'x-demo-request': '1', 'content-type': 'application/json' };
  const login = { instance, email: 'avery@example.test', password: 'private-password' };
  try {
    for (const change of [{ Host: 'attacker.example' }, { 'x-forwarded-proto': 'http' }, { origin: 'https://attacker.example' }]) {
      const r = await send(url + 'login', { method: 'POST', headers: { ...headers, ...change }, body: JSON.stringify(login) });
      assert.equal(r.status, 403);
    }
    assert.equal(f.calls.length, 0);
    const r = await send(url + 'login', { method: 'POST', headers, body: JSON.stringify(login) });
    const result = await r.json();
    assert.equal(r.status, 200, JSON.stringify(result));
    assert.equal(result.session?.authenticated, true, JSON.stringify(result));
    assert.match(r.headers.get('set-cookie'), /Secure/);
    for (let i = 0; i < 9; i++) await send(url + 'login', { method: 'POST', headers, body: '{}' });
    const limited = await send(url + 'login', { method: 'POST', headers, body: '{}' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
  } finally { app.locals.close(); await new Promise(r => server.close(r)); }
});
test('public hosting rejects insecure or unapproved service configuration', () => {
  assert.throws(() => createApp({ config: { ...config, publicOrigin: 'http://calendar.deweyscrewem.com' } }), /HTTPS/);
  assert.throws(() => createApp({ config: { ...config, auth: 'https://api.auth.feradel.com', publicOrigin: origin } }), /ALLOWED_API_URLS/);
});
