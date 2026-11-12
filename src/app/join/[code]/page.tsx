import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isMockQuery, withMock } from "@/features/demo/demo-mode";
import { normaliseJoinCode } from "@/domain/teacher/rules";
import { studentLinks } from "@/features/teacher/links";
import { findCurrentUserId } from "@/server/identity/current-user";
import { teacherLive } from "@/server/teacher/release";
import { notFound } from "next/navigation";
import { assertServerConfigured } from "@/server/config/boot-check";
import { readAccount } from "@/server/account/account-store";

export const metadata: Metadata = { title: "Join a class" };

/**
 * A teacher's join link (docs/v1-plan.md section 4.1): `/join/K7M4QD` opens the normal Join screen with the code filled
 * in (nothing is looked up, nothing is stored, nothing is shared by opening it). The student still taps Continue, reads
 * the Share screen and taps "Share with this teacher". Signed out: sign in first, then back to the same link.
 * `?mock=1`: the demo's Join and Share screens. A 404 while the Teacher view is off.
 */
export default async function JoinLinkPage(props: PageProps<"/join/[code]">) {
  await connection();
  const [{ code: raw }, query] = await Promise.all([props.params, props.searchParams]);
  const code = normaliseJoinCode(decodeURIComponent(raw));
  if (isMockQuery(query)) redirect(withMock(`${studentLinks.join}?${new URLSearchParams({ code })}`));
  if (!teacherLive()) notFound();
  assertServerConfigured();
  const target = `${studentLinks.join}?${new URLSearchParams({ code })}`;
  const userId = await findCurrentUserId();
  const account = userId ? await readAccount(userId) : null;
  if (!account || account.kind !== "registered") redirect(`/login?${new URLSearchParams({ next: `/join/${encodeURIComponent(code)}` })}`);
  redirect(target);
}
