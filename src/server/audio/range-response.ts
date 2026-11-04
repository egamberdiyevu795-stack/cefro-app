import "server-only";

/**
 * A response for stored audio that honours HTTP Range requests.
 *
 * Browsers fetch media in ranges: Safari refuses to play audio from a server that answers a Range request with a
 * plain 200, and Chrome cannot seek (or scan a WebM for its duration) without range support. A single byte range is
 * supported ("bytes=start-end", "bytes=start-", "bytes=-suffix"); anything else gets the whole file.
 */
export function audioResponse(data: Buffer, mimeType: string, rangeHeader: string | null): Response {
  const total = data.byteLength;
  const headers = {
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  const range = parseRange(rangeHeader, total);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${total}` } });
  }
  if (!range) {
    return new Response(new Uint8Array(data), { status: 200, headers: { ...headers, "Content-Length": String(total) } });
  }
  const { start, end } = range;
  return new Response(new Uint8Array(data.subarray(start, end + 1)), {
    status: 206,
    headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${total}` },
  });
}

export function parseRange(header: string | null, total: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null; // multiple or malformed ranges: send everything
  if (total === 0) return "unsatisfiable";
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, total - suffix), end: total - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === "" ? total - 1 : Math.min(Number(match[2]), total - 1);
  if (start >= total || end < start) return "unsatisfiable";
  return { start, end };
}
