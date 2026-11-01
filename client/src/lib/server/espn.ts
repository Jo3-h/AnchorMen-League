// src/lib/server/espn.ts
// ESPN Fantasy Basketball client with an in-memory cache.
//
// - Live data (standings, today's roster) is cached for 15 minutes.
// - Finished days and weeks never change, so they are cached for good.
// - Simultaneous requests for the same thing share one ESPN call.
// - If ESPN fails, the last good copy is served instead of an error.
// - Day rosters are trimmed to the fields we use before caching, so
//   a full season stays small in memory.

import { LEAGUE_ID } from '$app/env/private'; // SvelteKit's private env module
import { ESPN_BASE_API_URL } from '#lib/constants/espn.ts'; // e.g. 'https://lm-api-reads.fantasy.espn.com/apis/v3/'
import { getCurrentFantasyYear } from './utils';

// ---- Cache --------------------------------------------------------------------

const MINUTE = 60_000;
const LIVE_TTL = 15 * MINUTE;
const FOREVER = Infinity;

type Entry = { data: unknown; expiresAt: number };
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Fetch JSON with caching.
 * `select` trims the raw response before it is stored, so only what you need stays in memory.
 */
async function cachedFetch<Raw, Out = Raw>(opts: {
	key: string;
	url: string;
	ttl: number;
	headers?: Record<string, string>;
	select?: (raw: Raw) => Out;
}): Promise<Out> {
	const { key, url, ttl, headers, select } = opts;

	const hit = cache.get(key);
	if (hit && hit.expiresAt > Date.now()) return hit.data as Out;

	const pending = inFlight.get(key);
	if (pending) return pending as Promise<Out>;

	const request = (async () => {
		try {
			const res = await fetch(url, {
				headers: { Accept: 'application/json', ...headers },
				signal: AbortSignal.timeout(10_000)
			});
			if (!res.ok) throw new Error(`ESPN ${res.status} ${res.statusText} (${key})`);

			const raw = (await res.json()) as Raw;
			const data = select ? select(raw) : (raw as unknown as Out);
			cache.set(key, { data, expiresAt: Date.now() + ttl });
			return data;
		} catch (err) {
			if (hit) {
				console.warn(`[espn] ${key} failed, serving stale copy`, err);
				return hit.data as Out;
			}
			throw err;
		} finally {
			inFlight.delete(key);
		}
	})();

	inFlight.set(key, request);
	return request;
}

/** Drop everything, e.g. from an admin "refresh" endpoint. */
export function clearEspnCache() {
	cache.clear();
}

function leagueUrl(year: number, query: string) {
	return `${ESPN_BASE_API_URL}games/fba/seasons/${year}/segments/0/leagues/${LEAGUE_ID}?${query}`;
}

// ---- League: standings, records, transaction counts, schedule ------------------

export interface League {
	status: {
		latestScoringPeriod: number; // today's day number
		currentMatchupPeriod: number; // this week's number
	};
	teams: Array<{
		id: number;
		name: string;
		abbrev: string;
		logo?: string;
		primaryOwner?: string;
		transactionCounter?: { acquisitions?: number; trades?: number };
		record?: { overall?: { wins: number; losses: number; ties: number } };
	}>;
	members: Array<{ id: string; firstName?: string; lastName?: string; displayName?: string }>;
	schedule: Array<{
		matchupPeriodId: number;
		home: { teamId: number; totalPoints: number };
		away?: { teamId: number; totalPoints: number };
	}>;
}

export function getLeague(params: { year?: number } = {}) {
	const { year = getCurrentFantasyYear() } = params;
	return cachedFetch<League>({
		key: `league:${year}`,
		url: leagueUrl(year, 'view=mTeam&view=mStandings'),
		ttl: LIVE_TTL
	});
}

// ---- One day's rosters (who started, who sat, who scored) ----------------------

export interface DayPlayer {
	id: number;
	name: string;
	slot: number; // lineupSlotId: check bench/IR ids against your league (12 / 13 in basketball)
	eligibleSlots: number[];
	points: number | null; // null = no game that day
}

export interface DayRoster {
	day: number;
	teams: Array<{ teamId: number; players: DayPlayer[] }>;
}

interface RawRoster {
	teams?: Array<{
		id: number;
		roster?: {
			entries?: Array<{
				playerId: number;
				lineupSlotId: number;
				playerPoolEntry?: {
					player?: {
						fullName?: string;
						eligibleSlots?: number[];
						stats?: Array<{ scoringPeriodId: number; statSourceId: number; appliedTotal: number }>;
					};
				};
			}>;
		};
	}>;
}

export async function getDayRoster(params: { day: number; year?: number }): Promise<DayRoster> {
	const { day, year = getCurrentFantasyYear() } = params;
	const league = await getLeague({ year });
	const finished = day < league.status.latestScoringPeriod;

	return cachedFetch<RawRoster, DayRoster>({
		key: `roster:${year}:${day}`,
		url: leagueUrl(year, `view=mRoster&scoringPeriodId=${day}`),
		ttl: finished ? FOREVER : LIVE_TTL,
		select: (raw) => ({
			day,
			teams: (raw.teams ?? []).map((t) => ({
				teamId: t.id,
				players: (t.roster?.entries ?? []).map((e) => {
					const p = e.playerPoolEntry?.player;
					const actual = p?.stats?.find((s) => s.scoringPeriodId === day && s.statSourceId === 0);
					return {
						id: e.playerId,
						name: p?.fullName ?? 'Unknown',
						slot: e.lineupSlotId,
						eligibleSlots: p?.eligibleSlots ?? [],
						points: actual ? actual.appliedTotal : null
					};
				})
			}))
		})
	});
}

/** Every finished day this season, 4 requests at a time. Cached days cost nothing. */
export async function getFinishedDayRosters(params: { year?: number } = {}) {
	const { year = getCurrentFantasyYear() } = params;
	const league = await getLeague({ year });
	const days = Array.from({ length: league.status.latestScoringPeriod - 1 }, (_, i) => i + 1);
	return mapLimit(days, 4, (day) => getDayRoster({ day, year }));
}

// ---- One week's matchup box scores ---------------------------------------------

export async function getMatchup(params: { week: number; year?: number }) {
	const { week, year = getCurrentFantasyYear() } = params;
	const league = await getLeague({ year });
	const finished = week < league.status.currentMatchupPeriod;

	return cachedFetch<{ schedule?: unknown[] }>({
		key: `matchup:${year}:${week}`,
		url: leagueUrl(year, 'view=mMatchupScore&view=mScoreboard'),
		headers: {
			'X-Fantasy-Filter': JSON.stringify({
				schedule: { filterMatchupPeriodIds: { value: [week] } }
			})
		},
		ttl: finished ? FOREVER : LIVE_TTL
	});
}

// ---- Helpers ----------------------------------------------------------------------

async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const out = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	});
	await Promise.all(workers);
	return out;
}
