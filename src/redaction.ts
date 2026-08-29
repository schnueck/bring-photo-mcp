const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SECRET = /\b(password|token|authorization|cookie|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi;
const ABSOLUTE_PATH = /(?:file:\/\/)?\/(?:[^\s/'"\\]+\/)*[^\s/'"\\]+/g;
export function redact(value: string): string { return value.replace(SECRET, '$1=[REDACTED]').replace(UUID, '[REDACTED_UUID]').replace(ABSOLUTE_PATH, '[REDACTED_PATH]'); }
export function safeErrorMessage(error: unknown): string { return redact(error instanceof Error ? error.message : String(error)); }
