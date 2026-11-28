import { LoadingFrame } from "@/features/shell/LoadingFrame";

/** Shown at once while a result page is built on the server (see LoadingFrame). */
export default function Loading() {
  return <LoadingFrame activeHref="/practice" />;
}
