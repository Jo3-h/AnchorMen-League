<script lang="ts">
	import HeroCourt from '#lib/components/HeroCourt.svelte';
	import StatsStack from '#lib/components/StatsStack.svelte';

	const { data } = $props();
	const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

	const options = ['By Team', 'By Punishment'] as const;
	let selectedOption: (typeof options)[number] = $state(options[0]);
</script>

<svelte:head>
	<title>Anchor Men · EOY KITTY 2026–27</title>
</svelte:head>

<div class="page">
	<section>
		<HeroCourt>
			<div class="masthead">
				<span class="eyebrow">EOY KITTY · 2026–27</span>
				<h1 class="title">Anchor Men</h1>
			</div>
		</HeroCourt>
	</section>

	<section class="pool">
		<span class="label">Total Pot</span>
		<span class="amount">{aud.format(data.pubFund.poolCents / 100)}</span>
	</section>

	<section class="options">
		{#each options as option, i (option)}
			<button
				class="option"
				class:selected={selectedOption === options[i]}
				onclick={() => (selectedOption = options[i])}>{option}</button
			>
		{/each}
	</section>

	<section>
		<StatsStack data={data.pubFund.teams} option={selectedOption} />
	</section>
</div>

<style>
	.page {
		display: grid;
		gap: 0.5rem;
		width: 100%;
		max-width: 30rem;
		margin-inline: auto;
		padding: 1rem;
		background-color: black;
		font-family:
			'Helvetica Neue Condensed Bold', 'Arial', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
		font-weight: 700;
	}

	.options {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;

		button {
			height: 2rem;
			border-radius: 0.5rem;
			border: 1px solid #ccc;
			background: #f9f9f9;
			cursor: pointer;
			transition: background-color 0.3s;
		}

		button.selected {
			background-color: #111827;
			color: white;
		}
	}

	.masthead {
		justify-self: start; /* left-aligned, like a broadcast graphic */
		display: grid;
		gap: 0.25rem;
		padding-inline: 1.25rem;
	}

	.eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #f97316;
	}

	.title {
		margin: 0;
		color: #fff;
		font-size: clamp(1.9rem, 8vw, 2.75rem);
		font-weight: 800;
		font-style: italic;
		line-height: 0.9;
		letter-spacing: -0.02em;
		text-transform: uppercase;
		text-shadow: 0 2px 12px rgb(0 0 0 / 0.5); /* keeps it readable when the ball passes behind */
	}

	.pool {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-radius: 1rem;
		background: var(--navy);
		color: #fff;
	}

	.label {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.6;
	}

	.amount {
		font-size: 2rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
</style>
