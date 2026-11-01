<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '../colours.css';
	import '../app.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<main>
	{@render children()}
</main>

<style>
	:global(html) {
		margin: 0;
		min-height: 100%;
		background-color: black;
		/* always show the scrollbar track so toggling content height doesn't shift the centered layout */
		overflow-y: scroll;
	}

	:global(body) {
		margin: 0;
		min-height: 100%;
		background-color: black;
	}

	main {
		align-items: center;
		justify-content: center;
		display: flex;
		background-color: black;
	}
</style>
