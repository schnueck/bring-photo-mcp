import { BringError, ErrorCodes } from './errors.js';
import type { BringTransport } from './bring-adapter.js';
import type { BringConfig } from './config.js';

const API_BASE_URL = 'https://api.getbring.com/rest/v2/';
const LOGIN_URL = `${API_BASE_URL}bringauth`;
const V2_HEADERS = {
  'X-BRING-API-KEY': 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp',
  'X-BRING-CLIENT': 'webApp',
  'X-BRING-CLIENT-SOURCE': 'webApp',
  'X-BRING-COUNTRY': 'DE',
} as const;

type FetchImplementation = typeof fetch;
type LoginResponse = { access_token?: unknown; uuid?: unknown };
type Credentials = Pick<BringConfig, 'email' | 'password'>;

/** Authenticated API transport. It never applies its headers to public URLs. */
export class AuthenticatedBringTransport implements BringTransport {
  readonly baseUrl = API_BASE_URL;
  readonly userUuid: string;
  private generation = 0;
  private recovery?: { generation: number; promise: Promise<void> };

  private constructor(
    private readonly fetchImplementation: FetchImplementation,
    private readonly credentials: Credentials,
    private token: string,
    userUuid: string,
  ) {
    this.userUuid = userUuid;
  }

  get headers(): Record<string, string> {
    return { ...V2_HEADERS, 'X-BRING-USER-UUID': this.userUuid, Authorization: `Bearer ${this.token}` };
  }

  get putHeaders(): Record<string, string> {
    return { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
  }

  static async login(config: Credentials, fetchImplementation: FetchImplementation = fetch): Promise<AuthenticatedBringTransport> {
    // Retain only the configured credentials, not the caller's mutable config object.
    const credentials = { email: config.email, password: config.password };
    const payload = await this.authenticate(credentials, fetchImplementation);
    return new AuthenticatedBringTransport(fetchImplementation, credentials, payload.access_token, payload.uuid);
  }

  private static async authenticate(config: Credentials, fetchImplementation: FetchImplementation): Promise<{ access_token: string; uuid: string }> {
    const body = new URLSearchParams({ email: config.email, password: config.password }).toString();
    let response: Response;
    try {
      response = await fetchImplementation(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
        redirect: 'error',
      });
    } catch {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Bring login failed');
    }
    const payload = await response.json().catch(() => null) as LoginResponse | null;
    if (!response.ok || !payload || typeof payload.access_token !== 'string' || !payload.access_token || typeof payload.uuid !== 'string' || !payload.uuid) {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Bring login failed (HTTP ${response.status})`);
    }
    try {
      // Validate before adopting initial or renewed authentication state. Native
      // header errors can include the rejected value, so never propagate them.
      new Headers({ Authorization: `Bearer ${payload.access_token}`, 'X-BRING-USER-UUID': payload.uuid });
    } catch {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Bring login failed');
    }
    return { access_token: payload.access_token, uuid: payload.uuid };
  }

  async getJson<T>(path: string): Promise<T> {
    const response = await this.fetch(path, { method: 'GET', headers: this.headers });
    const payload = await response.json().catch(() => null) as T | null;
    if (!response.ok || payload === null) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Bring API request failed (HTTP ${response.status})`);
    return payload;
  }

  async fetch(path: string, init: RequestInit): Promise<Response> {
    if (!path.startsWith('/')) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Invalid authenticated Bring API path');
    const url = new URL(path.slice(1), API_BASE_URL);
    if (url.origin !== new URL(API_BASE_URL).origin || !url.pathname.startsWith('/rest/v2/') || path.startsWith('//')) {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Invalid authenticated Bring API path');
    }
    const generation = this.generation;
    const response = await this.request(url.toString(), init);
    if (response.status !== 401) return response;
    await this.recover(generation);
    // No endpoint-level guarantee that a rejected mutation had no effect. Never
    // replay it or the enclosing business operation automatically.
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Bring authentication recovered; write not replayed (HTTP 401). Read back state before deciding whether to retry');
    }
    return this.request(url.toString(), init);
  }

  private async recover(generation: number): Promise<void> {
    if (generation !== this.generation) return;
    if (this.recovery?.generation !== generation) {
      // Keep failed recovery for this generation too: delayed 401s must not
      // trigger a login storm. Restart/reconnect is required after login failure.
      this.recovery = { generation, promise: this.renew() };
    }
    await this.recovery.promise;
  }

  private async renew(): Promise<void> {
    const payload = await AuthenticatedBringTransport.authenticate(this.credentials, this.fetchImplementation);
    if (payload.uuid !== this.userUuid) {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Bring authentication identity changed; reconnect required');
    }
    this.token = payload.access_token;
    this.generation++;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      const headers = new Headers(init.headers);
      // Replace even copied/stale caller auth headers; preserve body-specific headers.
      const currentHeaders = this.headers;
      for (const name of Object.keys(currentHeaders)) headers.delete(name);
      return await this.fetchImplementation(url, { ...init, headers: { ...Object.fromEntries(headers), ...currentHeaders }, redirect: 'error' });
    } catch {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Bring API request failed');
    }
  }

  async fetchPublic(url: string, init: RequestInit): Promise<Response> {
    const publicInit: RequestInit = { ...init };
    delete publicInit.headers;
    try {
      return await this.fetchImplementation(url, publicInit);
    } catch {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Public Bring asset request failed');
    }
  }
}
