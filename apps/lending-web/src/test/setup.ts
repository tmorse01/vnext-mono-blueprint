import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "../mocks/handlers.js";
import { resetScenarioFixtures } from "../mocks/fixtures.js";

export const server = setupServer(...handlers);

class TestResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element, _options?: ResizeObserverOptions) {
    this.callback([{ target, contentRect: { width: 980, height: 540, top: 0, right: 980, bottom: 540, left: 0, x: 0, y: 0, toJSON: () => ({}) }, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], this);
  }
  unobserve(_target: Element) {}
  disconnect() {}
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  globalThis.ResizeObserver = TestResizeObserver;
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) });
});
afterEach(() => { cleanup(); server.resetHandlers(); resetScenarioFixtures(); });
afterAll(() => server.close());
