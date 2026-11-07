import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/(site)/page";
import { ACCOUNT_DELETED, ACCOUNT_DELETED_HREF, isAccountDeletedQuery } from "./deleted";

const home = async (query: Record<string, string>) =>
  renderToStaticMarkup((await HomePage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as never)) as React.ReactElement);

describe("after Delete my account", () => {
  it("lands on the home page with the message", async () => {
    expect(ACCOUNT_DELETED_HREF).toBe("/?deleted=1");
    expect(isAccountDeletedQuery({ deleted: "1" })).toBe(true);
    const markup = await home({ deleted: "1" });
    expect(markup).toContain('role="status"');
    expect(markup).toContain(ACCOUNT_DELETED);
    expect(ACCOUNT_DELETED).toBe("Your account and all your data were deleted.");
  });

  it("no message otherwise, and never in mock mode (nothing is deleted there)", async () => {
    expect(await home({})).not.toContain(ACCOUNT_DELETED);
    expect(await home({ deleted: "0" })).not.toContain(ACCOUNT_DELETED);
    expect(await home({ deleted: "1", mock: "1" })).not.toContain(ACCOUNT_DELETED);
  });
});
