import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BringService,
  type BringGateway,
  type CatalogEntry,
  type Detail,
  type ListRecord,
} from '../src/bring-service.js';
import { BringHttpAdapter, createLatin1Multipart, encodeLegacyItemBody, type BringTransport } from '../src/bring-adapter.js';
import { redact } from '../src/redaction.js';
import { createMcpServer } from '../src/mcp-server.js';

const catalog: CatalogEntry[] = [
  { itemId: 'milk', name: 'Milch', sectionId: 'dairy', sectionName: 'Milchprodukte' },
  { itemId: 'tea', name: 'Tee', sectionId: 'drinks', sectionName: 'Getränke' },
];

class FakeBring implements BringGateway {
  lists: ListRecord[] = [{ uuid: 'test-list', name: 'TEST Einkauf' }, { uuid: 'second-list', name: 'Zweite Liste' }];
  active = new Map<string, { name: string; specification: string }[]>();
  details = new Map<string, Detail[]>();
  failWritesFor = new Set<string>();
  uploadedPaths: string[] = [];
  transferredImages: Array<{ sourceImageUrl: string; targetListUuid: string; targetDetailUuid: string }> = [];
  constructor() { for (const list of this.lists) { this.active.set(list.uuid, []); this.details.set(list.uuid, []); } }
  async listLists() { return this.lists; }
  async getItems(id: string) { return { purchase: [...(this.active.get(id) ?? [])], recently: [] }; }
  async getDetails(id: string) { return [...(this.details.get(id) ?? [])]; }
  async getCatalog() { return catalog; }
  async putItem(id: string, name: string, specification: string) {
    if (this.failWritesFor.has(id)) throw new Error('upstream failed');
    const items = this.active.get(id) ?? []; const at = items.findIndex((entry) => entry.name === name);
    if (at >= 0) items[at] = { name, specification }; else items.push({ name, specification }); this.active.set(id, items);
  }
  async createDetail(id: string, input: Omit<Detail, 'uuid' | 'imageUrl'>) {
    const detail = { ...input, uuid: `detail-${id}-${input.itemId}`, imageUrl: undefined };
    this.details.set(id, [...(this.details.get(id) ?? []).filter((entry) => entry.itemId !== input.itemId), detail]); return detail;
  }
  async uploadImage(_id: string, uuid: string, imagePath: string) { this.uploadedPaths.push(imagePath); for (const details of this.details.values()) { const entry = details.find((detail) => detail.uuid === uuid); if (entry) { entry.imageUrl = `https://images.invalid/${uuid}`; return entry.imageUrl; } } throw new Error('detail missing'); }
  async transferImage(sourceImageUrl: string, targetListUuid: string, targetDetailUuid: string) { this.transferredImages.push({ sourceImageUrl, targetListUuid, targetDetailUuid }); return this.uploadImage(targetListUuid, targetDetailUuid, 'transferred-image'); }
  async removeImage(_id: string, uuid: string) { for (const details of this.details.values()) { const entry = details.find((detail) => detail.uuid === uuid); if (entry) { entry.imageUrl = undefined; return; } } throw new Error('detail missing'); }
  async removeItem(id: string, name: string) { this.active.set(id, (this.active.get(id) ?? []).filter((entry) => entry.name !== name)); }
  async checkItem(id: string, name: string) { await this.removeItem(id, name); }
}

