import { readFile, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { BringError, ErrorCodes } from './errors.js';

export interface ListRecord { uuid: string; name: string }
export interface ActiveItem { name: string; specification: string }
export interface Detail { uuid: string; itemId: string; userIconItemId: string; userSectionId: string; imageUrl?: string }
export interface CatalogEntry { itemId: string; name: string; sectionId: string; sectionName: string }
export interface BringGateway {
  listLists(): Promise<ListRecord[]>;
  getItems(listUuid: string): Promise<{ purchase: ActiveItem[]; recently: ActiveItem[] }>;
  getDetails(listUuid: string): Promise<Detail[]>;
  getCatalog(locale: string): Promise<CatalogEntry[]>;
  putItem(listUuid: string, name: string, specification: string): Promise<void>;
  createDetail(listUuid: string, input: Omit<Detail, 'uuid' | 'imageUrl'>): Promise<Detail>;
  uploadImage(listUuid: string, detailUuid: string, imagePath: string): Promise<string>;
  transferImage(sourceImageUrl: string, targetListUuid: string, targetDetailUuid: string): Promise<string>;
  removeImage(listUuid: string, detailUuid: string): Promise<void>;
  removeItem(listUuid: string, name: string): Promise<void>;
  checkItem(listUuid: string, name: string): Promise<void>;
}

export function encodeLegacyItemBody(name: string, specification: string, remove = ''): string {
  return encodeLegacyMutation({ purchase: name, recently: '', specification, remove });
}

function encodeLegacyMutation(fields: { purchase: string; recently: string; specification: string; remove: string }): string {
  const body = new URLSearchParams();
  body.set('purchase', fields.purchase);
  body.set('recently', fields.recently);
  body.set('specification', fields.specification);
  body.set('remove', fields.remove);
  body.set('sender', 'null');
  return body.toString();
}


export interface BringTransport {
  baseUrl: string;
  userUuid: string;
  headers: HeadersInit;
  putHeaders: HeadersInit;
  getJson<T>(path: string): Promise<T>;
  fetch(path: string, init: RequestInit): Promise<Response>;
  /** Downloads a public asset without applying Bring authentication headers. */
  fetchPublic(url: string, init: RequestInit): Promise<Response>;
}

type CatalogResponse = { catalog: { sections: Array<{ sectionId: string; name: string; items: Array<{ itemId: string; name: string }> }> } };

export class BringHttpAdapter implements BringGateway {
  constructor(private readonly transport: BringTransport) {}

  async listLists(): Promise<ListRecord[]> {
    return (await this.transport.getJson<{ lists: Array<{ listUuid: string; name: string }> }>(`/bringusers/${encodeURIComponent(this.transport.userUuid)}/lists`)).lists.map((list) => ({ uuid: list.listUuid, name: list.name }));
  }

  async getItems(listUuid: string): Promise<{ purchase: ActiveItem[]; recently: ActiveItem[] }> {
    return this.transport.getJson(`/bringlists/${encodeURIComponent(listUuid)}`);
  }

  async getDetails(listUuid: string): Promise<Detail[]> {
    return this.transport.getJson(`/bringlists/${encodeURIComponent(listUuid)}/details`);
  }

  async getCatalog(locale: string): Promise<CatalogEntry[]> {
    const response = await this.transport.fetchPublic(`https://web.getbring.com/locale/catalog.${encodeURIComponent(locale)}.json`, { method: 'GET' });
    const body = await response.json().catch(() => null) as CatalogResponse | null;
    if (!response.ok || !body?.catalog?.sections) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Catalog load returned HTTP ${response.status}`);
    return body.catalog.sections.flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.sectionId, sectionName: section.name })));
  }

  async putItem(listUuid: string, name: string, specification: string): Promise<void> {
    const response = await this.transport.fetch(`/bringlists/${encodeURIComponent(listUuid)}`, { method: 'PUT', headers: this.transport.putHeaders, body: encodeLegacyItemBody(name, specification) });
    if (!response.ok) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Legacy item write returned HTTP ${response.status}`);
  }

  async createDetail(listUuid: string, input: Omit<Detail, 'uuid' | 'imageUrl'>): Promise<Detail> {
    const form = new FormData();
    form.set('listUuid', listUuid);
    form.set('itemId', input.itemId);
    form.set('userIconItemId', input.userIconItemId);
    form.set('userSectionId', input.userSectionId);
    form.set('assignedTo', '');
    const response = await this.transport.fetch('/bringlistitemdetails/', { method: 'POST', headers: this.transport.headers, body: form });
    const body = await response.json().catch(() => ({})) as Partial<Detail>;
    if (response.status !== 201 || !body.uuid) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Detail creation returned HTTP ${response.status}`);
    return { ...input, uuid: body.uuid, imageUrl: body.imageUrl };
  }

  async uploadImage(_listUuid: string, detailUuid: string, imagePath: string): Promise<string> {
    const path = resolve(imagePath);
    const info = await stat(path);
    if (!info.isFile() || info.size === 0 || info.size > 5 * 1024 * 1024) throw new BringError(ErrorCodes.IMAGE_INVALID, 'Image must be a non-empty file no larger than 5 MiB');
    return this.uploadImageBytes(detailUuid, await readFile(path), basename(path), this.imageContentType(path));
  }

  async transferImage(sourceImageUrl: string, _targetListUuid: string, targetDetailUuid: string): Promise<string> {
    const source = await this.transport.fetchPublic(sourceImageUrl, { method: 'GET' });
    if (!source.ok) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Source image download returned HTTP ${source.status}`);
    const bytes = Buffer.from(await source.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) throw new BringError(ErrorCodes.IMAGE_INVALID, 'Source image must be non-empty and no larger than 5 MiB');
    const contentType = source.headers.get('content-type')?.split(';', 1)[0] || 'image/jpeg';
    return this.uploadImageBytes(targetDetailUuid, bytes, 'copied-image', contentType);
  }

  async removeImage(_listUuid: string, detailUuid: string): Promise<void> {
    const response = await this.transport.fetch(`/bringlistitemdetails/${encodeURIComponent(detailUuid)}/image`, { method: 'DELETE', headers: this.transport.headers });
    if (!response.ok) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Image removal returned HTTP ${response.status}`);
  }

  async removeItem(listUuid: string, name: string): Promise<void> {
    const response = await this.transport.fetch(`/bringlists/${encodeURIComponent(listUuid)}`, { method: 'PUT', headers: this.transport.putHeaders, body: encodeLegacyMutation({ purchase: '', recently: '', specification: '', remove: name }) });
    if (!response.ok) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Item removal returned HTTP ${response.status}`);
  }

  async checkItem(listUuid: string, name: string): Promise<void> {
    const response = await this.transport.fetch(`/bringlists/${encodeURIComponent(listUuid)}`, { method: 'PUT', headers: this.transport.putHeaders, body: encodeLegacyMutation({ purchase: '', recently: name, specification: '', remove: '' }) });
    if (!response.ok) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Check returned HTTP ${response.status}`);
  }

  private async uploadImageBytes(detailUuid: string, bytes: Buffer, fileName: string, contentType: string): Promise<string> {
    const form = new FormData();
    const data = new Uint8Array(bytes.byteLength); data.set(bytes);
    form.append('imageData', new Blob([data], { type: contentType }), fileName);
    const response = await this.transport.fetch(`/bringlistitemdetails/${encodeURIComponent(detailUuid)}/image`, { method: 'PUT', headers: this.transport.headers, body: form });
    const body = await response.json().catch(() => ({})) as { imageUrl?: string };
    if (response.status !== 200 || !body.imageUrl) throw new BringError(ErrorCodes.UPSTREAM_FAILURE, `Image upload returned HTTP ${response.status}`);
    return body.imageUrl;
  }

  private imageContentType(path: string): string {
    return /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
  }
}
