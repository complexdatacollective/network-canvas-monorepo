import { seedToRng } from "./seed";
import type { Palette, Rng } from "./types";

// Restricted base palette. Each entry drives one pattern: shapes use
// translucent white; the background is a vertical gradient from the base
// hue (top) to a darker version (bottom).
export const BASE_PALETTE = [
	{ name: "neon-coral", l: 0.5733, c: 0.2584, h: 11.57 },
	{ name: "mustard", l: 0.81, c: 0.17, h: 86.39 },
	{ name: "sea-green", l: 0.7, c: 0.2, h: 171.52 },
	{ name: "slate-blue", l: 0.55, c: 0.198, h: 281 },
	{ name: "cerulean-blue", l: 0.5824, c: 0.229, h: 260.09 },
] as const;

function pickBase(rng: Rng) {
	const idx = Math.floor(rng() * BASE_PALETTE.length);
	return BASE_PALETTE[idx] ?? BASE_PALETTE[0];
}

export function rngToPalette(rng: Rng): Palette {
	const base = pickBase(rng);
	// Strong vertical gradient so lighter bases (mustard, sea-green) read as
	// distinct hues, not pale off-white. Bottom is pushed ~0.3 darker than
	// the top, clamped to a sensible floor.
	const bottomL = Math.max(0.22, base.l - 0.3);
	return {
		foreground: "oklch(1 0 0)",
		backgroundTop: `oklch(${base.l} ${base.c} ${base.h})`,
		backgroundBottom: `oklch(${bottomL.toFixed(3)} ${base.c} ${base.h})`,
	};
}

// Companion color in the same hue family as a seed's pattern, much darker
// than the gradient bottom. Used by surrounding UI (e.g., subheadings on a
// card) that wants to echo the pattern's hue.
export function seedToDeepAccent(seed: string): string {
	const base = pickBase(seedToRng(seed));
	const l = Math.max(0.15, base.l - 0.4);
	return `oklch(${l.toFixed(3)} ${base.c} ${base.h})`;
}