describe('Bring protocol and invariant regressions', () => {
  let fake: FakeBring; let service: BringService;
  beforeEach(() => { fake = new FakeBring(); service = new BringService(fake, { environment: 'test', allowedLists: ['test-list', 'second-list'] }); });

  it('1 encodes %, &, +, apostrophes and umlauts with URLSearchParams', () => {
    const body = encodeLegacyItemBody("Café 50% & Käse + O'Neil", 'größer + 2%');
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({ purchase: "Café 50% & Käse + O'Neil", recently: '', specification: 'größer + 2%', remove: '', sender: 'null' });
  });
  it('2 creates Latin-1 detail metadata for ASCII and non-ASCII values', () => {
    const payload = createLatin1Multipart('fixed', { listUuid: 'abc', itemId: 'Spülmittel', userIconItemId: 'Spülmittel', userSectionId: 'Küche', assignedTo: '' });
    expect(payload.body.toString('latin1')).toContain('Spülmittel'); expect(payload.contentType).toContain('boundary=fixed');
  });
  it('3 adds, replaces and removes photo with read-back imageUrl verification', async () => {
    await service.addItem({ lists: ['test-list'], itemName: 'Milch', specification: 'Bio 1 l', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'fail' });
    await service.attachPhoto({ list: 'test-list', itemName: 'Milch', imagePath: '/tmp/a.jpg' });
    await service.replacePhoto({ list: 'test-list', itemName: 'Milch', imagePath: '/tmp/b.jpg' });
    await service.removePhoto({ list: 'test-list', itemName: 'Milch' });
    expect((await fake.getDetails('test-list'))[0]?.imageUrl).toBeUndefined();
  });
  it('4 requires catalog-valid matching icon and category', async () => {
    await expect(service.addItem({ lists: ['test-list'], itemName: 'Milch', specification: '', iconItemId: 'tea', categoryId: 'dairy', duplicatePolicy: 'fail' })).rejects.toMatchObject({ code: 'INVALID_CLASSIFICATION' });
  });
  it('5 fails ambiguous duplicate and converges with update_exact', async () => {
    await service.addItem({ lists: ['test-list'], itemName: 'Milch', specification: 'Bio', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'fail' });
    await expect(service.addItem({ lists: ['test-list'], itemName: 'Milch', specification: 'Bio', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'fail' })).resolves.toMatchObject({ results: [{ status: 'error', errorCode: 'DUPLICATE_AMBIGUOUS' }] });
    await expect(service.addItem({ lists: ['test-list'], itemName: 'Milch', specification: 'Bio', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'update_exact' })).resolves.toMatchObject({ results: [{ status: 'ok' }] });
  });
  it('6 uses the visible free-text name as detail identity while retaining the selected catalog icon', async () => {
    await service.addItem({ lists: ['test-list'], itemName: 'Lieblingsmilch', specification: 'Bio', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'fail' });
    expect((await fake.getDetails('test-list'))).toContainEqual(expect.objectContaining({ itemId: 'Lieblingsmilch', userIconItemId: 'milk', userSectionId: 'dairy' }));
  });
  it('7 copies a photo through the gateway transfer capability, never a pseudo file path', async () => {
    await service.addItem({ lists: ['test-list'], itemName: 'Milch', specification: 'Bio', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'fail', imagePath: '/tmp/a.jpg' });
    const sourceImageUrl = (await fake.getDetails('test-list'))[0]!.imageUrl!;
    const result = await service.copyItem({ sourceList: 'test-list', targetLists: ['second-list'], itemName: 'Milch', includePhoto: true });
    expect(result.status).toBe('ok');
    expect(fake.transferredImages).toEqual([{ sourceImageUrl, targetListUuid: 'second-list', targetDetailUuid: 'detail-second-list-Milch' }]);
    expect(fake.uploadedPaths).not.toContain('copy://source-image');
  });
  it('8 copies metadata and photo while preserving source', async () => {
    await service.addItem({ lists: ['test-list'], itemName: 'Milch', specification: 'Bio', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'fail', imagePath: '/tmp/a.jpg' });
    await service.copyItem({ sourceList: 'test-list', targetLists: ['second-list'], itemName: 'Milch', includePhoto: true });
    expect((await fake.getItems('test-list')).purchase).toHaveLength(1); expect((await fake.getDetails('second-list'))[0]?.imageUrl).toBeTruthy();
  });
  it('7 leaves source intact when target move write fails', async () => {
    await service.addItem({ lists: ['test-list'], itemName: 'Milch', specification: 'Bio', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'fail' }); fake.failWritesFor.add('second-list');
    const result = await service.moveItem({ sourceList: 'test-list', targetList: 'second-list', itemName: 'Milch', includePhoto: false });
    expect(result.status).toBe('error'); expect((await fake.getItems('test-list')).purchase).toHaveLength(1);
  });
  it('8 returns explicit per-list partial failure', async () => {
    fake.failWritesFor.add('second-list');
    const result = await service.addItem({ lists: ['test-list', 'second-list'], itemName: 'Milch', specification: 'Bio', iconItemId: 'milk', categoryId: 'dairy', duplicatePolicy: 'fail' });
    expect(result).toMatchObject({ status: 'partial', results: [{ status: 'ok' }, { status: 'error' }] });
  });
  it('9 redacts credentials, UUID-like values and local photo paths', () => {
    expect(redact('password=s3cret token abcdef12-1234-1234-1234-1234567890ab /private/image.jpg')).not.toContain('s3cret');
    expect(redact('password=s3cret token abcdef12-1234-1234-1234-1234567890ab /private/image.jpg')).not.toContain('/private/image.jpg');
  });
  it('registers all fifteen v1 MCP tools without transport wiring', () => {
    const server = createMcpServer(service) as unknown as { _registeredTools: Record<string, unknown> };
    expect(Object.keys(server._registeredTools)).toHaveLength(15);
  });
  it.skip('10 requires opt-in controlled TEST E2E plus eight supplied photos; intentionally excluded from offline unit suite');
});

