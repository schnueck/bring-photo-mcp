# Security Policy

## Supported versions

Before a first public release, only the current unreleased `1.0.0` code line is supported. Pin the exact package version and Node.js 20+ in any deployment.

## Reporting a vulnerability

Do not open a public issue and do not include credentials, list identifiers, item-detail UUIDs, image URLs, local photo paths, or product photos in a report. Report privately to the repository maintainer through the repository's configured private security channel. If no private channel is available, do not publish the report; request a secure contact path from the maintainer first.

Include a minimal reproduction with all sensitive values removed, affected package version, Node.js version, and impact. A report is acknowledged after a secure channel is available; remediation timing is assessed case by case.

## Operational requirements

- Keep `BRING_EMAIL` and `BRING_PASSWORD` only in the client or secret-manager environment, never in repository files or MCP configuration literals.
- Use dedicated allowlisted TEST lists for testing. PROD must use a pinned release and explicit list allowlists.
- Do not log raw upstream responses. This package redacts credentials, UUID-like values, and local paths from surfaced errors, but callers must avoid echoing tool inputs and outputs that contain sensitive values.
- Treat product photos as personal or commercial data. Do not commit them, package them, or attach them to vulnerability reports.
