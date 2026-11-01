<script lang="ts">
	import type { TeamBill } from '#lib/server/rules.ts';

	interface Props {
		team: TeamBill;
		i: number;
	}
	const { team, i }: Props = $props();
	const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

	const values = $derived([
		{
			label: 'pickups',
			value: team.byRule['churn'].count
		},
		{
			label: 'losses',
			value: team.byRule['loss'].count
		},
		{
			label: 'trades',
			value: team.byRule['trade'].count
		},
		{
			label: 'benched',
			value: team.byRule['bench'].count
		}
	]);
</script>

<div class="team-card">
	<div class="team-summary">
		<span class:gold={i === 0} class:silver={i === 1} class:bronze={i === 2}>0{i + 1}</span>
		<!--
            <img src={team.logo} alt="{team.teamName} logo" />
            -->
		<div class="names">
			<span class="team-name">{team.teamName.toUpperCase()}</span>
			<span class="owner">{team.ownerName}</span>
		</div>
		<div class="owing">
			<span class="label">OWES</span>
			<span class="amount">{aud.format(team.totalCents / 100)}</span>
		</div>
	</div>
	<hr />
	<div class="values">
		{#each values as { label, value }}
			<span>
				<span class="label">{label.toUpperCase()}</span>
				<span class="amount">{value}</span>
			</span>
		{/each}
	</div>
</div>

<style>
	.team-card {
		min-height: 6rem;
		box-sizing: border-box;
		width: 100%;
		background-color: var(--navy);
		border: 1px solid var(--light-navy);
		border-radius: 0.75rem;
		padding: 1rem;
		display: grid;
		grid-template-rows: 2fr auto auto;
		grid-template-columns: 1fr;
		font-family:
			'Helvetica Neue Condensed Bold', 'Arial', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
		font-weight: 700;
	}

	.team-summary {
		display: grid;
		grid-template-columns: auto auto 2fr auto;
		gap: 1rem;
		/* fixed so the rank number can size off it without a feedback loop */
		height: 3.5rem;
		container-type: size;

		span {
			color: #64708c;
			/* fills the row height instead of a flat 2rem */
			font-size: 80cqh;
			line-height: 1;

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

		.names {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
			/* without this, the grid item refuses to shrink below the team name's full width */
			min-width: 0;

			.team-name {
				font-size: 1.5rem;
				color: white;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.owner {
				font-size: 1.2rem;
				color: rgb(187, 187, 187);
			}
		}

		.owing {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;

			.label {
				font-size: 0.8rem;
				text-align: end;
				color: grey;
			}

			.amount {
				font-size: 1.85rem;
				text-align: end;
				color: white;
			}
		}
	}

	.values {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;

		* {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
		}

		.label {
			color: grey;
		}

		.amount {
			color: white;
		}
	}

	hr {
		width: 100%;
		height: 1px;
		border: none;
		background-color: var(--light-navy);
	}
</style>
