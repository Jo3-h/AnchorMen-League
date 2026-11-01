// src/lib/server/pub-fund.ts
// Turns ESPN data into what each manager owes.
//
//   ESPN data (espn.ts)  ->  charges (one line per fine/credit)  ->  team totals + leaderboard
//
// Every fine is a Charge with a reason, so the leaderboard, the per-team
// breakdown and any "how did I get fined $X?" question all come from one list.
// All rules are plain functions with no fetching, so they're easy to test
// against saved JSON.

import type { League, DayRoster } from './espn';

// ---- Config ----------------------------------------------------------------------

export const RULES = {
	churnCents: 150, // per free-agent / waiver pickup
	lossCents: 300, // per head-to-head loss
	tradeCents: -200, // per completed trade (a credit)
	benchCents: 100, // per "bench blunder"
	benchSlot: 12, // lineupSlotId for the bench: check against your data
	irSlot: 13 // lineupSlotId for IR: never counts as benched
};

export type Rule = 'churn' | 'loss' | 'trade' | 'bench';

export const RULE_LABELS: Record<Rule, string> = {
	churn: 'Churn Tax',
	loss: 'Sobriety Fee',
	trade: 'Dealmaker Credit',
	bench: 'Bench Blunder'
};

// ---- Output shapes ---------------------------------------------------------------

/** One line on a manager's bill. */
export interface Charge {
	teamId: number;
	rule: Rule;
	amountCents: number; // negative = credit
	qty: number; // how many pickups / losses / trades / blunders this line covers
	week?: number;
	day?: number;
	detail: string; // human-readable reason, shown in the breakdown
}

export interface TeamBill {
	rank: number;
	teamId: number;
	teamName: string;
	ownerName: string;
	logo?: string;
	totalCents: number;
	byRule: Record<Rule, { count: number; cents: number }>;
	charges: Charge[]; // newest first
}

export interface PubFund {
	generatedAt: string;
	poolCents: number;
	teams: TeamBill[]; // sorted: owes the most first
}

// ---- Rules -------------------------------------------------------------------------

/** Churn Tax: one charge per pickup, grouped by week where ESPN gives the split. */
export function churnCharges(league: League): Charge[] {
	return league.teams.flatMap((team) => {
		const counter = team.transactionCounter as
			{ acquisitions?: number; matchupAcquisitionTotals?: Record<string, number> } | undefined;
		const byWeek = counter?.matchupAcquisitionTotals ?? {};
		const weeks = Object.entries(byWeek);

		// Fall back to the season total if the per-week split is missing
		if (weeks.length === 0) {
			const n = counter?.acquisitions ?? 0;
			return n > 0
				? [
						{
							teamId: team.id,
							rule: 'churn' as const,
							amountCents: n * RULES.churnCents,
							qty: n,
							detail: `${n} pickups`
						}
					]
				: [];
		}

		return weeks
			.filter(([, n]) => n > 0)
			.map(([week, n]) => ({
				teamId: team.id,
				rule: 'churn' as const,
				amountCents: n * RULES.churnCents,
				qty: n,
				week: Number(week),
				detail: `${n} pickup${n === 1 ? '' : 's'} in week ${week}`
			}));
	});
}

/** Sobriety Fee: one charge per lost matchup, with the score. Only finished weeks count. */
export function lossCharges(league: League): Charge[] {
	const names = teamNames(league);
	const current = league.status.currentMatchupPeriod;

	return league.schedule.flatMap((m) => {
		if (!m.away || m.matchupPeriodId >= current) return []; // bye or not finished
		const { home, away } = m;
		if (home.totalPoints === away.totalPoints) return []; // tie: nobody pays

		const [winner, loser] = home.totalPoints > away.totalPoints ? [home, away] : [away, home];
		return [
			{
				teamId: loser.teamId,
				rule: 'loss' as const,
				amountCents: RULES.lossCents,
				qty: 1,
				week: m.matchupPeriodId,
				detail: `Lost to ${names.get(winner.teamId)} ${loser.totalPoints}–${winner.totalPoints} in week ${m.matchupPeriodId}`
			}
		];
	});
}

