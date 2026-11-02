import { describe, expect, it, vi } from 'vitest';
import { AuthenticatedBringTransport } from '../src/bring-transport.js';
import { safeErrorMessage } from '../src/redaction.js';

const credentials = { email: 'synthetic@example.invalid', password: 'synthetic-password' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const login = (token = 'old', uuid = 'account') => json({ access_token: token, uuid });
const auth = (init?: RequestInit) => new Headers(init?.headers).get('authorization');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('bounded transport auth recovery (synthetic fetch only)', () => {
  it.each(['initial', 'renewed'])('sanitizes malformed %s authentication headers', async (phase) => {
    const marker = 'synthetic-private-marker';
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      new Request(url, init);
      return json({});
    }).mockResolvedValueOnce(login(phase === 'initial' ? `${marker}\ninvalid` : 'old'))
      .mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(login(`${marker}\ninvalid`));
    let transport: AuthenticatedBringTransport | undefined;
    const error = await (async () => {
      transport = await AuthenticatedBringTransport.login(credentials, fetch);
      await transport.getJson('/bringlists/list');
    })().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'UPSTREAM_FAILURE' });
    expect(String(error)).not.toContain(marker);
    expect(safeErrorMessage(error)).not.toMatch(/synthetic-private-marker|synthetic-password|synthetic@example/);
    expect(fetch).toHaveBeenCalledTimes(phase === 'initial' ? 1 : 3);
    if (transport) {
      expect(transport.userUuid).toBe('account');
      expect(auth({ headers: transport.headers })).toBe('Bearer old');
    }
  });

  it('sanitizes malformed caller headers without dispatch or renewal', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(login());
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    const error = await transport.fetch('/bringlists/list', { headers: { Authorization: 'synthetic-private-marker\ninvalid' } }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'UPSTREAM_FAILURE' });
    expect(safeErrorMessage(error)).not.toContain('synthetic-private-marker');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('recovers a read once after explicit 401 and replaces copied stale headers', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(login('new')).mockResolvedValueOnce(json({ lists: [] })).mockResolvedValueOnce(json({}));
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    const copied = { ...transport.putHeaders, Authorization: 'Bearer old', 'Content-Type': 'custom/type' };
    await expect(transport.getJson('/bringusers/account/lists')).resolves.toEqual({ lists: [] });
    await transport.fetch('/bringlists/list', { method: 'PUT', headers: copied, body: 'body' });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(auth(fetch.mock.calls[3]?.[1])).toBe('Bearer new');
    expect(auth(fetch.mock.calls[4]?.[1])).toBe('Bearer new');
    expect(new Headers(fetch.mock.calls[4]?.[1]?.headers).get('content-type')).toBe('custom/type');
    expect(new Headers(transport.headers).get('authorization')).toBe('Bearer new');
    expect(new Headers(transport.putHeaders).get('authorization')).toBe('Bearer new');
  });

  it('does not loop on another 401 from the replay', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(login('new')).mockResolvedValueOnce(json({}, 401));
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    await expect(transport.getJson('/bringlists/list')).rejects.toThrow('HTTP 401');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('replays HEAD with current authentication and never follows authenticated redirects', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(login('new')).mockResolvedValueOnce(new Response(null, { status: 200 }));
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    const headers = new Headers(transport.headers);
    expect((await transport.fetch('/bringlists/list', { method: 'HEAD', headers, redirect: 'follow' })).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(auth(fetch.mock.calls[3]?.[1])).toBe('Bearer new');
    for (const [, init] of fetch.mock.calls) expect(init?.redirect).toBe('error');
  });

  it('supports a later independent expiry without retaining the first token generation', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(login('new')).mockResolvedValueOnce(json({ first: true }))
      .mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(login('newer')).mockResolvedValueOnce(json({ second: true }));
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    await expect(transport.getJson('/first')).resolves.toEqual({ first: true });
    await expect(transport.getJson('/second')).resolves.toEqual({ second: true });
    expect(auth(fetch.mock.calls[6]?.[1])).toBe('Bearer newer');
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it('does not treat 403 as an expired authentication session', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(json({}, 403));
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    await expect(transport.getJson('/bringlists/list')).rejects.toThrow('HTTP 403');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['http', 'network', 'invalid', 'account'] as const)('fails closed and redacts %s recovery failures', async (kind) => {
    const fetch = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(json({}, 401));
    if (kind === 'network') fetch.mockRejectedValueOnce(new Error('synthetic-password private-token'));
    else fetch.mockResolvedValueOnce(kind === 'http' ? json({ secret: 'synthetic-password' }, 403)
      : kind === 'invalid' ? json({ access_token: 'private-token' }) : login('private-token', 'different-account'));
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    const error = await transport.getJson('/bringlists/list').catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/Bring (login|authentication)/);
    expect(String(error)).not.toMatch(/synthetic-password|private-token|different-account/);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(transport.userUuid).toBe('account');
    expect(auth({ headers: transport.headers })).toBe('Bearer old');
  });

  it('coalesces concurrent 401s including a late old-generation response', async () => {
    const renewal = deferred<Response>();
    const late = deferred<Response>();
    let logins = 0;
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/bringauth')) return ++logins === 1 ? login() : renewal.promise;
      if (auth(init) === 'Bearer new') return json({ ok: true });
      if (String(url).endsWith('/late')) return late.promise;
      return json({}, 401);
    });
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    const reads = ['/first', '/second', '/late'].map((path) => transport.getJson(path));
    await vi.waitFor(() => expect(logins).toBe(2));
    renewal.resolve(login('new'));
    await expect(reads[0]).resolves.toEqual({ ok: true });
    await expect(reads[1]).resolves.toEqual({ ok: true });
    late.resolve(json({}, 401));
    await expect(reads[2]).resolves.toEqual({ ok: true });
    expect(logins).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it('shares failed renewal even with delayed 401s of that generation', async () => {
    const late = deferred<Response>();
    let logins = 0;
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/bringauth')) return ++logins === 1 ? login() : json({}, 403);
      return String(url).endsWith('/late') ? late.promise : json({}, 401);
    });
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    const first = transport.getJson('/first').catch((error: unknown) => error);
    const second = transport.getJson('/late').catch((error: unknown) => error);
    expect(await first).toBeInstanceOf(Error);
    late.resolve(json({}, 401));
    expect(await second).toBeInstanceOf(Error);
    expect(logins).toBe(2);
  });

  it.each(['POST', 'PUT', 'DELETE'])('renews but never automatically replays an ambiguous %s write', async (method) => {
    const fetch = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(login('new')).mockResolvedValueOnce(json({}));
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    await expect(transport.fetch('/bringlists/list', { method, body: 'data' })).rejects.toThrow(/not replayed/);
    expect(fetch).toHaveBeenCalledTimes(3);
    await transport.getJson('/bringlists/list');
    expect(auth(fetch.mock.calls[3]?.[1])).toBe('Bearer new');
  });

  it.each(['GET', 'PUT'])('does not retry network, timeout or 5xx failures for %s', async (method) => {
    for (const failure of [new Error('private-token'), new DOMException('private-token', 'TimeoutError'), json({}, 503)]) {
      const fetch = vi.fn().mockResolvedValueOnce(login());
      if (failure instanceof Response) fetch.mockResolvedValueOnce(failure);
      else fetch.mockRejectedValueOnce(failure);
      const transport = await AuthenticatedBringTransport.login(credentials, fetch);
      if (failure instanceof Response) expect((await transport.fetch('/bringlists/list', { method })).status).toBe(503);
      else await expect(transport.fetch('/bringlists/list', { method })).rejects.toThrow('Bring API request failed');
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });

  it('never authenticates or renews public asset requests on 401', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(login()).mockResolvedValueOnce(json({}, 401));
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    expect((await transport.fetchPublic('https://web.getbring.com/image', { method: 'GET', headers: transport.headers })).status).toBe(401);
    expect(fetch.mock.calls[1]?.[1]?.headers).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['/https://evil.invalid/x', '//evil.invalid/x', '/../outside', '/%2e%2e/outside'])('rejects authenticated URL escapes: %s', async (path) => {
    const fetch = vi.fn().mockResolvedValueOnce(login());
    const transport = await AuthenticatedBringTransport.login(credentials, fetch);
    await expect(transport.fetch(path, { method: 'GET' })).rejects.toThrow('Invalid authenticated Bring API path');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
