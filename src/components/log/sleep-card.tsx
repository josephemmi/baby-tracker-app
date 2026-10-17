"use client";

import { useMemo, useState } from "react";
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
  timerDigits,
  timerSpoken,
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
  onLoggedByCycle: () => void;
  onNotesCommit: (value: string) => void;
  onNotice: (text: string) => void;
}

const LINK =
  "px-[5px] py-[9px] text-[12.5px] font-bold text-night underline decoration-night decoration-dotted underline-offset-[3px]";

const BUTTON =
  "w-full rounded-full border-[1.5px] p-3 text-center text-[14px] font-bold transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

function Dim({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 opacity-[0.42]">{children}</div>;
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
    tone === "live" ? "text-night-deep" : tone === "paused" ? "text-ink-soft" : "text-ink";
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
  const pauseText = pauses === 1 ? "1 pause" : `${pauses} pauses`;

  const [picker, setPicker] = useState<{ field: SleepField; state: SleepState } | null>(null);
  // The subcard goes away when the sleep's state changes under it (the other
  // parent stops it, say), and never opens on a finished sleep.
  if (picker && (state === "finished" || picker.state !== state)) setPicker(null);
  const openPicker = (field: SleepField) =>
    setPicker((cur) => (cur?.field === field ? null : { field, state }));

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

  const reopenable = !live && canReopen({ now, sleeps }, sleep).ok;
  const end = closedAtOf(sleep, now) ?? last.end ?? now;

  return (
    <div
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
            onNotice(live ? "Use Pause Sleep or Stop Sleep below." : "Use × to delete this sleep.")
          }
        />
      </div>

      {state === "asleep" && (
        <div className="mb-2.5 rounded-[12px] border-[1.5px] border-night bg-night-soft px-2.5 pt-3.5 pb-1.5 text-center">
          <div className="flex items-center justify-center gap-[7px] text-[11px] font-extrabold tracking-[0.09em] text-night uppercase">
            <span className="sleep-dot-live h-2 w-2 flex-none rounded-full bg-night" />
            Sleeping
          </div>
          <Timer ms={asleep} tone="live" size="big" />
          <div className="flex min-h-[40px] flex-wrap items-center justify-center gap-x-1.5 text-[12.5px] text-ink-soft">
            <span>
              Started <b className="tabular-nums">{zone.fmtTime(started)}</b>
              {pauses > 0 && ` · ${pauseText}`}
            </span>
            <span className="text-line-strong">·</span>
            <button type="button" onClick={() => openPicker("start")} className={LINK}>
              Started earlier?
            </button>
          </div>
        </div>
      )}

      {state === "paused" && (
        <div className="mb-2.5 rounded-[12px] border-[1.5px] border-line-strong bg-paper px-2.5 pt-3.5 pb-1.5 text-center">
          <div className="flex items-center justify-center gap-[7px] text-[11px] font-extrabold tracking-[0.09em] text-ink-soft uppercase">
            <span className="sleep-dot-live h-2 w-2 flex-none rounded-full bg-amber" />
            Paused
          </div>
          <Timer ms={asleep} tone="paused" size="big" />
          <div className="flex min-h-[40px] flex-wrap items-center justify-center gap-x-1.5 text-[12.5px] text-ink-soft">
            <span>
              Awake <b className="tabular-nums">{durationLabel(now - (last.end ?? now))}</b> since{" "}
              {zone.fmtTime(last.end ?? now)}
            </span>
            <span className="text-line-strong">·</span>
            <button type="button" onClick={() => openPicker("end")} className={LINK}>
              Woke earlier?
            </button>
          </div>
        </div>
      )}

      {state === "finished" && (
        <div className="mb-2.5 rounded-[12px] border-[1.5px] border-line-strong bg-paper px-2.5 pt-3.5 pb-1.5 text-center">
          <div className="flex items-center justify-center gap-[7px] text-[11px] font-extrabold tracking-[0.09em] text-ink-soft uppercase">
            <span className="h-2 w-2 flex-none rounded-full bg-sage" />
            Slept
          </div>
          <Timer ms={asleep} tone="done" size="done" />
          <div className="flex min-h-[40px] flex-wrap items-center justify-center gap-x-1.5 text-[12.5px] text-ink-soft">
            <b className="px-1 py-[9px] text-[12.5px] tabular-nums text-ink">{zone.fmtTime(started)}</b>
            <span className="text-line-strong">→</span>
            <b className="px-1 py-[9px] text-[12.5px] tabular-nums text-ink">{zone.fmtTime(end)}</b>
            {pauses > 0 && <span className="text-line-strong">{pauseText}</span>}
          </div>
        </div>
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

      {(live || reopenable) && (
        <div className="mb-2.5 flex flex-col gap-2">
          {state === "asleep" && (
            <>
              <button
                type="button"
                onClick={onPause}
                disabled={busy}
                className={`${BUTTON} border-night bg-paper-raised text-night-deep`}
              >
                Pause Sleep
              </button>
              <button
                type="button"
                onClick={onStop}
                disabled={busy}
                className={`${BUTTON} border-ink bg-ink text-paper-raised`}
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
                className={`${BUTTON} border-ink bg-ink text-paper-raised`}
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
        </div>
      )}

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
