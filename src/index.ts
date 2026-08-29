#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BringHttpAdapter } from './bring-adapter.js';
import { AuthenticatedBringTransport } from './bring-transport.js';
import { BringService } from './bring-service.js';
import { loadConfig } from './config.js';
import { createMcpServer } from './mcp-server.js';
import { safeErrorMessage } from './redaction.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const transport = await AuthenticatedBringTransport.login(config);
  const service = new BringService(new BringHttpAdapter(transport), {
    environment: config.environment,
    allowedLists: config.allowedLists,
    locale: config.locale,
  });
  const server = createMcpServer(service);
  await server.connect(new StdioServerTransport());
}

void main().catch((error: unknown) => {
  process.stderr.write(`Bring MCP startup failed: ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
