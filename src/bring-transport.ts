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

/** Authenticated API transport. It never applies its headers to public URLs. */
export class AuthenticatedBringTransport implements BringTransport {
  readonly baseUrl = API_BASE_URL;
  readonly userUuid: string;
  readonly headers: HeadersInit;
  readonly putHeaders: HeadersInit;

  private constructor(private readonly fetchImplementation: FetchImplementation, token: string, userUuid: string) {
    this.userUuid = userUuid;
    this.headers = { ...V2_HEADERS, 'X-BRING-USER-UUID': userUuid, Authorization: `Bearer ${token}` };
    this.putHeaders = { ...this.headers, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
  }

  static async login(config: Pick<BringConfig, 'email' | 'password'>, fetchImplementation: FetchImplementation = fetch): Promise<AuthenticatedBringTransport> {
    const body = new URLSearchParams({ email: config.email, password: config.password }).toString();
    let response: Response;
    try {
      response = await fetchImplementation(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
      });
    } catch {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Bring login failed');
    }
    const payload = await response.json().catch(() => null) as LoginResponse | null;
    if (!response.ok || !payload || typeof payload.access_token !== 'string' || !payload.access_token || typeof payload.uuid !== 'string' || !payload.uuid) {
      throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Bring login failed (HTTP ${response.status})`);
    }
    return new AuthenticatedBringTransport(fetchImplementation, payload.access_token, payload.uuid);
  }

  async getJson<T>(path: string): Promise<T> {
    const response = await this.fetch(path, { method: 'GET', headers: this.headers });
    const payload = await response.json().catch(() => null) as T | null;
    if (!response.ok || payload === null) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Bring API request failed (HTTP ${response.status})`);
    return payload;
  }

  async fetch(path: string, init: RequestInit): Promise<Response> {
    if (!path.startsWith('/')) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Invalid authenticated Bring API path');
    try {
      return await this.fetchImplementation(new URL(path.slice(1), API_BASE_URL).toString(), init);
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
