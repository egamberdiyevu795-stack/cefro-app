import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.EMAIL_PROVIDER = "off";
});
vi.mock("next/headers", async () => (await import("../../../../test/next-headers-mock")).nextHeadersMock);

import { openDatabase, setDbForTesting } from "@/server/db/client";
import { authVerifications } from "@/server/db/schema";
import { resetAuthLimitersForTesting } from "@/server/auth/auth-limits";
import { signUp } from "../../../../test/auth-helpers";
import { POST as forgotPost } from "./forgot-password/route";

afterEach(() => setDbForTesting(undefined));
beforeEach(() => resetAuthLimitersForTesting());

describe("Forgot password on a server that cannot send email", () => {
  it("says so (503) and makes no token", async () => {
    const db = await openDatabase(":memory:");
    setDbForTesting(db);
    await signUp("student@example.com");
    const response = await forgotPost(
      new Request("http://localhost/api/account/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ email: "student@example.com" }),
      }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toEqual({
      code: "password_reset_unavailable",
      message: "Password reset by email is not switched on yet. Ask your teacher for help.",
    });
    expect(await db.select().from(authVerifications).all()).toHaveLength(0);
  });
});
