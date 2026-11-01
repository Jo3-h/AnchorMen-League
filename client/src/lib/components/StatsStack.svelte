<script lang="ts">
	import type { TeamBill } from '#lib/server/rules.ts'; // type-only, so it's safe in a client component
	import { getByPunishment } from '#lib/utils/data.ts';
	import type { ByPunishment } from '#lib/utils/data.ts';
	import PunishmentCard from './PunishmentCard.svelte';
	import TeamCard from './TeamCard.svelte';

	interface Props {
		data: TeamBill[];
		/** How many cards are visible in the stack (the front card included). */
		stack?: number;
		/** Called when a team card is tapped, e.g. to open the breakdown. */
		onselect?: (team: TeamBill) => void;
		option?: 'By Team' | 'By Punishment';
	}
	const { data, stack = 3, onselect, option = 'By Team' }: Props = $props();

	const byPunishment: ByPunishment[] = $derived(getByPunishment({ data }));

	// The stacking maths needs the number of cards actually shown
	const count = $derived(option === 'By Team' ? data.length : byPunishment.length);
</script>

<ul
	class="cards"
	class:by-punishment={option === 'By Punishment'}
	style:--n={count}
	style:--stack={stack}
>
	{#if option === 'By Team'}
		{#each data as team, i (team.teamId)}
			<li class="card" style:--i={i}>
				<button type="button" class="card__content" onclick={() => onselect?.(team)}>
					<TeamCard {team} {i} />
				</button>
			</li>
		{/each}
	{:else}
		{#each byPunishment as punishment, i (punishment.rule)}
			<li class="card" style:--i={i}>
				<div class="card__content">
					<PunishmentCard {punishment} />
				</div>
			</li>
		{/each}
	{/if}
</ul>

<style>
	.cards {
		/* Every card in a stack must be the same height: the timing assumes it */
		--card-h: 8.5rem;
		--gap: 1.25rem; /* space between cards before they stack */
		--peek: 0.7rem; /* how much of each card behind shows above the front one */
		--offset: 1rem; /* distance of the stack from the top of the screen */
		--top: calc(var(--offset) + (var(--stack) - 1) * var(--peek));

		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
		view-timeline: --cards block;
	}

	/* Punishment cards hold a top-3 list, so they need more room */
	.cards.by-punishment {
		--card-h: 13rem;
	}

	.card {
		height: var(--card-h);
		padding-bottom: var(--gap);
		box-sizing: content-box;
	}

	.card__content {
		/* reset button styles; a plain block so the card inside fills it exactly */
		all: unset;
		display: block;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		transform-origin: 50% 0;
	}

	button.card__content {
		cursor: pointer;
	}

	/* The card itself fills the slot, whatever its own content */
	.card__content > :global(*) {
		box-sizing: border-box;
		width: 100%;
		height: 100%;
	}

	.card__content:focus-visible {
		outline: 2px solid #f97316;
		outline-offset: 2px;
		border-radius: 0.75rem;
	}

	/*
	 * Stacking. Card i sticks at the top, then each card that slides over it
	 * pushes it one step back: smaller and shifted up so its top edge peeks out.
	 * After `stack - 1` cards are on top of it, it fades out over the next one.
	 * All ranges are measured in "cards scrolled": card k sticks after k cards'
	 * worth of scrolling, which is k/n of the list's height.
	 */
	@media (prefers-reduced-motion: no-preference) {
		@supports (animation-timeline: view()) {
			.card {
				position: sticky;
				top: var(--top);
			}

			.card__content {
				animation:
					recede linear both,
					fade linear both;
				animation-timeline: --cards, --cards;
				animation-range:
					exit-crossing calc(var(--i) / var(--n) * 100% - var(--top)) exit-crossing
						calc((var(--i) + var(--stack)) / var(--n) * 100% - var(--top)),
					exit-crossing calc((var(--i) + var(--stack) - 1) / var(--n) * 100% - var(--top))
						exit-crossing calc((var(--i) + var(--stack)) / var(--n) * 100% - var(--top));
			}
		}
	}

	@keyframes recede {
		to {
			scale: calc(1 - var(--stack) * 0.05);
			translate: 0 calc(var(--stack) * var(--peek) * -1);
		}
	}

	@keyframes fade {
		to {
			opacity: 0;
		}
	}
</style>
