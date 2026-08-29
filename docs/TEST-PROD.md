# TEST/PROD operation

## TEST

1. Enter a dedicated Bring TEST list by name in `BRING_DEFAULT_LIST` and enter exactly that name in `BRING_ALLOWED_LISTS`.
2. Set `BRING_ENV=test` and a unique `BRING_TEST_ITEM_PREFIX`.
3. Optionally, only for copy/move/multi-list: configure a second dedicated TEST list as `BRING_TEST_SECOND_LIST` and list both names exactly in `BRING_ALLOWED_LISTS`.
4. Start `npm run test:e2e` deliberately and manually, only with `BRING_ENV=test`. The harness creates its own synthetic image fixtures and prefixed items; without a second list, it reports multi-list honestly as a skip.
5. All generated TEST items/photos are removed in `finally` and checked by read-back for complete cleanup.

## PROD

- Only after explicit operator approval and a successful TEST record.
- Only a pinned release tag; no auto-updates.
- Set `BRING_ENV=prod`; populate `BRING_ALLOWED_LISTS` only with actually approved PROD lists.
- Before every write, check list resolution and the allowlist; do not use a fallback list.
- Do not output credentials, IDs, or paths.

## Rollback

This repository includes no runtime wiring. If there are problems, do not switch automatically: the existing `bring-safe` solution remains unchanged until a tested and approved integration is in place.
