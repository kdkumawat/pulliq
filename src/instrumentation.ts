export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logAnalyticsStatus } = await import("./lib/analytics-config");
    logAnalyticsStatus();
    const { startKeepAlive } = await import("./lib/keep-alive");
    startKeepAlive();
  }
}
