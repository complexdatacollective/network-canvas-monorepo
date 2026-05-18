import type { Palette, Rng } from "./types";

// Restricted base palette. Each entry drives one pattern: foreground is a
// light, desaturated version of the base; background is a vertical gradient
// from the base (top) to a slightly darker version (bottom).
export const BASE_PALETTE = [
	{ name: "neon-coral", l: 0.5733, c: 0.2584, h: 11.57 },
	{ name: "mustard", l: 0.81, c: 0.17, h: 86.39 },
	{ name: "sea-green", l: 0.7, c: 0.2, h: 171.52 },
	{ name: "slate-blue", l: 0.55, c: 0.198, h: 281 },
] as const;

export function rngToPalette(rng: Rng): Palette {
	const baseIdx = Math.floor(rng() * BASE_PALETTE.length);
	const base = BASE_PALETTE[baseIdx] ?? BASE_PALETTE[0];
	const fgL = Math.min(0.94, base.l + 0.3);
	const fgC = Number((base.c * 0.2).toFixed(3));
	// Strong vertical gradient so lighter bases (mustard, sea-green) read as
	// distinct hues, not pale off-white. Bottom is pushed ~0.3 darker than
	// the top, clamped to a sensible floor.
	const bottomL = Math.max(0.22, base.l - 0.3);
	return {
		foreground: `oklch(${fgL.toFixed(3)} ${fgC} ${base.h})`,
		backgroundTop: `oklch(${base.l} ${base.c} ${base.h})`,
		backgroundBottom: `oklch(${bottomL.toFixed(3)} ${base.c} ${base.h})`,
	};
}
