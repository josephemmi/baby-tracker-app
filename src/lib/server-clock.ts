// "Now", as the server sees it. Start, Pause, Resume and Stop are stamped with
// the server's clock, so the timer must be read against it too — otherwise a
// phone whose own clock is a few minutes off would show a wrong timer for a
// sleep that was started correctly. Every reply from the sleep functions
// carries the server's time; this keeps the gap between it and the device
// clock, and everything that shows or judges a time uses `serverNow()`.
//
// Module state, deliberately: there is one clock per page, shared by every
// sleep card, and it must survive a card unmounting.

let offsetMs = 0;

// Told when the gap changes by enough to see (a phone whose clock is wrong
// learning it, on the first reply), so what is on screen can redraw at once
// instead of waiting for its next tick.
const listeners = new Set<() => void>();
const NOTICEABLE_MS = 1000;

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function subscribeServerClock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// `sentAt`/`receivedAt` are the device times around the request. The server
// stamped its time somewhere in between, so take the midpoint: that keeps a
// slow round trip from shifting the clock by the whole delay.
export function syncServerClock(serverMs: number, sentAt: number, receivedAt: number) {
  if (!Number.isFinite(serverMs)) return;
  const next = serverMs - (sentAt + receivedAt) / 2;
  const moved = Math.abs(next - offsetMs) >= NOTICEABLE_MS;
  offsetMs = next;
  if (moved) listeners.forEach((listener) => listener());
}

export function resetServerClock() {
  const moved = Math.abs(offsetMs) >= NOTICEABLE_MS;
  offsetMs = 0;
  if (moved) listeners.forEach((listener) => listener());
}
