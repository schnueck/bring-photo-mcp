import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BringService } from './bring-service.js';
import { safeErrorMessage } from './redaction.js';

const list = z.string().min(1); const name = z.string().min(1).max(200); const image = z.string().min(1);
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
const tool = <T extends z.ZodType>(server: McpServer, toolName: string, inputSchema: T, handler: (input: z.output<T>) => Promise<unknown>) => server.registerTool(toolName, { description: `Bring Photo MCP: ${toolName}`, inputSchema }, (async (input: unknown) => { try { return text(await handler(input as z.output<T>)); } catch (error) { return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'error', error: safeErrorMessage(error) }) }], isError: true }; } }) as never);

export function createMcpServer(service: BringService): McpServer {
  const server = new McpServer({ name: 'bring-photo-mcp', version: '1.0.0' });
  tool(server, 'bring_list_lists', z.object({}), async () => service.listLists());
  tool(server, 'bring_list_items', z.object({ list }), async ({ list }) => service.listItems(list));
  tool(server, 'bring_search_catalog', z.object({ query: name, locale: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), async ({ query, locale, limit }) => service.searchCatalog(query, locale, limit));
  tool(server, 'bring_list_categories', z.object({ locale: z.string().optional() }), async ({ locale }) => service.listCategories(locale));
  tool(server, 'bring_suggest_classification', z.object({ product_name: name, hints: z.string().optional(), locale: z.string().optional() }), async ({ product_name, hints, locale }) => service.suggestClassification(product_name, hints, locale));
  tool(server, 'bring_get_item', z.object({ list, item_name: name, specification: z.string().optional() }), async ({ list, item_name, specification }) => service.getItem(list, item_name, specification));
  tool(server, 'bring_add_item', z.object({ lists: z.array(list).min(1), item_name: name, specification: z.string().max(120), icon_item_id: name, category_id: name, image_path: image.optional(), duplicate_policy: z.enum(['fail', 'update_exact']).default('fail') }), async ({ lists, item_name, specification, icon_item_id, category_id, image_path, duplicate_policy }) => service.addItem({ lists, itemName: item_name, specification, iconItemId: icon_item_id, categoryId: category_id, imagePath: image_path, duplicatePolicy: duplicate_policy }));
  tool(server, 'bring_attach_photo', z.object({ list, item_name: name, image_path: image }), async ({ list, item_name, image_path }) => service.attachPhoto({ list, itemName: item_name, imagePath: image_path }));
  tool(server, 'bring_replace_photo', z.object({ list, item_name: name, image_path: image }), async ({ list, item_name, image_path }) => service.replacePhoto({ list, itemName: item_name, imagePath: image_path }));
  tool(server, 'bring_remove_photo', z.object({ list, item_name: name }), async ({ list, item_name }) => service.removePhoto({ list, itemName: item_name }));
  tool(server, 'bring_copy_item', z.object({ source_list: list, target_lists: z.array(list).min(1), item_name: name, include_photo: z.boolean().default(false) }), async ({ source_list, target_lists, item_name, include_photo }) => service.copyItem({ sourceList: source_list, targetLists: target_lists, itemName: item_name, includePhoto: include_photo }));
  tool(server, 'bring_move_item', z.object({ source_list: list, target_list: list, item_name: name, include_photo: z.boolean().default(false) }), async ({ source_list, target_list, item_name, include_photo }) => service.moveItem({ sourceList: source_list, targetList: target_list, itemName: item_name, includePhoto: include_photo }));
  tool(server, 'bring_check_item', z.object({ list, item_name: name }), async ({ list, item_name }) => service.checkItem(list, item_name));
  tool(server, 'bring_uncheck_item', z.object({ list, item_name: name }), async ({ list, item_name }) => service.uncheckItem(list, item_name));
  tool(server, 'bring_remove_item', z.object({ list, item_name: name }), async ({ list, item_name }) => service.removeItem(list, item_name));
  return server;
}
