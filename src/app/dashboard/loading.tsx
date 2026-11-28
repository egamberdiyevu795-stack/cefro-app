import { LoadingFrame } from "@/features/shell/LoadingFrame";

/** Shown at once while this section's page is built on the server (see LoadingFrame). */
export default function Loading() {
  return <LoadingFrame activeHref="/dashboard" />;
}
