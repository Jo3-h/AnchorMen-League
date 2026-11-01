<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Tap/click kicks the ball away from where you tapped. */
		interactive?: boolean;
		/** Bar height (any CSS length). */
		height?: string;
		/** Ball diameter as a fraction of the bar height. */
		ballScale?: number;
		/** Overall speed multiplier (1 = default). */
		speed?: number;
		/** Freeze the ball (e.g. once the app has loaded). */
		paused?: boolean;
		/** Content layered on top, e.g. the app title. */
		children?: Snippet;
		class?: string;
		style?: string;
	}
	const {
		interactive = true,
		height = 'clamp(5rem, 14vw, 8rem)',
		ballScale = 0.42,
		speed = 1,
		paused = false,
		children,
		class: className = '',
		style = ''
	}: Props = $props();

	let box: HTMLDivElement;
	let ballEl: HTMLDivElement;
	let squashEl: HTMLDivElement;
	let spinEl: SVGGElement;
	let shadowEl: HTMLDivElement;

	let ready = $state(false);

	// ---- Physics state (plain variables: written straight to the DOM each frame) ----
	const FLOOR_INSET = 6; // px between the floor line and the bottom edge
	let W = 0;
	let H = 0;
	let d = 48; // ball diameter in px
	let floorY = 0;
	let px = 0; // ball top-left
	let py = 0;
	let vx = 0;
	let vy = 0;
	let angle = 0;
	let g = 0; // gravity
	let v0 = 0; // floor bounce speed that keeps a steady bounce height
	let cruise = 0; // resting horizontal speed
	let started = false;

	type Side = 'bottom' | 'top' | 'left' | 'right';
	let impact = { t: -1e9, axis: 'y' as 'x' | 'y', amt: 0 };
	const ORIGIN: Record<Side, string> = {
		bottom: '50% 100%',
		top: '50% 0',
		left: '0 50%',
		right: '100% 50%'
	};

	let raf = 0;
	let last = 0;
	let pop: Animation | null = null;

	const reducedMotion = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

	function measure() {
		const r = box.getBoundingClientRect();
		W = r.width;
		H = r.height;
		d = clamp(H * ballScale, 24, 140);
		floorY = H - FLOOR_INSET;
		ballEl.style.width = ballEl.style.height = `${d}px`;
		shadowEl.style.width = `${d * 0.9}px`;
		shadowEl.style.height = `${d * 0.14}px`;

		const h = Math.max(1, floorY - d); // free vertical travel
		g = 6.6 * h * speed * speed; // roughly a 1.1 s bounce at speed 1
		v0 = Math.sqrt(2 * g * h);
		cruise = Math.max(40, W * 0.09) * speed;

		if (!started) {
			started = true;
			px = W * 0.7 - d / 2;
			py = reducedMotion() ? h : 0; // drops in from the top
			vx = -cruise;
			vy = 0;
		}
		px = clamp(px, 0, Math.max(0, W - d));
		py = clamp(py, 0, h);
		ready = true;
	}

	function hit(side: Side, v: number, now: number) {
		const axis = side === 'left' || side === 'right' ? 'x' : 'y';
		const ref = axis === 'y' ? v0 : cruise * 3;
		const amt = Math.min(0.2, (Math.abs(v) / (ref || 1)) * 0.13);
		if (amt < 0.02) return;
		impact = { t: now, axis, amt };
		squashEl.style.transformOrigin = ORIGIN[side];
	}

	function step(dt: number, now: number) {
		vy += g * dt;
		// Ease horizontal speed back to cruising after a kick
		const dir = vx < 0 ? -1 : 1;
		vx += (dir * cruise - vx) * Math.min(1, dt * 0.9);

		px += vx * dt;
		py += vy * dt;

		const maxX = Math.max(0, W - d);
		const maxY = Math.max(0, floorY - d);

		if (py >= maxY) {
			py = maxY;
			hit('bottom', vy, now);
			// Blend toward v0 so the bounce height settles back after kicks
			vy = -(Math.abs(vy) * 0.8 + v0 * 0.2);
		} else if (py <= 0) {
			py = 0;
			hit('top', vy, now);
			vy = Math.abs(vy) * 0.7;
		}
		if (px <= 0) {
			px = 0;
			hit('left', vx, now);
			vx = Math.abs(vx);
		} else if (px >= maxX) {
			px = maxX;
			hit('right', vx, now);
			vx = -Math.abs(vx);
		}

		angle += (vx * dt) / (d / 2); // roll with horizontal motion
	}

	function render(now: number) {
		ballEl.style.transform = `translate3d(${px}px, ${py}px, 0)`;

		const k = (now - impact.t) / 260;
		let sx = 1;
		let sy = 1;
		if (k >= 0 && k < 1) {
			// Squash, a small rebound stretch, settle
			const a = impact.amt * (1 - k) * (1 - k) * Math.cos(k * Math.PI * 2);
			if (impact.axis === 'y') {
				sx = 1 + a;
				sy = 1 - a;
			} else {
				sx = 1 - a;
				sy = 1 + a;
			}
		}
		squashEl.style.transform = `scale(${sx}, ${sy})`;
		spinEl.style.transform = `rotate(${angle}rad)`;

		// Shadow on the floor line: tighter and darker as the ball comes down
		const f = 0.4 + 0.6 * (py / Math.max(1, floorY - d));
		shadowEl.style.transform = `translate3d(${px + d / 2}px, 0, 0) translate(-50%, 0) scale(${f}, 1)`;
		shadowEl.style.opacity = String(0.55 * f);
	}

	function tick(now: number) {
		const dt = Math.min(0.033, (now - last) / 1000); // no jumps after a tab switch
		last = now;
		step(dt, now);
		render(now);
		raf = requestAnimationFrame(tick);
	}

	function onPointerDown(e: PointerEvent) {
		if (!interactive || !e.isPrimary) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		// No preventDefault: page scrolling keeps working

		if (!raf) {
			// Reduced motion or paused: just a small pop
			pop?.cancel();
			pop = squashEl.animate(
				[{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
				{ duration: 220, easing: 'ease-out' }
			);
			return;
		}

		// Kick the ball away from the tap. Velocities are clamped, so rapid taps never pile up.
		const r = box.getBoundingClientRect();
		const tx = e.clientX - r.left;
		const ty = e.clientY - r.top;
		let dx = px + d / 2 - tx;
		let dy = py + d / 2 - ty;
		const len = Math.hypot(dx, dy);
		if (len < d * 0.6) {
			// Tapped the ball itself: pop it straight up
			dx = vx < 0 ? -0.3 : 0.3;
			dy = -1;
		} else {
			dx /= len;
			dy /= len;
		}
		vx = clamp(vx + dx * Math.max(300, W * 0.6), -W * 1.5, W * 1.5);
		vy = clamp(vy + dy * v0 * 1.1 - v0 * 0.5, -v0 * 1.8, v0 * 1.8);

		impact = { t: performance.now(), axis: 'y', amt: 0.12 };
		squashEl.style.transformOrigin = '50% 50%';
	}

	$effect(() => {
		const isPaused = paused; // re-run when the prop changes
		const reduce = matchMedia('(prefers-reduced-motion: reduce)');
		let visible = true;

		const sync = () => {
			const run = visible && !reduce.matches && !isPaused;
			if (run && !raf) {
				last = performance.now();
				raf = requestAnimationFrame(tick);
			} else if (!run && raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
		};

		const ro = new ResizeObserver(() => {
			measure();
			render(performance.now());
		});
		ro.observe(box);

		// Stop the loop while the bar is scrolled off screen
		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			sync();
		});
		io.observe(box);

		reduce.addEventListener('change', sync);
		sync();

		return () => {
			ro.disconnect();
			io.disconnect();
			reduce.removeEventListener('change', sync);
			cancelAnimationFrame(raf);
			raf = 0;
			pop?.cancel();
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={box}
	class="hero-bar {className}"
	class:interactive
	class:ready
	{style}
	style:--h={height}
	onpointerdown={onPointerDown}
>
	<!-- Top-down court lines, cropped to the middle of the court -->
	<svg
		class="court"
		viewBox="0 0 94 50"
		preserveAspectRatio="xMidYMid slice"
		aria-hidden="true"
		focusable="false"
	>
		<g fill="none" stroke="currentColor" vector-effect="non-scaling-stroke">
			<path vector-effect="non-scaling-stroke" d="M47 0V50" />
			<circle vector-effect="non-scaling-stroke" cx="47" cy="25" r="6" />
			<circle vector-effect="non-scaling-stroke" cx="47" cy="25" r="2" />
			<!-- Left end: key, free-throw circle, three-point line -->
			<path vector-effect="non-scaling-stroke" d="M0 17H19V33H0" />
			<circle vector-effect="non-scaling-stroke" cx="19" cy="25" r="6" />
			<path vector-effect="non-scaling-stroke" d="M0 3H14A22 22 0 0 1 14 47H0" />
			<!-- Right end -->
			<path vector-effect="non-scaling-stroke" d="M94 17H75V33H94" />
			<circle vector-effect="non-scaling-stroke" cx="75" cy="25" r="6" />
			<path vector-effect="non-scaling-stroke" d="M94 3H80A22 22 0 0 0 80 47H94" />
		</g>
	</svg>

	<div class="stripes" aria-hidden="true"></div>
	<div class="floor" aria-hidden="true"></div>
	<div class="shadow" bind:this={shadowEl} aria-hidden="true"></div>

	<div class="ball" bind:this={ballEl} aria-hidden="true">
		<div class="squash" bind:this={squashEl}>
			<svg viewBox="0 0 100 100" focusable="false">
				<defs>
					<radialGradient id="hero-ball-skin" cx="34%" cy="28%" r="80%">
						<stop offset="0" stop-color="var(--ball-light)" />
						<stop offset="0.55" stop-color="var(--ball)" />
						<stop offset="1" stop-color="var(--ball-dark)" />
					</radialGradient>
					<clipPath id="hero-ball-clip">
						<circle cx="50" cy="50" r="48" />
					</clipPath>
				</defs>
				<circle cx="50" cy="50" r="48" fill="url(#hero-ball-skin)" />
				<g clip-path="url(#hero-ball-clip)">
					<g
						bind:this={spinEl}
						class="spin"
						fill="none"
						stroke="var(--seam)"
						stroke-width="2.6"
						stroke-linecap="round"
					>
						<path d="M50 0V100" />
						<path d="M0 50H100" />
						<path d="M16 16Q38 50 16 84" />
						<path d="M84 16Q62 50 84 84" />
					</g>
				</g>
				<!-- Soft top highlight -->
				<ellipse
					cx="38"
					cy="24"
					rx="20"
					ry="9"
					fill="#fff"
					opacity="0.18"
					transform="rotate(-20 38 24)"
				/>
			</svg>
		</div>
	</div>

	{#if children}
		<div class="content">{@render children()}</div>
	{/if}
</div>

<style>
	.hero-bar {
		/* Override from the parent, e.g. <HeroBar --accent="#22d3ee" /> */
		--bg-1: #0b1020;
		--bg-2: #151c33;
		--line: rgb(255 255 255 / 0.07);
		--accent: #f97316;
		--fg: #fafafa;
		--ball: #f26b1d;
		--ball-light: #ffa45c;
		--ball-dark: #b4420c;
		--seam: rgb(20 10 5 / 0.85);

		position: relative;
		width: 100%;
		height: var(--h);
		overflow: hidden;
		isolation: isolate; /* keeps all z-index values inside the bar */
		color: var(--fg);
		border-radius: 1rem;
		background: radial-gradient(120% 140% at 50% 0%, var(--bg-2), var(--bg-1) 70%);
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);

		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		-webkit-tap-highlight-color: transparent;
		touch-action: manipulation; /* no double-tap zoom, scrolling still works */
	}

	.interactive {
		cursor: pointer;
	}

	/* ---------- Court lines ---------- */
	.court {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		color: var(--line);
		stroke-width: 1px;
		pointer-events: none;
	}

	/* Thin diagonal stripes on the right, fading toward the middle */
	.stripes {
		position: absolute;
		inset: 0 0 0 55%;
		background: repeating-linear-gradient(
			-60deg,
			transparent 0 14px,
			color-mix(in srgb, var(--accent) 14%, transparent) 14px 16px
		);
		mask-image: linear-gradient(to left, #000, transparent);
		-webkit-mask-image: linear-gradient(to left, #000, transparent);
		pointer-events: none;
	}

	/* Floor line with an accent that fades out at both ends */
	.floor {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 6px;
		height: 2px;
		background: linear-gradient(
			90deg,
			transparent,
			var(--accent) 20%,
			var(--accent) 80%,
			transparent
		);
		opacity: 0.55;
		pointer-events: none;
	}

	.shadow {
		position: absolute;
		left: 0;
		bottom: calc(6px - 0.5px);
		border-radius: 50%;
		background: #000;
		filter: blur(3px);
		translate: 0 50%;
		opacity: 0;
		pointer-events: none;
		will-change: transform, opacity;
	}

	/* ---------- Ball ---------- */
	.ball {
		position: absolute;
		top: 0;
		left: 0;
		opacity: 0;
		pointer-events: none;
		will-change: transform;
		transition: opacity 0.4s ease;
	}

	.ready .ball {
		opacity: 1;
	}

	.squash,
	.ball svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.ball svg {
		overflow: visible;
	}

	.spin {
		transform-box: view-box;
		transform-origin: 50px 50px; /* the ball's centre */
	}

	/* ---------- Content layer (title etc.) ---------- */
	.content {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		pointer-events: none; /* taps fall through to the ball... */
	}

	.content :global(:is(a, button, input, select, textarea, [role='button'])) {
		pointer-events: auto; /* ...except on real controls */
	}
</style>
