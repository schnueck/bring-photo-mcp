# Bring Photo MCP v1

[English](README.md) | Deutsch

Lokaler, agent-neutraler TypeScript-MCP-Server für sichere Bring!-Listenoperationen mit kataloggebundenen Icons/Kategorien und Produktfotos. Der ausführbare stdio-Entrypoint wird nur über lokal validierte Umgebungsvariablen gestartet; dieses Repository enthält keine Hermes-/Client-Runtime-Konfiguration.

## Installation

Voraussetzungen: Node.js 20+ und npm.

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Der offizielle MCP TypeScript SDK (`@modelcontextprotocol/sdk`) wird verwendet. `npm start` baut das Projekt und startet `src/index.ts` als stdio-Server. Der Start validiert die Konfiguration und authentifiziert erst danach gegen Bring; es gibt bewusst keine Hermes-/Client-Runtime-Konfiguration in diesem Repository.

## Veröffentlichbare Artefakte

Das Paket ist für eine öffentliche npm-Veröffentlichung vorbereitet, wird durch eine explizite `files`-Allowlist begrenzt und enthält einen `bring-photo-mcp`-stdio-Binary-Entrypoint. Die öffentliche Thin-Skill-Anleitung steht in [SKILL.md](SKILL.md); getestete Client-Vorlagen stehen in [docs/MCP-CLIENT-CONFIGURATION.md](docs/MCP-CLIENT-CONFIGURATION.md). Migration und Rollback ohne Runtime-Umschaltung sind in [docs/MIGRATION-ROLLBACK.md](docs/MIGRATION-ROLLBACK.md) festgelegt.

## Konfiguration

Niemals `.env` mit echten Werten einchecken. Das Konfigurationsmodell erwartet:

- `BRING_ENV=test|prod`
- `BRING_EMAIL`, `BRING_PASSWORD`
- `BRING_DEFAULT_LIST`
- `BRING_ALLOWED_LISTS` (kommagetrennt)
- `BRING_LOCALE` (Standard `de-DE`)
- `BRING_TEST_ITEM_PREFIX` (Standard `MCP-TEST-`)
- optional `BRING_TEST_SECOND_LIST` ausschließlich für die Multi-Listen-E2E

`src/config.ts` validiert die Werte. In PROD akzeptiert der Service ausschließlich erlaubte Listen; die Produktruntime muss zusätzlich auf einen gepinnten Release-Tag zeigen. TEST verwendet eine eigene allowlistete Liste und ausschließlich temporär präfixierte Testartikel.

## Opt-in Live-E2E

`npm run test:e2e` ist absichtlich kein Bestandteil von `npm test` und wurde hier nicht ausgeführt. Es startet nur bei vollständig gesetzter Konfiguration und lehnt alles außer `BRING_ENV=test` ab. `BRING_ALLOWED_LISTS` muss exakt `BRING_DEFAULT_LIST` enthalten; mit `BRING_TEST_SECOND_LIST` muss sie exakt beide namentlich konfigurierten TEST-Listen enthalten. Ein nichtleerer `BRING_TEST_ITEM_PREFIX` ist Pflicht.

Der Harness erzeugt zwei synthetische PNG-Files im temporären Verzeichnis, prüft Add/Read-back sowie Photo-Replace/-Remove und bereinigt in `finally` alle eigenen Präfixartikel mit anschließender Abwesenheitsprüfung. Copy, Move und Multi-List werden nur bei explizitem `BRING_TEST_SECOND_LIST` ausgeführt; ohne diese Variable meldet er einen ehrlichen Skip.

## Architektur

- `src/bring-adapter.ts`: deterministische Bring-Gateway-Schnittstelle und HTTP-Protokolladapter. Legacy-Item-Bodies werden nur per `URLSearchParams` erzeugt; Details werden über `bringlists/{listUuid}/details` gelesen; der Katalog wird von `https://web.getbring.com/locale/catalog.{locale}.json` geladen; Detail-Metadaten verwenden ISO-8859-1-Multipart; Fotos benutzen natives `FormData` mit Feld `imageData`. Eine explizite `transferImage`-Gateway-Fähigkeit lädt Quellbildbytes ohne Bring-Authentifizierung und lädt sie nur zum Ziel hoch.
- `src/bring-service.ts`: Geschäftsregeln, Listen-Allowlist, Klassifikations- und Duplicate-Regeln, Read-back-Verifikation, Copy-before-delete beim Move und per-Liste-Ergebnisse.
- `src/mcp-server.ts`: 15 Zod-validierte MCP-Tools; keine Transportschicht.
- `src/redaction.ts`: Redigiert Passwort-/Tokenfelder, UUID-artige IDs und lokale Pfade aus Fehlertexten.

Schreiboperationen sind erst erfolgreich, wenn Item und Detail erneut gelesen wurden. Das Detail muss UUID, `userIconItemId` und `userSectionId` enthalten; bei Fotos ist zusätzlich `imageUrl` Pflicht. Defekte/orphan Details werden nicht verwendet, außer `itemId` passt exakt.

## Tools

Read: `bring_list_lists`, `bring_list_items`, `bring_search_catalog`, `bring_list_categories`, `bring_suggest_classification`, `bring_get_item`.

Write: `bring_add_item`, `bring_attach_photo`, `bring_replace_photo`, `bring_remove_photo`, `bring_copy_item`, `bring_move_item`, `bring_check_item`, `bring_uncheck_item`, `bring_remove_item`.

`bring_add_item` benötigt immer `icon_item_id` plus `category_id`; beide müssen im geladenen Katalog zusammenpassen. Default für `duplicate_policy` ist `fail`; `update_exact` verändert nur die exakt gleiche Identität. Multi-Listen-Aufrufe liefern immer ein Resultat je Zielliste und bei Teilfehlern `status: "partial"`.

## Fehlercodes

`CONFIGURATION`, `LIST_NOT_ALLOWED`, `LIST_NOT_FOUND`, `ITEM_NOT_FOUND`, `INVALID_CLASSIFICATION`, `DUPLICATE_AMBIGUOUS`, `VERIFICATION_FAILED`, `UPSTREAM_FAILURE`, `IMAGE_INVALID`, `CLASSIFICATION_UNCERTAIN`.

Fehlertexte enthalten keine Credentials, UUIDs oder Bildpfade.

## Entwicklung und Verifikation

Dieses Projekt wurde unter menschlicher Leitung und Prüfung mit KI-gestützten Werkzeugen für Code und Dokumentation entwickelt. Automatisierte Tests, isolierte Live-E2E-Prüfungen und Release-Artefakte wurden vor der Veröffentlichung unabhängig verifiziert. Thomas Schnuecker bleibt Maintainer und trägt die Verantwortung für Veröffentlichungen.

## Sicherheitsgrenzen und Rollback

Keine Credentials, echte Listen-UUIDs oder Produktbilder gehören in Git, Fixtures oder Logs. Dieses Repository löst keine Login- oder Live-Operation aus. Die bestehende `bring-safe`-Lösung bleibt bis zu einer ausdrücklich freigegebenen Umstellung unverändert der Rollback.

TEST-E2E und die Acht-Fotos-Regression sind absichtlich nicht automatisch aktiv: sie benötigen eine freigegebene dedizierte TEST-Liste, temporäre Präfixartikel und bereitgestellte Testbilder. Danach alle erzeugten TEST-Artikel und Fotos über Read-back entfernen und deren Abwesenheit verifizieren.
