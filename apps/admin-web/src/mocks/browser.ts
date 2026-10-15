import { setupWorker } from "msw/browser";
import { handlers } from "./handlers.js";

const worker = setupWorker(...handlers);
export const startMocks = () => worker.start({ onUnhandledRequest: "bypass" });
