import { describe, expect, it, vi } from 'vitest';
import { loadConfig, loadE2eConfig } from '../src/config.js';
import { AuthenticatedBringTransport } from '../src/bring-transport.js';

const configEnv = {
  BRING_ENV: 'test',
  BRING_EMAIL: 'tester@example.invalid',
  BRING_PASSWORD: 'not-a-real-password',
  BRING_DEFAULT_LIST: 'Test List A',
  BRING_ALLOWED_LISTS: 'Test List A',
  BRING_TEST_ITEM_PREFIX: 'MCP-TEST-',
};

describe('authenticated Bring transport contract', () => {
  it('logs in with URLSearchParams and v2-compatible authenticated headers', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-secret', uuid: 'account-id' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ lists: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const transport = await AuthenticatedBringTransport.login(loadConfig(configEnv), fetch);
    await transport.getJson('/bringlists');

    expect(fetch).toHaveBeenNthCalledWith(1, 'https://api.getbring.com/rest/v2/bringauth', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: 'email=tester%40example.invalid&password=not-a-real-password',
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://api.getbring.com/rest/v2/bringlists', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer access-secret',
        'X-BRING-API-KEY': 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp',
        'X-BRING-CLIENT': 'webApp',
        'X-BRING-CLIENT-SOURCE': 'webApp',
        'X-BRING-COUNTRY': 'DE',
        'X-BRING-USER-UUID': 'account-id',
      }),
    }));
    expect(transport.putHeaders).toEqual(expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }));
  });

  it('keeps public requests strictly unauthenticated', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-secret', uuid: 'account-id' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('image', { status: 200 }));
    const transport = await AuthenticatedBringTransport.login(loadConfig(configEnv), fetch);
    await transport.fetchPublic('https://web.getbring.com/locale/catalog.de-DE.json', { method: 'GET', headers: { Authorization: 'should-not-leak' } });

    expect(fetch).toHaveBeenLastCalledWith('https://web.getbring.com/locale/catalog.de-DE.json', { method: 'GET' });
  });

  it('redacts credentials from login failures', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('password=not-a-real-password', { status: 401 }));
    await expect(AuthenticatedBringTransport.login(loadConfig(configEnv), fetch)).rejects.toThrow('Bring login failed (HTTP 401)');
    await expect(AuthenticatedBringTransport.login(loadConfig(configEnv), fetch)).rejects.not.toThrow('not-a-real-password');
  });
});

describe('live E2E configuration gate', () => {
  it('requires test environment, an exact test-list allowlist, and a non-empty prefix', () => {
    expect(() => loadE2eConfig({ ...configEnv, BRING_ENV: 'prod' })).toThrow('Invalid Bring E2E configuration');
    expect(() => loadE2eConfig({ ...configEnv, BRING_ALLOWED_LISTS: 'Test List A,other' })).toThrow('Invalid Bring E2E configuration');
    expect(() => loadE2eConfig({ ...configEnv, BRING_TEST_ITEM_PREFIX: '' })).toThrow('Invalid Bring E2E configuration');
  });

  it('allows a second list only when it is explicitly named and allowlisted', () => {
    expect(loadE2eConfig({ ...configEnv, BRING_TEST_SECOND_LIST: 'Test List B', BRING_ALLOWED_LISTS: 'Test List A,Test List B' }).secondList).toBe('Test List B');
  });
});
