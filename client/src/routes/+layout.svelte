<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '../colours.css';
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
	main {
		align-items: center;
		justify-content: center;
		display: flex;
		background-color: black;
	}
</style>
