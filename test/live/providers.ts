/**
 * Which REAL evaluation provider is configured for live runs.
 * Mirrors the server's provider selection without importing server code
 * (this is evaluated while deciding whether to skip a suite).
 */
const KEY_VAR: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export function evaluatorSelection(env: NodeJS.ProcessEnv = process.env): { provider: string; configured: boolean; hint: string } {
  const provider = env.EVALUATION_PROVIDER || "anthropic";
  const keyVar = KEY_VAR[provider];
  if (!keyVar) return { provider, configured: false, hint: `EVALUATION_PROVIDER=${provider} is not a real provider (use gemini or anthropic).` };
  const configured = Boolean(env[keyVar]);
  return { provider, configured, hint: configured ? "" : `Set EVALUATION_PROVIDER=${provider} and ${keyVar} (never commit the key).` };
}
