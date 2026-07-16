import { Budget, periodBounds, UsageRecord } from "./store";

export type PaceState = "neutral" | "green" | "amber" | "red";

export interface PaceReading {
  spend: number;
  budget: number | null;
  projected: number | null;
  state: PaceState;
}

function projectSpend(spendSoFar: number, elapsedFraction: number): number | null {
  if (elapsedFraction <= 0) return null;
  return spendSoFar / elapsedFraction;
}

function stateFor(spend: number, budget: number | null, projected: number | null): PaceState {
  if (budget === null || budget <= 0) return "neutral";
  if (spend >= budget) return "red";
  if (projected !== null) {
    const ratio = projected / budget;
    if (ratio > 1.25) return "red";
    if (ratio >= 1.0) return "amber";
  }
  return "green";
}

// Projection is simple linear extrapolation of period-to-date spend (v1;
// weekday-aware/EWMA models are P2 - PRD Q3 leaves the 100/125% thresholds
// open to pilot validation too).
export function computePace(records: UsageRecord[], budget: Budget, now: Date): { daily: PaceReading; monthly: PaceReading } {
  const { dayStart, monthStart } = periodBounds(now, budget.periodStartDay);

  const daySpend = records
    .filter((r) => new Date(r.timestamp) >= dayStart)
    .reduce((sum, r) => sum + r.costUsd, 0);
  const monthSpend = records
    .filter((r) => new Date(r.timestamp) >= monthStart)
    .reduce((sum, r) => sum + r.costUsd, 0);

  const dayElapsed = (now.getTime() - dayStart.getTime()) / 86_400_000;
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, monthStart.getDate());
  const monthTotalMs = monthEnd.getTime() - monthStart.getTime();
  const monthElapsed = (now.getTime() - monthStart.getTime()) / monthTotalMs;

  const dayProjected = projectSpend(daySpend, dayElapsed);
  const monthProjected = projectSpend(monthSpend, monthElapsed);

  return {
    daily: {
      spend: daySpend,
      budget: budget.dailyUsd,
      projected: dayProjected,
      state: stateFor(daySpend, budget.dailyUsd, dayProjected),
    },
    monthly: {
      spend: monthSpend,
      budget: budget.monthlyUsd,
      projected: monthProjected,
      state: stateFor(monthSpend, budget.monthlyUsd, monthProjected),
    },
  };
}

// Worse of the two states wins so the ambient cue never under-warns.
const SEVERITY: Record<PaceState, number> = { neutral: 0, green: 1, amber: 2, red: 3 };
export function worstState(a: PaceState, b: PaceState): PaceState {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}
