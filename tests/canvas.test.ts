import { afterEach, describe, expect, it, vi } from "vitest";
import { CoordinateCanvas } from "../src/ui/canvas";
import { MAX_INPUT_POINTS } from "../src/core/preprocess";

function createCanvasHarness() {
  const listeners = new Map<string, EventListener>();
  let clearCount = 0;
  const context = {
    save() {}, restore() {}, setTransform() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {},
    clearRect() { clearCount += 1; },
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (typeof listener === "function") listeners.set(type, listener);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    getContext: () => context,
    setPointerCapture() {},
    hasPointerCapture: () => true,
    releasePointerCapture() {},
  } as unknown as HTMLCanvasElement;

  return {
    canvas,
    clearCount: () => clearCount,
    dispatch(type: string, event: Partial<PointerEvent>) {
      listeners.get(type)?.(event as Event);
    },
  };
}

function pointer(pointerId: number, button: number): Partial<PointerEvent> {
  return { pointerId, button, clientX: 120, clientY: 100, altKey: false, shiftKey: false };
}

describe("coordinate canvas pointer cancellation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("discards a canceled partial stroke", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1, addEventListener: vi.fn() });
    const harness = createCanvasHarness();
    const onCancel = vi.fn();
    new CoordinateCanvas(harness.canvas, vi.fn(), vi.fn(), onCancel);
    harness.dispatch("pointerdown", pointer(1, 0));
    harness.dispatch("pointermove", { ...pointer(1, 0), clientX: 180, clientY: 130 });
    const clearsBeforeCancel = harness.clearCount();

    harness.dispatch("pointercancel", pointer(1, 0));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(harness.clearCount()).toBeGreaterThan(clearsBeforeCancel);
  });

  it("does not cancel the current result when a pan gesture is canceled", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1, addEventListener: vi.fn() });
    const harness = createCanvasHarness();
    const onCancel = vi.fn();
    new CoordinateCanvas(harness.canvas, vi.fn(), vi.fn(), onCancel);
    harness.dispatch("pointerdown", pointer(2, 1));

    harness.dispatch("pointercancel", pointer(2, 1));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("bounds the captured stroke and retains its last point", () => {
    vi.stubGlobal("window", { devicePixelRatio: 1, addEventListener: vi.fn() });
    const harness = createCanvasHarness();
    let captured: Array<{ x: number; y: number; t: number }> = [];
    const canvas = new CoordinateCanvas(harness.canvas, (points) => { captured = points; });
    (canvas as unknown as { draw: () => void }).draw = () => undefined;
    harness.dispatch("pointerdown", pointer(3, 0));
    for (let index = 0; index < MAX_INPUT_POINTS + 20; index += 1) {
      harness.dispatch("pointermove", { ...pointer(3, 0), clientX: index % 2 === 0 ? 200 : 120 });
    }
    const lastX = (harness.canvas.getBoundingClientRect().width > 0) ? 120 : 0;

    harness.dispatch("pointerup", pointer(3, 0));

    expect(captured.length).toBeLessThanOrEqual(MAX_INPUT_POINTS);
    expect(captured.at(-1)?.x).toBeCloseTo(lastX / 800 * 10 - 5);
  });
});
