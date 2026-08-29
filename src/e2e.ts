import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BringHttpAdapter } from './bring-adapter.js';
import { AuthenticatedBringTransport } from './bring-transport.js';
import { BringService } from './bring-service.js';
import { loadE2eConfig } from './config.js';
import { safeErrorMessage } from './redaction.js';

const SYNTHETIC_PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3igAAAABJRU5ErkJggg==', 'base64');
const SYNTHETIC_PNG_B = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+KDv0VAAAAABJRU5ErkJggg==', 'base64');

const uniqueName = (prefix: string, label: string) => `${prefix}${label}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const assertOk = (value: { status: string }, step: string) => {
  if (value.status !== 'ok') throw new Error(`E2E verification failed at ${step}`);
};

async function removePrefixedItems(service: BringService, lists: string[], prefix: string): Promise<void> {
  for (const list of lists) {
    const items = await service.listItems(list);
    for (const item of items.purchase.filter((entry) => entry.name.startsWith(prefix))) await service.removeItem(list, item.name);
    const after = await service.listItems(list);
    if (after.purchase.some((entry) => entry.name.startsWith(prefix))) throw new Error('E2E cleanup verification failed');
  }
  process.stdout.write(`PASS cleanup verification: no ${prefix} items remain on ${lists.join(', ')}\n`);
}

async function main(): Promise<void> {
  const config = loadE2eConfig(); // Validate before constructing any transport or issuing a request.
  const lists = [config.defaultList, ...(config.secondList ? [config.secondList] : [])];
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'bring-photo-mcp-e2e-'));
  const imageA = join(fixtureDirectory, 'synthetic-a.png');
  const imageB = join(fixtureDirectory, 'synthetic-b.png');
  await Promise.all([writeFile(imageA, SYNTHETIC_PNG_A), writeFile(imageB, SYNTHETIC_PNG_B)]);

  let service: BringService | undefined;
  try {
    const transport = await AuthenticatedBringTransport.login(config);
    const adapter = new BringHttpAdapter(transport);
    service = new BringService(adapter, {
      environment: 'test', allowedLists: lists, locale: config.locale,
    });
    const classification = (await adapter.getCatalog(config.locale))[0];
    if (!classification) throw new Error('E2E catalog has no usable classification');
    const addName = uniqueName(config.testItemPrefix, 'photo');
    assertOk(await service.addItem({ lists: [config.defaultList], itemName: addName, specification: 'synthetic', iconItemId: classification.itemId, categoryId: classification.sectionId, imagePath: imageA, duplicatePolicy: 'fail' }), 'add/read-back/photo');
    assertOk(await service.replacePhoto({ list: config.defaultList, itemName: addName, imagePath: imageB }), 'photo replace');
    assertOk(await service.removePhoto({ list: config.defaultList, itemName: addName }), 'photo remove');

    if (!config.secondList) {
      process.stdout.write('SKIP multi-list E2E: BRING_TEST_SECOND_LIST is not explicitly configured\n');
      return;
    }

    const copyName = uniqueName(config.testItemPrefix, 'copy');
    assertOk(await service.addItem({ lists: [config.defaultList], itemName: copyName, specification: 'synthetic', iconItemId: classification.itemId, categoryId: classification.sectionId, imagePath: imageA, duplicatePolicy: 'fail' }), 'copy source add');
    assertOk(await service.copyItem({ sourceList: config.defaultList, targetLists: [config.secondList], itemName: copyName, includePhoto: true }), 'copy/read-back');

    const moveName = uniqueName(config.testItemPrefix, 'move');
    assertOk(await service.addItem({ lists: [config.defaultList], itemName: moveName, specification: 'synthetic', iconItemId: classification.itemId, categoryId: classification.sectionId, duplicatePolicy: 'fail' }), 'move source add');
    assertOk(await service.moveItem({ sourceList: config.defaultList, targetList: config.secondList, itemName: moveName, includePhoto: false }), 'move/read-back');

    const multiName = uniqueName(config.testItemPrefix, 'multi');
    assertOk(await service.addItem({ lists, itemName: multiName, specification: 'synthetic', iconItemId: classification.itemId, categoryId: classification.sectionId, duplicatePolicy: 'fail' }), 'multi-list add/read-back');
    process.stdout.write(`PASS Bring live E2E: add/read-back, photo replace/remove, copy, move and multi-list across ${lists.length} isolated test lists; cleanup follows\n`);
  } finally {
    try {
      if (service) await removePrefixedItems(service, lists, config.testItemPrefix);
    } finally {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`Bring E2E failed: ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
