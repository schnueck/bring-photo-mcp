export const ErrorCodes = {
  CONFIGURATION: 'CONFIGURATION', LIST_NOT_ALLOWED: 'LIST_NOT_ALLOWED', LIST_NOT_FOUND: 'LIST_NOT_FOUND', ITEM_NOT_FOUND: 'ITEM_NOT_FOUND', INVALID_CLASSIFICATION: 'INVALID_CLASSIFICATION', DUPLICATE_AMBIGUOUS: 'DUPLICATE_AMBIGUOUS', VERIFICATION_FAILED: 'VERIFICATION_FAILED', UPSTREAM_FAILURE: 'UPSTREAM_FAILURE', IMAGE_INVALID: 'IMAGE_INVALID', CLASSIFICATION_UNCERTAIN: 'CLASSIFICATION_UNCERTAIN',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
export class BringError extends Error { constructor(public readonly code: ErrorCode, message: string, public readonly cause?: unknown) { super(message); this.name = 'BringError'; } }
export const asBringError = (error: unknown): BringError => error instanceof BringError ? error : new BringError(ErrorCodes.UPSTREAM_FAILURE, 'Bring request failed', error);
