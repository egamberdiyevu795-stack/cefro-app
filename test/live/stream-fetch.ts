/**
 * Live runs only (EVAL_STREAM=1): a `fetch` for the Gemini SDK that sends each `generateContent` call as
 * `streamGenerateContent` (SSE, thought summaries on) and hands the SDK back one ordinary JSON response.
 *
 * Why: some networks (e.g. the Claude Code cloud sandbox's egress proxy) cut a request that sends no bytes for
 * ~30 s, and a high-thinking evaluation takes 40–90 s before its first byte. Streaming the thought summaries keeps
 * bytes flowing. Thought parts stay flagged `thought: true`, which the evaluator already drops. Never used by the app.
 */
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- raw REST JSON

export const streamingFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!/:generateContent(\?|$)/.test(url) || !init?.body || typeof init.body !== "string") return fetch(input, init);

  const body = JSON.parse(init.body) as Json;
  body.generationConfig = body.generationConfig ?? {};
  body.generationConfig.thinkingConfig = { ...(body.generationConfig.thinkingConfig ?? {}), includeThoughts: true };
  const streamUrl = url.replace(":generateContent", ":streamGenerateContent").replace(/(\?|$)/, (m) => (m === "?" ? "?alt=sse&" : "?alt=sse"));
  const res = await fetch(streamUrl, { ...init, body: JSON.stringify(body) });
  if (!res.ok || !res.body) return res;

  const raw = await res.text();
  const chunks = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()) as Json);
  if (!chunks.length) return new Response(raw, { status: 502, statusText: "empty stream" });

  // Merge: consecutive text parts with the same `thought` flag are joined; the last chunk carries finishReason/usage.
  const parts: Json[] = [];
  for (const chunk of chunks) {
    for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
      const last = parts[parts.length - 1];
      if (typeof part.text === "string" && last && typeof last.text === "string" && Boolean(last.thought) === Boolean(part.thought)) {
        last.text += part.text;
      } else if (typeof part.text === "string") {
        parts.push({ text: part.text, ...(part.thought ? { thought: true } : {}) });
      }
    }
  }
  const last = chunks[chunks.length - 1];
  const finishReason = [...chunks].reverse().map((c) => c.candidates?.[0]?.finishReason).find(Boolean);
  const merged: Json = {
    candidates: [{ content: { role: "model", parts }, ...(finishReason ? { finishReason } : {}), index: 0 }],
    usageMetadata: [...chunks].reverse().map((c) => c.usageMetadata).find(Boolean),
    modelVersion: last.modelVersion,
    responseId: last.responseId,
    ...(chunks.find((c) => c.promptFeedback) ? { promptFeedback: chunks.find((c) => c.promptFeedback)!.promptFeedback } : {}),
  };
  return new Response(JSON.stringify(merged), { status: 200, headers: { "content-type": "application/json" } });
};
