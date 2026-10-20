"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Moment } from "@/lib/entries";
import {
  asleepMs,
  canReopen,
  closedAtOf,
  firstStart,
  lastStretch,
  pausesOf,
  stateOf,
  type Sleep,
  type SleepField,
  type SleepState,
} from "@/lib/sleep";
import type { SleepTimeInput } from "@/lib/sleep-api";
import {
  durationLabel,
  deviceZone,
  listPauses,
  pauseCountLabel,
  pauseLength,
  REMOVE_NEEDS_REOPEN,
  removePauseBody,
  removePauseLabel,
  reopenHint,
  timerDigits,
  timerSpoken,
  type PauseList as PauseListData,
  type PauseRow,
  type Zone,
} from "@/lib/sleep-format";
import { initials, personColor } from "@/lib/person-colors";
import {
  EditableToggleTile,
  FEED_FLAG_STYLES,
  SLEEP_STYLE,
  TYPE_STYLES,
} from "@/components/log/entry-styles";
import { NotesCell } from "@/components/log/notes-cell";
import { ConfirmDeleteModal } from "@/components/ui/confirm-delete-modal";
import { SleepTimePicker } from "@/components/log/sleep-time-picker";
import { useServerNow } from "@/components/log/use-server-now";

interface Member {
  id: string;
  name: string;
}

export interface SleepCardProps {
  sleep: Sleep;
  // Every sleep we know of: whether this one can be reopened, and what its
  // start may be set to, depend on the others.
  sleeps: Sleep[];
  now: number;
  zone: Zone;
  members: Member[];
  memberNames: Record<string, string>;
  flash?: boolean;
  // Shown before the time when the sleep is not from today. The phone list
  // has day dividers for this; the wide layout does not.
  dayPrefix?: string;
  // An action is in flight for this sleep.
  busy?: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReopen: () => void;
  onDelete: () => void;
  // Resolves to a message when the server refused the time, null when saved.
  onSetTime: (field: SleepField, input: SleepTimeInput) => Promise<string | null>;
  // Resolves to a message when the server refused (the pause is gone, it would
  // overlap another sleep, the network dropped), null when it went or when the
  // other parent's change already explained itself. `index` is the 0-based
  // number of the stretch before the pause.
  onRemovePause: (index: number) => Promise<string | null>;
  onLoggedByCycle: () => void;
  onNotesCommit: (value: string) => void;
  onNotice: (text: string) => void;
}

// "Started earlier?" / "Woke earlier?": on a line of its own under the start
// (or awake) time, with room to tap.
const LINK =
  "relative z-10 min-h-[40px] px-2 pt-2.5 pb-2 text-[13px] font-bold text-night underline decoration-night decoration-dotted underline-offset-[3px]";

const BUTTON =
  "w-full rounded-full border-[1.5px] p-3 text-center text-[14px] font-bold transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

// Stop is the app's dark rose (already Discard sleep's colour): red enough to
// say "this ends it", calm enough not to read as an alarm. Pause stays blue.
const STOP_BUTTON = "border-stop bg-stop text-white";

