import { EYEBROW } from "@/components/reports/sleep-report-parts";
import type { Day, Summary } from "@/lib/sleep-reports";
import { averageCards, averagesNote, type StatCardModel } from "@/lib/sleep-report-view";

function Label({ card }: { card: StatCardModel }) {
  if (!card.keepTogether) return <>{card.label}</>;
  // "wake-up" must not break across two lines at its hyphen.
  const [before, after] = card.label.split(card.keepTogether);
  return (
    <>
      {before}
      <span className="whitespace-nowrap">{card.keepTogether}</span>
      {after}
    </>
  );
}

// The averages (JOS-83): a heading that names the complete days they cover,
// then nine cards. Each is an average over those days, said on the card, except
// the one maximum, "Longest unbroken sleep". The night is shown as part of the
// daily total, never beside it as if it were another period.
export function SleepStatCards({ days, summary }: { days: Day[]; summary: Summary }) {
  const cards = averageCards(summary);
  return (
    <section aria-labelledby="sleep-averages-h" className="flex flex-col gap-4" data-card="averages">
      <div className="-mb-1 flex flex-col gap-0.5">
        <h3 id="sleep-averages-h" className={EYEBROW}>
          Averages
        </h3>
        <p className="text-xs text-ink-soft" data-avg-period>
          {averagesNote(days, summary)}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`min-w-0 rounded-[10px] border border-line bg-paper-raised p-4 shadow-card max-[340px]:px-3 max-[340px]:py-3.5 ${
              c.wide ? "col-span-2" : ""
            }`}
          >
            <p className={EYEBROW}>
              <Label card={c} />
            </p>
            <p className="text-2xl font-bold whitespace-nowrap tabular-nums text-night max-[340px]:text-[21px]">
              {c.value}
            </p>
            {c.sub && <p className="mt-0.5 text-xs text-ink-soft">{c.sub}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-soft">A night counts on the day he woke.</p>
    </section>
  );
}
