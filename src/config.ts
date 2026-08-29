import { z } from 'zod';
import { BringError, ErrorCodes } from './errors.js';

const configSchema = z.object({
  BRING_ENV: z.enum(['test', 'prod']).default('test'),
  BRING_EMAIL: z.string().email(),
  BRING_PASSWORD: z.string().min(1),
  BRING_DEFAULT_LIST: z.string().min(1),
  BRING_ALLOWED_LISTS: z.string().min(1),
  BRING_LOCALE: z.string().min(2).default('de-DE'),
  BRING_TEST_ITEM_PREFIX: z.string().min(1).default('MCP-TEST-'),
  BRING_TEST_SECOND_LIST: z.string().min(1).optional(),
});

export type BringConfig = {
  environment: 'test' | 'prod';
  email: string;
  password: string;
  defaultList: string;
  allowedLists: string[];
  locale: string;
  testItemPrefix: string;
};

export type BringE2eConfig = BringConfig & { secondList?: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BringConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new BringError(ErrorCodes.CONFIGURATION, 'Invalid Bring configuration');
  const value = parsed.data;
  const allowedLists = value.BRING_ALLOWED_LISTS.split(',').map((item) => item.trim()).filter(Boolean);
  if (allowedLists.length === 0) throw new BringError(ErrorCodes.CONFIGURATION, 'Invalid Bring configuration');
  return {
    environment: value.BRING_ENV,
    email: value.BRING_EMAIL,
    password: value.BRING_PASSWORD,
    defaultList: value.BRING_DEFAULT_LIST,
    allowedLists,
    locale: value.BRING_LOCALE,
    testItemPrefix: value.BRING_TEST_ITEM_PREFIX,
  };
}

/** Strict gate for the explicitly opt-in live harness. */
export function loadE2eConfig(env: NodeJS.ProcessEnv = process.env): BringE2eConfig {
  try {
    const config = loadConfig(env);
    const secondList = env.BRING_TEST_SECOND_LIST?.trim() || undefined;
    const namedLists = [config.defaultList, ...(secondList ? [secondList] : [])];
    const distinctNamedLists = new Set(namedLists);
    const distinctAllowedLists = new Set(config.allowedLists);
    if (
      config.environment !== 'test'
      || !config.testItemPrefix
      || distinctNamedLists.size !== namedLists.length
      || distinctAllowedLists.size !== namedLists.length
      || namedLists.some((list) => !distinctAllowedLists.has(list))
    ) throw new Error('invalid');
    return { ...config, secondList };
  } catch {
    throw new BringError(ErrorCodes.CONFIGURATION, 'Invalid Bring E2E configuration');
  }
}
