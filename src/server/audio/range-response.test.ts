import { describe, expect, it } from "vitest";
import { audioResponse, parseRange } from "./range-response";

const data = Buffer.from("0123456789");

describe("audio range responses", () => {
  it("sends the whole file with Accept-Ranges when no range is asked for", async () => {
    const response = audioResponse(data, "audio/webm", null);
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("content-length")).toBe("10");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("0123456789");
  });

  it("answers a byte range with 206 and Content-Range", async () => {
    const response = audioResponse(data, "audio/webm", "bytes=2-5");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("2345");
  });

  it("supports open-ended and suffix ranges (what browsers send for media)", () => {
    expect(parseRange("bytes=0-", 10)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=8-100", 10)).toEqual({ start: 8, end: 9 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
  });

  it("rejects unsatisfiable ranges with 416 and ignores malformed ones", () => {
    expect(audioResponse(data, "audio/webm", "bytes=20-").status).toBe(416);
    expect(parseRange("bytes=5-2", 10)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-1,4-5", 10)).toBeNull();
    expect(parseRange("items=0-1", 10)).toBeNull();
  });
});
