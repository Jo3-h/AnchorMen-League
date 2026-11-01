import type { Rule, TeamBill } from '#lib/server/rules.ts';

export function getByPunishment(params: { data: TeamBill[] }) {
	const { data } = params;

	// collect all records by rule
	const keys = ['churn', 'bench', 'loss', 'trade'] as const;
	const result: Record<
		Rule,
		{ totalCents: number; count: number; teams: { team: string; count: number; cents: number }[] }
	> = {
		churn: {
			totalCents: 0,
			count: 0,
			teams: []
		},
		bench: {
			totalCents: 0,
			count: 0,
			teams: []
		},
		loss: {
			totalCents: 0,
			count: 0,
			teams: []
		},
		trade: {
			totalCents: 0,
			count: 0,
			teams: []
		}
	};

	data.forEach((team) => {
		keys.forEach((key) => {
			result[key].count += team.byRule[key].count;
			result[key].totalCents += team.byRule[key].cents;
			result[key].teams.push({ ...team.byRule[key], team: team.teamName });
		});
	});

	const resultList = Object.entries(result).map(([rule, stats]) => ({ rule, stats }));

	return resultList;
}

export type ByPunishment = ReturnType<typeof getByPunishment>[number];
