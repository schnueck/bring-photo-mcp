# Migration and rollback

## Scope

This document is a release procedure, not runtime wiring. It does not change any client profile, gateway, credentials, Bring list, or production service.

`bring-photo-mcp` and the existing `bring-safe` installation must run as separate alternatives. No automatic fallback, shared state migration, or dual write is permitted.

## One-release bring-safe retention

Keep the existing `bring-safe` installation unchanged and available for one release after an explicitly approved cutover: the complete lifecycle of the current released `bring-photo-mcp` version. For the initial `1.0.0` release, retain it through the lifecycle of the next released package version. Do not remove or modify it in this repository.

## Pre-cutover gate

1. Build the exact candidate and inspect the packed tarball for credentials, identifiers, photos, local paths, and unintended files.
2. Install only the exact candidate in an isolated TEST client configuration.
3. Verify MCP discovery exposes all 15 tools and run the controlled dedicated two-list TEST E2E. Confirm cleanup by read-back.
4. Run the eight-photo TEST regression with approved non-sensitive test images and retain only the redacted result record.
5. Obtain explicit approval for any client runtime wiring and separately for a PROD cutover. PROD must use a pinned package release and its own explicit list allowlist.

## Cutover

1. Enable only one approved MCP client configuration and only for the intended environment.
2. Start with read-only tool discovery and list inspection.
3. Execute a controlled TEST write. Verify the returned item, detail UUID, matching catalog icon/category, and requested photo state through the MCP read-back evidence.
4. Do not invoke `bring-safe` for the same operation. Do not introduce automatic routing.

## Rollback

If a tool fails verification, returns a partial result where full success was required, violates the icon/category invariant, or surfaces a security concern:

1. Stop further MCP writes; preserve redacted evidence only.
2. Do not attempt compensating writes unless an operator has reviewed the per-list result and explicitly approved them.
3. Disable the approved MCP client entry using that client's normal configuration procedure.
4. Return manually approved operations to unchanged `bring-safe`; do not copy credentials or production configuration into this repository.
5. Record the exact package version, redacted failure code, and whether any list has a verified partial result. Investigate and release a fix before a new cutover.

## Removal gate

After one complete subsequent release cycle, removal or alteration of `bring-safe` requires a separate explicit approval, a successful regression record, and confirmation that no active client depends on it. Until then, retain it unchanged.
