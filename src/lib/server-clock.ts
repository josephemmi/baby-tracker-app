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

export function serverNow(): number {
  return Date.now() + offsetMs;
}

// `sentAt`/`receivedAt` are the device times around the request. The server
// stamped its time somewhere in between, so take the midpoint: that keeps a
// slow round trip from shifting the clock by the whole delay.
export function syncServerClock(serverMs: number, sentAt: number, receivedAt: number) {
  if (!Number.isFinite(serverMs)) return;
  offsetMs = serverMs - (sentAt + receivedAt) / 2;
}

export function resetServerClock() {
  offsetMs = 0;
}
