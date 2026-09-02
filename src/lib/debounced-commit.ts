import { useEffect, useState } from "react";

// JOS-42: Android Chrome doesn't reliably fire a DOM `blur` event when the
// on-screen keyboard is dismissed via its own control (down-chevron / back
// gesture / numeric keypad) rather than by focus moving to another element
// (long-documented Chromium behavior, e.g. crbug.com/492894). An
// onBlur-only commit can silently never run. `trigger` commits shortly
// after the user stops typing regardless of whether blur ever fires;
// `flush` (wired to onBlur) still gives an instant commit on the normal
// desktop/focus-shift path and cancels any pending debounce so the two
// don't race.
export interface DebouncedCommit<T> {
  trigger: (value: T) => void;
  flush: (value: T) => void;
  cancel: () => void;
  setCommit: (commit: (value: T) => void) => void;
}

export function createDebouncedCommit<T>(
  commit: (value: T) => void,
  delayMs: number,
): DebouncedCommit<T> {
  let commitFn = commit;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function setCommit(next: (value: T) => void) {
    commitFn = next;
  }

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function trigger(value: T) {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      commitFn(value);
    }, delayMs);
  }

  function flush(value: T) {
    cancel();
    commitFn(value);
  }

  return { trigger, flush, cancel, setCommit };
}

// Keeps one DebouncedCommit instance alive for the life of the component
// while always calling the latest `commit` closure (moment/handler props
// are fresh every render; the timer itself must not be). Deliberately
// avoids useRef for this: this codebase's react-hooks/refs (React
// Compiler) rule forbids reading/writing a ref's `.current` during render,
// and a naive "latest callback ref" pattern trips it. `setCommit` swaps the
// debouncer's internal closure from an effect instead, so no ref is ever
// touched from the render body.
export function useDebouncedCommit<T>(
  commit: (value: T) => void,
  delayMs: number,
): DebouncedCommit<T> {
  const [instance] = useState(() => createDebouncedCommit<T>(commit, delayMs));

  useEffect(() => {
    instance.setCommit(commit);
  });

  useEffect(() => () => instance.cancel(), [instance]);

  return instance;
}
