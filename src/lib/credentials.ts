/** Format checks only. OpenAI verifies whether a supplied key is authorized. */
export function isValidApiKey(value: string): boolean {
  return /^sk-[A-Za-z0-9_-]{16,509}$/.test(value);
}

/** Keep accidentally pasted credentials out of research, exports, and history. */
export function redactCredentials(text: string, sensitiveKey?: string): string {
  const withoutExactKey = sensitiveKey
    ? text.split(sensitiveKey).join("[API key removed]")
    : text;
  return withoutExactKey.replace(/sk-[A-Za-z0-9_-]{16,}/g, "[API key removed]");
}
