import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const artifact = (path: string) => readFile(resolve(root, path), 'utf8');

describe('public package and thin-skill artifacts', () => {
  it('publishes non-private npm metadata with an explicit allowlist', async () => {
    const pkg = JSON.parse(await artifact('package.json')) as Record<string, unknown>;
    expect(pkg.private).toBeUndefined();
    expect(pkg.license).toBe('MIT');
    expect(pkg.mcpName).toBe('io.github.schnueck/bring-photo-mcp');
    expect(pkg.description).toContain('MCP');
    expect(pkg.files).toEqual(expect.arrayContaining(['dist/', 'README.md', 'README.de.md', 'SKILL.md', 'LICENSE', 'CHANGELOG.md', 'SECURITY.md', 'docs/']));
    expect(pkg.bin).toEqual({ 'bring-photo-mcp': 'dist/index.js' });
    expect(pkg.publishConfig).toEqual({ access: 'public' });
  });

  it('publishes official MCP Registry metadata that matches the npm package', async () => {
    const [pkgText, serverText] = await Promise.all([artifact('package.json'), artifact('server.json')]);
    const pkg = JSON.parse(pkgText) as { name: string; version: string; mcpName: string };
    const server = JSON.parse(serverText) as { name: string; version: string; packages: Array<{ identifier: string; version: string; transport: { type: string } }> };
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages).toEqual(expect.arrayContaining([expect.objectContaining({ identifier: pkg.name, version: pkg.version, transport: { type: 'stdio' } })]));
    expect(serverText).not.toMatch(/\/home\//i);
    expect(serverText).not.toMatch(/@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  it('ships both language-specific READMEs with a clear language switch', async () => {
    const [englishReadme, germanReadme] = await Promise.all([artifact('README.md'), artifact('README.de.md')]);
    expect(englishReadme).toMatch(/\[Deutsch\]\(README\.de\.md\)/);
    expect(germanReadme).toMatch(/\[English\]\(README\.md\)/);
  });

  it('keeps canonical public documentation in English without treating proper nouns as German prose', async () => {
    const canonicalDocs = await Promise.all([
      'README.md', 'SKILL.md', 'CHANGELOG.md', 'SECURITY.md', 'SPEC.md',
      'docs/TEST-PROD.md', 'docs/MCP-CLIENT-CONFIGURATION.md', 'docs/MIGRATION-ROLLBACK.md',
    ].map(artifact));
    const canonicalText = canonicalDocs.join('\n');
    expect(canonicalText).not.toMatch(/(?:Lokaler, agent-neutraler|Voraussetzungen:|Niemals `\.env`|Der offizielle MCP|Das Paket ist|Konfigurationsmodell erwartet|ist absichtlich kein Bestandteil|muss exakt|Ein nichtleerer|Der Harness erzeugt|Geschäftsregeln, Listen-Allowlist|Schreiboperationen sind erst erfolgreich|benötigt immer|Fehlertexte enthalten keine|Sicherheitsgrenzen und Rollback|gehören in Git|Acht-Fotos-Regression|TEST\/PROD-Betrieb|Eine dedizierte|eindeutigen `BRING_TEST_ITEM_PREFIX`|bewusst manuell|Alle erzeugten|Erst nach expliziter|Nur ein gepinnter|tatsächlich freigegebenen|Vor jedem Write|Keine Zugangsdaten|Kein Runtime-Wiring ist Bestandteil|Bei Problemen keine automatische)/u);
  });

  it('ships a public thin skill that routes deterministic operations only to MCP tools', async () => {
    const skill = await artifact('SKILL.md');
    for (const tool of ['bring_search_catalog', 'bring_suggest_classification', 'bring_add_item', 'bring_copy_item', 'bring_move_item']) expect(skill).toContain(`\`${tool}`);
    expect(skill).toMatch(/do not .*Bring.*request/i);
    expect(skill).toMatch(/30 Unicode code points/i);
    expect(skill).toMatch(/icon.*category.*invariant/i);
    expect(skill).toMatch(/duplicate_policy=fail/i);
    expect(skill).toMatch(/target.*verified.*before.*source.*remove/i);
    expect(skill).toMatch(/per-list.*partial/i);
  });

  it('keeps distributable documentation free of private paths and person-specific operational data', async () => {
    const distributedText = (await Promise.all(['README.md', 'SKILL.md', 'CHANGELOG.md', 'SECURITY.md', '.env.example', 'docs/TEST-PROD.md', 'docs/MCP-CLIENT-CONFIGURATION.md', 'docs/MIGRATION-ROLLBACK.md'].map(artifact))).join('\n');
    expect(distributedText).not.toMatch(/\/home\//i);
    expect(distributedText).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    expect(distributedText).not.toMatch(/BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/i);
  });

  it('provides publication, security, configuration, client examples and one-release migration rollback guidance', async () => {
    const [license, changelog, security, env, clients, migration] = await Promise.all([
      artifact('LICENSE'), artifact('CHANGELOG.md'), artifact('SECURITY.md'), artifact('.env.example'), artifact('docs/MCP-CLIENT-CONFIGURATION.md'), artifact('docs/MIGRATION-ROLLBACK.md'),
    ]);
    expect(license).toContain('MIT License');
    expect(changelog).toContain('1.0.2');
    expect(security).toMatch(/do not.*credential/i);
    expect(env.split(/\r?\n/).filter((line) => /^(?:BRING_)?(?:PASSWORD|TOKEN|SECRET)=/i.test(line))).toEqual(['BRING_PASSWORD=']);
    expect(clients).toContain('stdio');
    expect(clients).toContain('Hermes');
    expect(clients).toContain('OpenClaw');
    expect(migration).toMatch(/one release/i);
    expect(migration).toContain('bring-safe');
  });
});
