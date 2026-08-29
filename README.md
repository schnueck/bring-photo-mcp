# Bring Photo MCP v1

English | [Deutsch](README.de.md)

A local, agent-neutral TypeScript MCP server for safe Bring! list operations with catalog-bound icons/categories and product photos. The executable stdio entrypoint starts only with locally validated environment variables; this repository contains no Hermes or client runtime configuration.

## Installation

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

The official MCP TypeScript SDK (`@modelcontextprotocol/sdk`) is used. `npm start` builds the project and starts `src/index.ts` as a stdio server. Startup validates the configuration and authenticates with Bring only afterwards; this repository intentionally contains no Hermes or client runtime configuration.

## Distributable artifacts

The package is prepared for public npm publication, constrained by an explicit `files` allowlist, and includes a `bring-photo-mcp` stdio binary entrypoint. This commit neither publishes nor installs anything. The public thin-skill guidance is in [SKILL.md](SKILL.md); tested client templates are in [docs/MCP-CLIENT-CONFIGURATION.md](docs/MCP-CLIENT-CONFIGURATION.md). Migration and rollback without runtime cutover are specified in [docs/MIGRATION-ROLLBACK.md](docs/MIGRATION-ROLLBACK.md).

## Configuration

Never commit `.env` with real values. The configuration model expects:

- `BRING_ENV=test|prod`
- `BRING_EMAIL`, `BRING_PASSWORD`
- `BRING_DEFAULT_LIST`
- `BRING_ALLOWED_LISTS` (comma-separated)
- `BRING_LOCALE` (default `de-DE`)
- `BRING_TEST_ITEM_PREFIX` (default `MCP-TEST-`)
- optional `BRING_TEST_SECOND_LIST` exclusively for the multi-list E2E

`src/config.ts` validates the values. In PROD, the service accepts only allowlisted lists; the production runtime must additionally point to a pinned release tag. TEST uses a dedicated allowlisted list and temporary prefixed test items only.

## Opt-in live E2E

`npm run test:e2e` is deliberately not part of `npm test` and was not run here. It starts only with a fully configured environment and rejects anything other than `BRING_ENV=test`. `BRING_ALLOWED_LISTS` must contain exactly `BRING_DEFAULT_LIST`; with `BRING_TEST_SECOND_LIST`, it must contain exactly both named configured TEST lists. A non-empty `BRING_TEST_ITEM_PREFIX` is required.

The harness creates two synthetic PNG files in the temporary directory, verifies add/read-back as well as photo replace/remove, and removes all of its own prefixed items in `finally`, followed by an absence check. Copy, move, and multi-list operations run only with an explicit `BRING_TEST_SECOND_LIST`; without it, the harness reports an honest skip.

## Architecture

- `src/bring-adapter.ts`: deterministic Bring gateway interface and HTTP protocol adapter. Legacy item bodies are generated only with `URLSearchParams`; details are read through `bringlists/{listUuid}/details`; the catalog is loaded from `https://web.getbring.com/locale/catalog.{locale}.json`; detail metadata uses ISO-8859-1 multipart; photos use native `FormData` with the `imageData` field. An explicit `transferImage` gateway capability downloads source image bytes without Bring authentication and uploads them only to the target.
- `src/bring-service.ts`: business rules, list allowlisting, classification and duplicate rules, read-back verification, copy-before-delete for moves, and per-list results.
- `src/mcp-server.ts`: 15 Zod-validated MCP tools; no transport layer.
- `src/redaction.ts`: redacts password/token fields, UUID-like IDs, and local paths from error text.

Write operations are successful only after the item and detail have been read again. The detail must contain a UUID, `userIconItemId`, and `userSectionId`; photos additionally require `imageUrl`. Broken/orphan details are not used unless `itemId` matches exactly.

## Tools

Read: `bring_list_lists`, `bring_list_items`, `bring_search_catalog`, `bring_list_categories`, `bring_suggest_classification`, `bring_get_item`.

Write: `bring_add_item`, `bring_attach_photo`, `bring_replace_photo`, `bring_remove_photo`, `bring_copy_item`, `bring_move_item`, `bring_check_item`, `bring_uncheck_item`, `bring_remove_item`.

`bring_add_item` always requires `icon_item_id` and `category_id`; both must match within the loaded catalog. The default for `duplicate_policy` is `fail`; `update_exact` changes only the exact same identity. Multi-list calls always return one result per target list and use `status: "partial"` for partial failures.

## Error codes

`CONFIGURATION`, `LIST_NOT_ALLOWED`, `LIST_NOT_FOUND`, `ITEM_NOT_FOUND`, `INVALID_CLASSIFICATION`, `DUPLICATE_AMBIGUOUS`, `VERIFICATION_FAILED`, `UPSTREAM_FAILURE`, `IMAGE_INVALID`, `CLASSIFICATION_UNCERTAIN`.

Error text contains no credentials, UUIDs, or image paths.

## Security boundaries and rollback

Credentials, real list UUIDs, and product photos do not belong in Git, fixtures, or logs. This repository triggers no login or live operation. The existing `bring-safe` solution remains unchanged as the rollback until an explicitly approved cutover.

TEST E2E and the eight-photo regression are intentionally not active automatically: they require an approved dedicated TEST list, temporary prefixed items, and supplied test images. Afterwards, remove every generated TEST item and photo through read-back and verify their absence.
