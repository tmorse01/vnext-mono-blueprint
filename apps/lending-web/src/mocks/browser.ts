export async function startMocks() {
  const { setupWorker } = await import("msw/browser");
  const { handlers } = await import("./handlers.js");
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: "bypass" });
}
