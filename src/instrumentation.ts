export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startKeepAlive } = await import("./lib/keep-alive");
    startKeepAlive();
  }
}
