<script lang="ts">
	import type { Rule } from '#lib/server/rules.ts';
	import type { ByPunishment } from '#lib/utils/data.ts';

	interface Props {
		punishment: ByPunishment;
	}

	const { punishment }: Props = $props();

	const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

	// Display copy for each rule: title, what one unit is called, and its rate
	const RULE_INFO: Record<Rule, { title: string; unit: [string, string]; rate: string }> = {
		churn: { title: 'Churn Tax', unit: ['pickup', 'pickups'], rate: '$1.50 per pickup' },
		loss: { title: 'Sobriety Fee', unit: ['loss', 'losses'], rate: '$3.00 per loss' },
		trade: { title: 'Dealmaker Credit', unit: ['trade', 'trades'], rate: '-$2.00 per trade' },
		bench: { title: 'Bench Blunder', unit: ['blunder', 'blunders'], rate: '$1.00 per blunder' }
	};

	const info = $derived(RULE_INFO[punishment.rule as Rule]);
	const plural = (n: number) => (n === 1 ? info.unit[0] : info.unit[1]);

	// Top 3 by size: biggest fines first, or biggest credits first for trades.
	// Teams with nothing for this rule are left out.
	const topTeams = $derived(
		[...punishment.stats.teams]
			.filter((t) => t.count > 0)
			.sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents) || b.count - a.count)
			.slice(0, 3)
	);
</script>

<div class="punishment-card">
	<div class="summary">
		<div class="names">
			<span class="title">{info.title.toUpperCase()}</span>
			<span class="rate">{info.rate}</span>
		</div>
		<div class="owing">
			<span class="label"
				>{punishment.stats.count} {plural(punishment.stats.count).toUpperCase()}</span
			>
			<span class="amount" class:credit={punishment.stats.totalCents < 0}>
				{aud.format(punishment.stats.totalCents / 100)}
			</span>
		</div>
	</div>

	<hr />

	{#if topTeams.length === 0}
		<p class="empty">Nobody yet</p>
	{:else}
		<ol class="leaders">
			{#each topTeams as t, i (t.team)}
				<li>
					<span class="rank" class:gold={i === 0} class:silver={i === 1} class:bronze={i === 2}>
						0{i + 1}
					</span>
					<span class="team-name">{t.team.toUpperCase()}</span>
					<span class="count">{t.count} {plural(t.count).toUpperCase()}</span>
					<span class="cents" class:credit={t.cents < 0}>{aud.format(t.cents / 100)}</span>
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.punishment-card {
		min-height: 6rem;
		box-sizing: border-box;
		width: 100%;
		background-color: var(--navy);
		border: 1px solid var(--light-navy);
		border-radius: 0.75rem;
		padding: 1rem;
		display: grid;
		gap: 0.25rem;
		font-family:
			'Helvetica Neue Condensed Bold', 'Arial', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
		font-weight: 700;
		color: white;
	}

	.summary {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		gap: 1rem;
	}

	.names {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;

		.title {
			font-size: 1.5rem;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.rate {
			font-size: 1rem;
			color: rgb(187, 187, 187);
		}
	}

	.owing {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		text-align: end;

		.label {
			font-size: 0.8rem;
			color: grey;
		}

		.amount {
			font-size: 1.85rem;
			font-variant-numeric: tabular-nums;
		}
	}

	hr {
		width: 100%;
		height: 1px;
		margin: 0.5rem 0;
		border: none;
		background-color: var(--light-navy);
	}

	.leaders {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;

		li {
			display: grid;
			/* rank | team | count | amount */
			grid-template-columns: 2.25rem minmax(0, 1fr) auto 4.5rem;
			align-items: baseline;
			gap: 0.75rem;
		}
	}

	.rank {
		font-size: 1.4rem;
		line-height: 1;
		color: #64708c;

		&.gold {
			color: gold;
		}
		&.silver {
			color: silver;
		}
		&.bronze {
			color: #cd7f32;
		}
	}

	.team-name {
		font-size: 1.05rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.count {
		font-size: 0.8rem;
		color: grey;
	}

	.cents {
		font-size: 1.05rem;
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	/* Credits (trades) read as money back */
	.credit {
		color: #4ade80;
	}

	.empty {
		margin: 0;
		font-size: 0.9rem;
		color: grey;
	}
</style>
