/** Runs once per server start. Provider configuration is validated here (see server/config/boot-check.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` collects page data in production mode with no runtime secrets: not a deploy-time check.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { checkProvidersAtBoot } = await import("@/server/config/boot-check");
  checkProvidersAtBoot();
}
