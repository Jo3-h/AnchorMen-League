import { getFinishedDayRosters, getLeague } from '#lib/server/espn.ts';
import { buildPubFund } from '#lib/server/rules.ts';
import type { PageServerLoadEvent } from './$types';
import { writeFile } from 'node:fs/promises';

export async function load() {
	const [league, days] = await Promise.all([getLeague(), getFinishedDayRosters()]);
	const data = { pubFund: buildPubFund(league, days) };
	return data;
}
