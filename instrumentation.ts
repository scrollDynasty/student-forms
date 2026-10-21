// Next.js runs register() once per server instance, before it accepts requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { runStartupChecks } = await import('@/lib/server/startup');
  await runStartupChecks();
}