function Dim({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 opacity-[0.42]">{children}</div>;
}

// "Sleeping" / "Paused" / "Slept": the word sits on the card's centre line,
// the same one the timer and the start time use, and the dot hangs to its
// left — so the word, not the word-and-dot pair, is what lines up.
function StatusLabel({
  tone,
  dot,
  pulse = false,
  children,
}: {
  tone: string;
  dot: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] items-center text-[15px] font-extrabold tracking-[0.08em] uppercase ${tone}`}
    >
      <span
        className={`mr-[9px] h-[11px] w-[11px] flex-none justify-self-end rounded-full ${dot} ${
          pulse ? "sleep-dot-live" : ""
        }`}
        aria-hidden="true"
      />
      <span>{children}</span>
    </div>
  );
}

// The "2 pauses ⌄" button under the summary, and — because the summary box is
// one big tap target for it — the way a tap anywhere on the box opens the list.
// The button is the only thing a keyboard or screen reader meets; its ::after
// covers the whole box (the box is `relative`), and the box's own buttons
// ("Started earlier?") sit above it.
function PauseToggle({
  count,
  open,
  controls,
  onToggle,
}: {
  count: number;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex justify-center pb-0.5">
      <button
        type="button"
        data-pause-toggle
        aria-expanded={open}
        aria-controls={controls}
        onClick={onToggle}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-[1.5px] border-line-strong bg-paper-raised px-3.5 text-[13px] font-bold text-ink-soft after:absolute after:inset-0 after:rounded-[11px] after:content-[''] hover:bg-[#f3eedf] focus-visible:outline-none"
      >
        {pauseCountLabel(count)}
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

// What the summary box does when there are pauses to show: it is tappable all
// over, and shows the keyboard focus of the button inside it. (The running box
// has no hover tint: a darker one would take its text lower than the 9:1 or so
// it has on the sleep tint.)
const WELL_TAPPABLE =
  "cursor-pointer has-[[data-pause-toggle]:focus-visible]:outline-[3px] has-[[data-pause-toggle]:focus-visible]:outline-offset-[3px] has-[[data-pause-toggle]:focus-visible]:outline-night";

// Opens and closes without taking its content out of the page: a one-row grid
// that grows from 0fr to 1fr. Closed, it is `inert` so nothing in it can be
// tabbed to or read out.
function Reveal({ id, open, children }: { id: string; open: boolean; children: React.ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

// Every pause of the sleep, in time order: when it began and ended, and how
// long it lasted. A header with the total and nothing under the rows. Remove
// is offered only while the sleep is open; a finished card is read-only, and
// says how to change that.
function PauseList({
  headingId,
  list,
  zone,
  canRemove,
  needsReopen,
  busy,
  error,
  onRemove,
}: {
  headingId: string;
  list: PauseListData;
  zone: Zone;
  canRemove: boolean;
  needsReopen: boolean;
  busy: boolean;
  error: string | null;
  onRemove: (row: PauseRow, opener: HTMLButtonElement) => void;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="mb-2.5 rounded-[12px] border border-line bg-paper px-3 pb-2.5"
    >
      <div className="flex items-baseline justify-between gap-3 pt-3 pb-2 text-[12.5px] tabular-nums text-ink-soft">
        <h3 id={headingId} className="text-[14px] font-bold text-ink">
          Pauses
        </h3>
        <span>{pauseLength(list.totalMs)} paused</span>
      </div>
      <ul>
        {list.rows.map((row) => (
          <li
            key={row.index}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2"
          >
            <div className="min-w-0 flex-auto">
              <span className="block text-[14px] font-bold whitespace-nowrap tabular-nums">
                {zone.fmtTime(row.start)} <span aria-hidden="true">→</span>
                <span className="sr-only">to</span> {zone.fmtTime(row.end)}
              </span>
              <span className="block text-[12.5px] tabular-nums text-ink-soft">
                {pauseLength(row.end - row.start)}
              </span>
            </div>
            {canRemove && (
              <button
                type="button"
                data-pause-remove
                disabled={busy}
                aria-label={removePauseLabel(zone, row)}
                onClick={(event) => onRemove(row, event.currentTarget)}
                className="ml-auto min-h-[44px] min-w-[80px] rounded-full border-[1.5px] border-stop bg-transparent px-3 text-[13px] font-bold text-stop transition-colors hover:bg-rose-soft disabled:cursor-not-allowed disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {list.open && (
          <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line py-2">
            <div className="min-w-0 flex-auto">
              <span className="block text-[14px] font-bold whitespace-nowrap tabular-nums">
                {zone.fmtTime(list.open.start)} <span aria-hidden="true">→</span>
                <span className="sr-only">to</span> now
              </span>
              <span className="block text-[12.5px] tabular-nums text-ink-soft">
                {pauseLength(list.open.ms)} so far
              </span>
            </div>
            <span className="ml-auto text-right text-[12.5px] font-bold text-ink-soft">
              Resume to end it
            </span>
          </li>
        )}
      </ul>
      {needsReopen && (
        <p className="border-t border-line pt-2 text-[12px] leading-normal text-ink-soft">
          {REMOVE_NEEDS_REOPEN}
        </p>
      )}
      {error && (
        <p role="alert" className="border-t border-line pt-2 text-[12px] leading-normal text-rose-dark">
          {error}
        </p>
      )}
    </section>
  );
}

function Timer({
  ms,
  tone,
  size,
}: {
  ms: number;
  tone: "live" | "paused" | "done";
  size: "big" | "done";
}) {
  const { hours, minutes } = timerDigits(ms);
  const number = `${
    size === "big" ? "text-[clamp(50px,19vw,76px)]" : "text-[clamp(40px,14vw,56px)]"
  } font-extrabold tracking-[-0.02em]`;
  const unit = "text-[clamp(16px,5.4vw,22px)] font-bold";
  const numberTone =
    tone === "live" ? "text-night" : tone === "paused" ? "text-ink-soft" : "text-ink";
  const unitTone = tone === "live" ? "text-night" : "text-ink-soft";

  return (
    <div
      role="timer"
      aria-label={timerSpoken(ms)}
      className={`mt-1.5 mb-0.5 flex items-baseline justify-center gap-1.5 leading-[1.05] tabular-nums ${numberTone}`}
    >
      <span className={number}>{hours}</span>
      <span className={`${unit} ${unitTone} mr-2`}>h</span>
      <span className={number}>{minutes}</span>
      <span className={`${unit} ${unitTone}`}>m</span>
    </div>
  );
}

// A sleep, as a card: running, paused or finished. Pure of the clock — `now`
// and `zone` come in as props (LiveSleepCard below supplies the real ones),
// and every number on it is worked out from the sleep's stored times.
export function SleepCard({
  sleep,
  sleeps,
  now,
  zone,
  members,
  memberNames,
  flash = false,
  dayPrefix,
  busy = false,
  onPause,
  onResume,
  onStop,
  onReopen,
  onDelete,
  onSetTime,
  onRemovePause,
  onLoggedByCycle,
  onNotesCommit,
  onNotice,
}: SleepCardProps) {
  const state = stateOf(sleep, now);
  const live = state !== "finished";
  const last = lastStretch(sleep);
  const started = firstStart(sleep);
  const asleep = asleepMs(sleep, now);
  const pauses = pausesOf(sleep);
  const pauseList = listPauses(sleep, now);
  const revealId = useId();
  const headingId = useId();

  const [picker, setPicker] = useState<{ field: SleepField; state: SleepState } | null>(null);
  // The subcard goes away when the sleep's state changes under it (the other
  // parent stops it, say), and never opens on a finished sleep.
  if (picker && (state === "finished" || picker.state !== state)) setPicker(null);
  const openPicker = (field: SleepField) =>
    setPicker((cur) => (cur?.field === field ? null : { field, state }));

  // The pause list stays open through changes (a removal, the other parent's
  // resume) and closes itself only when the last pause is gone, so a later
  // pause doesn't find it already open.
  const [pausesOpen, setPausesOpen] = useState(false);
  if (pausesOpen && pauses === 0) setPausesOpen(false);
  const listOpen = pausesOpen && pauses > 0;
  const [removeError, setRemoveError] = useState<string | null>(null);
  if (removeError && !listOpen) setRemoveError(null);

  // "Remove this pause?" is open for the very version that was on screen when
  // Remove was tapped: if the sleep changes under it (the other parent edits
  // or stops it) it closes, like the under-a-minute dialog.
  const [removing, setRemoving] = useState<{ index: number; rev: number } | null>(null);
  if (removing && (removing.rev !== sleep.rev || state === "finished")) setRemoving(null);
  const removingRow = removing ? pauseList.rows.find((r) => r.index === removing.index) : undefined;
  // Where the keyboard goes back to when the box closes.
  const removeOpener = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // After a removal the keyboard goes to the Remove button now in the removed
  // pause's place, or to the pause button once the last one is gone. The row
  // it was on no longer exists, so this waits for the render that drops it.
  // After a refused one it goes back to the same button.
  const refocusAt = useRef<number | null>(null);
  const [, nudge] = useState(0);
  useEffect(() => {
    if (refocusAt.current === null) return;
    const buttons = cardRef.current?.querySelectorAll<HTMLButtonElement>("button[data-pause-remove]");
    const target = buttons?.length
      ? buttons[Math.min(refocusAt.current, buttons.length - 1)]
      : cardRef.current?.querySelector<HTMLButtonElement>("button[data-pause-toggle]");
    refocusAt.current = null;
    target?.focus();
  });

  async function confirmRemove() {
    if (!removing) return;
    const { index } = removing;
    setRemoving(null);
    setRemoveError(null);
    const message = await onRemovePause(index);
    if (message) setRemoveError(message);
    // Refused or removed, the keyboard goes back to that place in the list. It
    // waits for the next render: the buttons are still disabled until the
    // in-flight flag clears, and a disabled button can't take focus.
    refocusAt.current = index;
    nudge((n) => n + 1);
  }

  const loggedByIndex = members.findIndex((m) => m.id === sleep.by);
  const loggedByName = (sleep.by && memberNames[sleep.by]) ?? "Unknown";
  const color = personColor(Math.max(0, loggedByIndex));

  // The note cell is the same one a moment uses, which wants a Moment.
  const noteMoment = useMemo<Moment>(
    () => ({
      key: sleep.id,
      timestamp: new Date(started).toISOString(),
      loggedBy: sleep.by,
      notes: sleep.notes,
    }),
    [sleep.id, sleep.by, sleep.notes, started],
  );

  const reopen = live ? null : canReopen({ now, sleeps }, sleep);
  const reopenable = reopen?.ok === true;
  // Why there is no Reopen sleep button, said on the card instead of leaving
  // the user to wonder.
  const noReopenHint = reopen && !reopen.ok ? reopenHint(reopen.reason) : null;
  const end = closedAtOf(sleep, now) ?? last.end ?? now;

  return (
    <div
      ref={cardRef}
      data-sleep-card={sleep.id}
      data-state={state}
      aria-busy={busy}
      className={`relative rounded-[12px] border bg-paper-raised p-3 shadow-card ${
        live
          ? "border-night shadow-[0_0_0_1px_var(--color-night),var(--shadow-card)]"
          : "border-line"
      } ${flash ? "row-flash" : ""}`}
    >
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete this sleep"
        className="absolute top-2.5 right-2.5 rounded-md p-1 text-line-strong transition-colors hover:bg-terracotta-soft hover:text-terracotta"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="mb-2.5 flex items-center justify-between gap-2 pr-7">
        <div className="flex items-baseline gap-1.5">
          {dayPrefix && <span className="text-[12.5px] text-ink-soft">{dayPrefix}</span>}
          {live ? (
            <button
              type="button"
              onClick={() => openPicker("start")}
              className="-mx-1 rounded-md px-1 text-[15px] font-bold whitespace-nowrap tabular-nums text-ink hover:bg-paper"
            >
              {zone.fmtTime(started)}
            </button>
          ) : (
            // A finished sleep is read-only: Reopen sleep is the way in.
            <span className="text-[15px] font-bold whitespace-nowrap tabular-nums text-ink">
              {zone.fmtTime(started)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onLoggedByCycle}
          className="flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-1 text-[12px] font-bold text-ink transition-colors hover:bg-paper"
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${color.bg} ${color.text}`}
          >
            {initials(loggedByName)}
          </span>
          {loggedByName}
        </button>
      </div>

      <div className="mb-2.5 flex gap-1.5">
        {/* A sleep card holds only the sleep: the other tiles are there for
            shape, and say so when tapped. */}
        {[FEED_FLAG_STYLES.breast, FEED_FLAG_STYLES.bottle, TYPE_STYLES.poop, TYPE_STYLES.pee].map(
          (style) => (
            <Dim key={style.label}>
              <EditableToggleTile
                style={style}
                checked={false}
                onChange={() =>
                  onNotice("A sleep card only holds the sleep. Tap Log a moment for a feed or nappy.")
                }
              />
            </Dim>
          ),
        )}
        <EditableToggleTile
          style={SLEEP_STYLE}
          checked
          onChange={() =>
            onNotice(live ? "Use Pause Sleep or Stop Sleep below." : "Use Delete sleep below to delete this sleep.")
          }
        />
      </div>

      {state === "asleep" && (
        <div
          className={`relative mb-2.5 rounded-[12px] border-[1.5px] border-night bg-night-soft px-2.5 pt-3.5 pb-2 text-center ${
            pauses > 0 ? WELL_TAPPABLE : ""
          }`}
        >
          <StatusLabel tone="text-night" dot="bg-night" pulse>
            Sleeping
          </StatusLabel>
          <Timer ms={asleep} tone="live" size="big" />
          {/* ink, not ink-soft: grey is 4.29:1 on the sleep tint, under AA. */}
          <div className="flex flex-col items-center text-ink">
            <div className="mt-0.5 text-[14px]">
              Started <b className="text-[15px] tabular-nums text-ink">{zone.fmtTime(started)}</b>
            </div>
            <button type="button" onClick={() => openPicker("start")} className={LINK}>
              Started earlier?
            </button>
          </div>
          {pauses > 0 && (
            <PauseToggle
              count={pauses}
              open={listOpen}
              controls={revealId}
              onToggle={() => setPausesOpen(!listOpen)}
            />
          )}
        </div>
      )}

      {state === "paused" && (
        <div
          className={`relative mb-2.5 rounded-[12px] border-[1.5px] border-line-strong bg-paper px-2.5 pt-3.5 pb-2 text-center ${
            pauses > 0 ? `${WELL_TAPPABLE} hover:bg-[#f3eedf]` : ""
          }`}
        >
          <StatusLabel tone="text-ink-soft" dot="bg-amber" pulse>
            Paused
          </StatusLabel>
          <Timer ms={asleep} tone="paused" size="big" />
          <div className="flex flex-col items-center text-ink-soft">
            <div className="mt-0.5 text-[14px]">
              Awake{" "}
              <b className="text-[15px] tabular-nums text-ink">
                {durationLabel(now - (last.end ?? now))}
              </b>{" "}
              since {zone.fmtTime(last.end ?? now)}
            </div>
            <button type="button" onClick={() => openPicker("end")} className={LINK}>
              Woke earlier?
            </button>
          </div>
          {pauses > 0 && (
            <PauseToggle
              count={pauses}
              open={listOpen}
              controls={revealId}
              onToggle={() => setPausesOpen(!listOpen)}
            />
          )}
        </div>
      )}

      {state === "finished" && (
        <div
          className={`relative mb-2.5 rounded-[12px] border-[1.5px] border-line-strong bg-paper px-2.5 pt-3.5 pb-1.5 text-center ${
            pauses > 0 ? `${WELL_TAPPABLE} hover:bg-[#f3eedf]` : ""
          }`}
        >
          <StatusLabel tone="text-ink-soft" dot="bg-sage">
            Slept
          </StatusLabel>
          <Timer ms={asleep} tone="done" size="done" />
          {/* On its own line, centred; the pause button is on the next. */}
          <div className="flex min-h-[40px] flex-wrap items-center justify-center gap-x-1.5 text-[12.5px] tabular-nums text-ink-soft">
            <b className="px-1 font-bold text-ink">{zone.fmtTime(started)}</b>
            <span className="text-line-strong" aria-hidden="true">
              →
            </span>
            <span className="sr-only">to</span>
            <b className="px-1 font-bold text-ink">{zone.fmtTime(end)}</b>
          </div>
          {pauses > 0 && (
            <PauseToggle
              count={pauses}
              open={listOpen}
              controls={revealId}
              onToggle={() => setPausesOpen(!listOpen)}
            />
          )}
        </div>
      )}

      {pauses > 0 && (
        <Reveal id={revealId} open={listOpen}>
          <PauseList
            headingId={headingId}
            list={pauseList}
            zone={zone}
            canRemove={live}
            needsReopen={!live && reopenable}
            busy={busy}
            error={removeError}
            onRemove={(row, opener) => {
              removeOpener.current = opener;
              setRemoveError(null);
              setRemoving({ index: row.index, rev: sleep.rev });
            }}
          />
        </Reveal>
      )}

      {picker && live && (
        <SleepTimePicker
          // A fresh picker per field, so switching between them starts clean.
          key={picker.field}
          sleep={sleep}
          sleeps={sleeps}
          now={now}
          field={picker.field}
          zone={zone}
          onCancel={() => setPicker(null)}
          onSave={async (input) => {
            const message = await onSetTime(picker.field, input);
            if (!message) setPicker(null);
            return message;
          }}
        />
      )}

      <div className="mb-2.5 flex flex-col gap-2">
        {state === "asleep" && (
          <>
            <button
              type="button"
              onClick={onPause}
              disabled={busy}
              className={`${BUTTON} border-night bg-paper-raised text-night`}
            >
              Pause Sleep
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={busy}
              className={`${BUTTON} ${STOP_BUTTON}`}
            >
              Stop Sleep
            </button>
          </>
        )}
        {state === "paused" && (
          <>
            <button
              type="button"
              onClick={onResume}
              disabled={busy}
              className={`${BUTTON} border-night bg-night text-white`}
            >
              Resume Sleep
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={busy}
              className={`${BUTTON} ${STOP_BUTTON}`}
            >
              Stop Sleep
            </button>
          </>
        )}
        {reopenable && (
          <button
            type="button"
            onClick={onReopen}
            disabled={busy}
            className={`${BUTTON} border-line-strong bg-transparent text-ink`}
          >
            Reopen sleep
          </button>
        )}
        {noReopenHint && (
          <p className="text-center text-[12px] text-ink-soft" data-reopen-hint>
            {noReopenHint}
          </p>
        )}
        {/* Delete sleep (JOS-83): a finished sleep started by mistake can go.
            It removes the sleep, it does not edit it, so the card stays
            read-only otherwise. Below Reopen, which it makes possible again
            for the sleep before this one. */}
        {!live && (
          <button
            type="button"
            data-delete-sleep
            onClick={onDelete}
            disabled={busy}
            className={`${BUTTON} min-h-[44px] border-danger bg-transparent text-danger hover:bg-paper`}
          >
            Delete sleep
          </button>
        )}
      </div>

      <ConfirmDeleteModal
        open={removing !== null && removingRow !== undefined}
        title="Remove this pause?"
        body={removingRow ? removePauseBody(zone, removingRow) : ""}
        confirmLabel="Remove pause"
        onConfirm={() => void confirmRemove()}
        onCancel={() => {
          setRemoving(null);
          removeOpener.current?.focus();
        }}
      />

      <NotesCell
        moment={noteMoment}
        editable
        timeLabel={zone.fmtTime(started)}
        onNotesCommit={(_moment, value) => onNotesCommit(value)}
        size="card"
      />
    </div>
  );
}

// The card on the real clock: the server-corrected "now" redrawn every
// second while the sleep is open, and the device's own time zone.
export function LiveSleepCard(props: Omit<SleepCardProps, "now" | "zone">) {
  const now = useServerNow(props.sleep.closedAt == null ? 1000 : 30_000);
  return <SleepCard {...props} now={now} zone={deviceZone()} />;
}
