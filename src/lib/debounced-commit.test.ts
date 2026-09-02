import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedCommit } from "@/lib/debounced-commit";

// JOS-42 regression coverage: the mL field's fix is committing on a
// debounce rather than depending solely on blur. These tests exercise the
// underlying timer mechanism directly (no DOM/blur event involved) to prove
// a value gets committed from typing alone, which is exactly what
// onBlur-only saving could not guarantee on Android Chrome.
describe("createDebouncedCommit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits after the delay with no flush/blur ever occurring", () => {
    const commit = vi.fn();
    const debounced = createDebouncedCommit(commit, 600);

    debounced.trigger("120");
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(commit).toHaveBeenCalledExactlyOnceWith("120");
  });

  it("resets the timer on each keystroke and only commits the latest value", () => {
    const commit = vi.fn();
    const debounced = createDebouncedCommit(commit, 600);

    debounced.trigger("1");
    vi.advanceTimersByTime(400);
    debounced.trigger("12");
    vi.advanceTimersByTime(400);
    debounced.trigger("120");
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(commit).toHaveBeenCalledExactlyOnceWith("120");
  });

  it("flush commits immediately and cancels the pending debounce", () => {
    const commit = vi.fn();
    const debounced = createDebouncedCommit(commit, 600);

    debounced.trigger("120");
    debounced.flush("120");
    expect(commit).toHaveBeenCalledExactlyOnceWith("120");

    vi.advanceTimersByTime(600);
    expect(commit).toHaveBeenCalledOnce();
  });

  it("cancel drops a pending commit entirely", () => {
    const commit = vi.fn();
    const debounced = createDebouncedCommit(commit, 600);

    debounced.trigger("120");
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(commit).not.toHaveBeenCalled();
  });

  it("setCommit swaps which callback a pending debounce fires into", () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const debounced = createDebouncedCommit(stale, 600);

    debounced.trigger("120");
    debounced.setCommit(fresh);
    vi.advanceTimersByTime(600);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledExactlyOnceWith("120");
  });
});
