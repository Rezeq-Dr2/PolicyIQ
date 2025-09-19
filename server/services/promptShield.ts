export function sanitizePrompt(input: string): string {
  // Basic guard against prompt injections / system prompt modifications
  const banned = [/ignore (all|previous) instructions/i, /act as/i, /system:/i];
  let out = input;
  for (const re of banned) out = out.replace(re, '[redacted]');
  // Truncate overly long inputs to protect cost and exfiltration
  if (out.length > 12000) out = out.slice(0, 12000);
  return out;
}

export function validateJsonOutput<T = any>(raw: string): T {
  // Enforce JSON object; throw on invalid
  const parsed = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object') throw new Error('LLM output is not an object');
  return parsed as T;
}


