# MCP client configuration examples

This repository does not install or wire a client runtime. The examples below are templates for an already installed `bring-photo-mcp` executable. Put real environment values in the client's supported secret store or process environment, not in configuration literals.

Before enabling any write tool, use dedicated TEST lists, an explicit `BRING_ALLOWED_LISTS`, and a pinned package version. A client configuration saving successfully is not a connection check.

## Generic stdio MCP client

Use the following common MCP configuration shape when the client accepts `command`, `args`, and `env` for stdio servers. The executable must be resolvable by that client's process environment (for example, from a globally installed exact package version or a project-local wrapper).

```json
{
  "mcpServers": {
    "bring-photo-mcp": {
      "command": "bring-photo-mcp",
      "args": [],
      "env": {
        "BRING_ENV": "${BRING_ENV}",
        "BRING_EMAIL": "${BRING_EMAIL}",
        "BRING_PASSWORD": "${BRING_PASSWORD}",
        "BRING_DEFAULT_LIST": "${BRING_DEFAULT_LIST}",
        "BRING_ALLOWED_LISTS": "${BRING_ALLOWED_LISTS}",
        "BRING_LOCALE": "${BRING_LOCALE}",
        "BRING_TEST_ITEM_PREFIX": "${BRING_TEST_ITEM_PREFIX}"
      }
    }
  }
}
```

Placeholder interpolation is client-specific. If the client does not support it, provide the variables through its secret store or parent process environment instead of replacing them in a tracked file.

## Hermes

Hermes uses `mcp_servers` entries for stdio MCP servers. Its documented configuration accepts `command`, `args`, `env`, `enabled`, timeouts, tool filters, and an optional `trust` tier. Hermes resolves `${VAR}` and `${env:VAR}` from the active profile secret scope or process environment.

```yaml
mcp_servers:
  bring-photo-mcp:
    command: bring-photo-mcp
    args: []
    env:
      BRING_ENV: "${BRING_ENV}"
      BRING_EMAIL: "${BRING_EMAIL}"
      BRING_PASSWORD: "${BRING_PASSWORD}"
      BRING_DEFAULT_LIST: "${BRING_DEFAULT_LIST}"
      BRING_ALLOWED_LISTS: "${BRING_ALLOWED_LISTS}"
      BRING_LOCALE: "${BRING_LOCALE}"
      BRING_TEST_ITEM_PREFIX: "${BRING_TEST_ITEM_PREFIX}"
    enabled: false
    trust: untrusted
    tools:
      resources: false
      prompts: false
```

Keep it disabled until a TEST probe and review are complete. `trust: untrusted` ensures write-capable tools require approval. Enable only the server instance intended for the approved environment; this repository does not modify Hermes profiles.

## OpenClaw

OpenClaw documents local stdio MCP servers through `openclaw mcp add`. From a directory where the exact package executable is resolvable, a template is:

```sh
openclaw mcp add bring-photo-mcp --command bring-photo-mcp
openclaw mcp doctor bring-photo-mcp --probe
```

OpenClaw also supports definitions under `mcp.servers` in its configuration. Set environment values using OpenClaw's supported secret mechanisms rather than tracked configuration literals. The exact config shape, secret handling, scope, and reload behavior are OpenClaw-version dependent; consult its MCP documentation before editing a running Gateway. A live probe is required before treating the server as connected.

## Verification

A client must enumerate the 15 MCP tools and call read-only discovery tools successfully before any TEST write. Do not configure PROD or install runtime wiring as part of this package step.
