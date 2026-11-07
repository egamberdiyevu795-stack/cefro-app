import { redirect } from "next/navigation";
import { isMockQuery } from "@/features/demo/demo-mode";

/**
 * Settings was merged into the Account page (design change approved by Asadbek, 2026-11-07). Old links land there,
 * keeping mock mode (`/settings?mock=1` → `/profile?mock=1`).
 */
export default async function SettingsPage(props: PageProps<"/settings">) {
  redirect(isMockQuery(await props.searchParams) ? "/profile?mock=1" : "/profile");
}
