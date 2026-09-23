import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/ui/main-view";

describe("clipboard fallback", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the textarea fallback when the Clipboard API rejects", async () => {
    const textarea = { value: "", style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    const execCommand = vi.fn(() => true);
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", { createElement: vi.fn(() => textarea), body: { appendChild }, execCommand });

    await copyText("y = x");

    expect(writeText).toHaveBeenCalledWith("y = x");
    expect(appendChild).toHaveBeenCalledWith(textarea);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.remove).toHaveBeenCalledOnce();
  });
});