/** Dealmaker Credit: ESPN only gives a count, so one line per team. */
export function tradeCharges(league: League): Charge[] {
	return league.teams.flatMap((team) => {
		const n = team.transactionCounter?.trades ?? 0;
		return n > 0
			? [
					{
						teamId: team.id,
						rule: 'trade' as const,
						amountCents: n * RULES.tradeCents,
						qty: n,
						detail: `${n} completed trade${n === 1 ? '' : 's'}`
					}
				]
			: [];
	});
}

/**
 * Bench Blunder: a benched player outscored a starter he could have replaced.
 * For each team and finished day, bench players are checked best-first against
 * the lowest-scoring starter in a slot they were eligible for. A starter with no
 * game counts as 0. Each starter can only be "blamed" once per day.
 */
export function benchCharges(days: DayRoster[]): Charge[] {
	const charges: Charge[] = [];

	for (const { day, teams } of days) {
		for (const { teamId, players } of teams) {
			const starters = players
				.filter((p) => p.slot !== RULES.benchSlot && p.slot !== RULES.irSlot)
				.map((p) => ({ ...p, pts: p.points ?? 0, used: false }));

			const bench = players
				.filter((p) => p.slot === RULES.benchSlot && (p.points ?? 0) > 0)
				.sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

			for (const b of bench) {
				const benchPts = b.points ?? 0;
				const swap = starters
					.filter((s) => !s.used && b.eligibleSlots.includes(s.slot) && s.pts < benchPts)
					.sort((x, y) => x.pts - y.pts)[0];
				if (!swap) continue;

				swap.used = true;
				charges.push({
					teamId,
					rule: 'bench',
					amountCents: RULES.benchCents,
					qty: 1,
					day,
					detail: `Benched ${b.name} (${benchPts}) over ${swap.name} (${swap.pts}) on day ${day}`
				});
			}
		}
	}

	return charges;
}

// ---- Totals and leaderboard --------------------------------------------------------

export function buildPubFund(league: League, days: DayRoster[] = []): PubFund {
	const charges = [
		...churnCharges(league),
		...lossCharges(league),
		...tradeCharges(league),
		...benchCharges(days)
	];

	const names = teamNames(league);
	const owners = new Map(league.members.map((m) => [m.id, m]));

	const bills: TeamBill[] = league.teams.map((team) => {
		const mine = charges
			.filter((c) => c.teamId === team.id)
			.sort((a, b) => (b.day ?? (b.week ?? 0) * 7) - (a.day ?? (a.week ?? 0) * 7));

		const byRule = { churn: zero(), loss: zero(), trade: zero(), bench: zero() };
		for (const c of mine) {
			byRule[c.rule].count += c.qty;
			byRule[c.rule].cents += c.amountCents;
		}

		const owner = owners.get(team.primaryOwner ?? '');
		return {
			rank: 0,
			teamId: team.id,
			teamName: names.get(team.id) ?? `Team ${team.id}`,
			ownerName: owner
				? [owner.firstName, owner.lastName].filter(Boolean).join(' ') ||
					owner.displayName ||
					'Unknown'
				: 'Unknown',
			logo: team.logo,
			totalCents: mine.reduce((sum, c) => sum + c.amountCents, 0),
			byRule,
			charges: mine
		};
	});

	bills.sort((a, b) => b.totalCents - a.totalCents || a.teamName.localeCompare(b.teamName));
	bills.forEach((b, i) => (b.rank = i + 1));

	return {
		generatedAt: new Date().toISOString(),
		poolCents: bills.reduce((sum, b) => sum + b.totalCents, 0),
		teams: bills
	};
}

/** 1250 -> "$12.50", -400 -> "-$4.00" */
export function formatCents(cents: number) {
	return `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function teamNames(league: League) {
	return new Map(league.teams.map((t) => [t.id, t.name]));
}

function zero() {
	return { count: 0, cents: 0 };
}