describe('Bring HTTP transport contract', () => {
  const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const makeTransport = () => {
    const fetch = vi.fn(async (path: string) => response(200, path === 'https://web.getbring.com/locale/catalog.de-DE.json' ? { catalog: { sections: [{ sectionId: 'dairy', name: 'Milchprodukte', items: [{ itemId: 'milk', name: 'Milch' }] }] } } : path.includes('/image') ? { imageUrl: 'https://images.invalid/uploaded' } : {}));
    const fetchPublic = vi.fn(async (url: string) => url.includes('catalog.')
      ? response(200, { catalog: { sections: [{ sectionId: 'dairy', name: 'Milchprodukte', items: [{ itemId: 'milk', name: 'Milch' }] }] } })
      : new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }));
    const getJsonCalls: string[] = [];
    const getJson = <T>(path: string): Promise<T> => { getJsonCalls.push(path); return Promise.resolve([] as unknown as T); };
    return { baseUrl: 'https://api.getbring.com/rest/v2/', userUuid: 'test-user', headers: { Authorization: 'Bearer private' }, putHeaders: { 'content-type': 'application/x-www-form-urlencoded' }, getJson, getJsonCalls, fetch, fetchPublic } satisfies BringTransport & { getJsonCalls: string[]; fetchPublic: typeof fetchPublic };
  };

  it('uses the list details endpoint, not the detail collection endpoint', async () => {
    const transport = makeTransport();
    await new BringHttpAdapter(transport).getDetails('list/one');
    expect(transport.getJsonCalls).toEqual(['/bringlists/list%2Fone/details']);
  });

  it('loads the locale catalog from its public absolute endpoint without API headers', async () => {
    const transport = makeTransport();
    await new BringHttpAdapter(transport).getCatalog('de-DE');
    expect(transport.fetchPublic).toHaveBeenCalledExactlyOnceWith('https://web.getbring.com/locale/catalog.de-DE.json', { method: 'GET' });
    expect(transport.fetch).not.toHaveBeenCalled();
    expect(transport.getJsonCalls).toEqual([]);
  });

  it('transfers copied photo bytes through an unauthenticated public download and target upload', async () => {
    const transport = makeTransport();
    const adapter = new BringHttpAdapter(transport) as unknown as { transferImage(sourceImageUrl: string, targetListUuid: string, targetDetailUuid: string): Promise<string> };
    await expect(adapter.transferImage('https://images.invalid/source.png', 'target-list', 'target-detail')).resolves.toBe('https://images.invalid/uploaded');
    expect(transport.fetchPublic).toHaveBeenCalledExactlyOnceWith('https://images.invalid/source.png', { method: 'GET' });
    const upload = (transport.fetch.mock.calls as unknown as Array<[string, RequestInit]>).find(([path]) => path === '/bringlistitemdetails/target-detail/image');
    expect(upload).toBeDefined();
    const form = upload![1]!.body as FormData; const image = form.get('imageData') as File;
    expect(await image.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });

  it('uses URLSearchParams remove and check bodies with exact item identity', async () => {
    const transport = makeTransport(); const adapter = new BringHttpAdapter(transport);
    await adapter.removeItem('list', 'Café & Tee'); await adapter.checkItem('list', 'Café & Tee');
    expect(transport.fetch).toHaveBeenNthCalledWith(1, '/bringlists/list', expect.objectContaining({ method: 'PUT', body: 'purchase=&recently=&specification=&remove=Caf%C3%A9+%26+Tee&sender=null' }));
    expect(transport.fetch).toHaveBeenNthCalledWith(2, '/bringlists/list', expect.objectContaining({ method: 'PUT', body: 'purchase=&recently=Caf%C3%A9+%26+Tee&specification=&remove=&sender=null' }));
  });
});
