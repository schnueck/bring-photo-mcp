# Bring Photo MCP – Version 1 Specification

## Product goal

Provide a public, agent-neutral MCP server for safe Bring! shopping-list operations. Its distinguishing workflow is photo-led product registration: an agent identifies a product from an image, selects or proposes a Bring catalog icon/category, creates the item and detail metadata, uploads the product photo, and verifies all persisted state.

## Architecture

- TypeScript, Node.js 20+.
- MCP stdio server using the official MCP SDK.
- Deterministic Bring adapter; agents never assemble raw Bring requests.
- One codebase; separate TEST and PROD configuration.
- The existing legacy wrapper remains untouched as rollback until cutover.

## Hard invariants

1. No successful create/copy/move may leave an item without a valid `userIconItemId` and `userSectionId`.
2. A write is successful only after exact read-back of item name, specification, detail UUID, icon, category and requested photo state.
3. Move writes and verifies the target completely before removing the source.
4. Multi-list writes return a result per list; partial success is never reported as total success.
5. No direct edits inside `node_modules`.
6. No credentials, API keys, list UUIDs, user UUIDs or real product photos in logs, fixtures or repository history.
7. PROD permits only allowlisted list UUIDs/names and never auto-updates.

## MCP tools – v1

### Read-only

- `bring_list_lists()`
- `bring_list_items({ list })`
- `bring_search_catalog({ query, locale?, limit? })`
- `bring_list_categories({ locale? })`
- `bring_suggest_classification({ product_name, hints?, locale? })`
- `bring_get_item({ list, item_name, specification? })`

### Writes

- `bring_add_item({ lists[], item_name, specification, icon_item_id, category_id, image_path?, duplicate_policy })`
- `bring_attach_photo({ list, item_name, image_path })`
- `bring_replace_photo({ list, item_name, image_path })`
- `bring_remove_photo({ list, item_name })`
- `bring_copy_item({ source_list, target_lists[], item_name, include_photo })`
- `bring_move_item({ source_list, target_list, item_name, include_photo })`
- `bring_check_item({ list, item_name })`
- `bring_uncheck_item({ list, item_name })`
- `bring_remove_item({ list, item_name })`

All write results include per-list status, persisted fields, verification evidence and stable error codes.

## Classification rules

- Exact catalog match first; then specific-to-general search.
- Catalog items use their catalog icon/category by default.
- Freely named items require an explicitly valid catalog icon and one of the locale catalog’s predefined categories.
- `Eigene Artikel` is treated as a UI collection, not assumed to be a valid API category.
- Custom icons and photo-as-icon are unsupported by Bring according to official documentation.
- If classification confidence is insufficient, return candidates and perform no write.

## Specification rules

- Default maximum: 30 Unicode code points where the item remains identifiable.
- Do not repeat the catalog main name.
- Prefer `brand + distinguishing variant + amount`.
- Product research is optional and limited to purchase-relevant missing facts.

## Bring protocol requirements

- Legacy item writes: form body created with `URLSearchParams`; special characters `%`, `&`, `+`, apostrophes and umlauts must round-trip.
- Detail creation: `POST bringlistitemdetails/` using explicitly ISO-8859-1 encoded multipart metadata to avoid Mojibake.
- Photo upload: `PUT bringlistitemdetails/{uuid}/image` using native multipart field `imageData`.
- Detail and photo endpoints require exact status and body validation followed by read-back.
- Existing malformed/orphan detail records are ignored unless their exact `itemId` matches.

## Duplicate and idempotency policy

- Default `duplicate_policy=fail` when an ambiguous existing target is found.
- `update_exact` updates only an exact item identity.
- Never silently overwrite another active item sharing a generic catalog name.
- Repeating an identical request must converge on one verified item per target list.

## TEST/PROD

- `BRING_ENV=test|prod`
- `BRING_EMAIL`, `BRING_PASSWORD`, `BRING_DEFAULT_LIST`, `BRING_ALLOWED_LISTS`, `BRING_LOCALE`
- TEST uses a dedicated allowlisted test list and temporary item prefix.
- PROD runs a pinned release tag only.
- No public repository creation, remote push, MCP runtime wiring or PROD switch without Thomas’ separate approval.

## Tests required before RC

1. Special-character round-trip: `%`, `&`, `+`, apostrophe, umlauts.
2. Detail creation for ASCII and non-ASCII catalog/free-text items.
3. Photo add, replace and remove with `imageUrl` verification.
4. Category/icon required and validated against catalog.
5. Duplicate fail/update behavior.
6. Copy preserves metadata/photo and source.
7. Move verifies target before source removal; failed target leaves source intact.
8. Multi-list partial failure is explicit.
9. Secret-redaction tests.
10. One controlled TEST-list E2E and an eight-photo regression run before release.

## Acceptance

Version 1 is ready for a release candidate when all automated tests pass, the MCP inspector can enumerate and call every tool, TEST E2E passes without residue, and an independent reviewer finds no material breach of the invariants.
