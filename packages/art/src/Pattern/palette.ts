import type { Palette, Rng } from "./types";

type NCColor = { name: string; l: number; c: number; h: number };

export const NC_PALETTE: readonly NCColor[] = [
	{ name: "neon-coral", l: 0.5733, c: 0.2584, h: 11.57 },
	{ name: "mustard", l: 0.81, c: 0.17, h: 86.39 },
	{ name: "sea-green", l: 0.7, c: 0.2, h: 171.52 },
	{ name: "cyber-grape", l: 0.3, c: 0.09, h: 281 },
	{ name: "sea-serpent", l: 0.7383, c: 0.13, h: 217.55 },
	{ name: "purple-pizazz", l: 0.6249, c: 0.288, h: 320.46 },
	{ name: "paradise-pink", l: 0.6586, c: 0.253, h: 359.2 },
	{ name: "cerulean-blue", l: 0.5824, c: 0.229, h: 260.09 },
	{ name: "kiwi", l: 0.7436, c: 0.157, h: 137.61 },
	{ name: "neon-carrot", l: 0.7487, c: 0.161, h: 62.61 },
	{ name: "barbie-pink", l: 0.6182, c: 0.251, h: 359.853 },
	{ name: "tomato", l: 0.5599, c: 0.25, h: 23.69 },
] as const;

// Restricted base palette that drives the foreground + background pair.
// Foreground uses the base at full strength; background is the same hue
// tinted to a soft surface (high L, low C). Tuple type makes index 0
// non-undefined so the `?? BASE_PALETTE[0]` fallback is well-typed.
export const BASE_PALETTE = [
	{ name: "neon-coral", l: 0.5733, c: 0.2584, h: 11.57 },
	{ name: "mustard", l: 0.81, c: 0.17, h: 86.39 },
	{ name: "sea-green", l: 0.7, c: 0.2, h: 171.52 },
	{ name: "slate-blue", l: 0.55, c: 0.198, h: 281 },
] as const;

const toOklch = ({ l, c, h }: NCColor): string => `oklch(${l} ${c} ${h})`;

function getPaletteColor(idx: number): NCColor {
	const color = NC_PALETTE[idx];
	if (!color) {
		throw new Error(`Invalid palette index: ${idx}`);
	}
	return color;
}

export function rngToPalette(rng: Rng): Palette {
	const baseIdx = Math.floor(rng() * BASE_PALETTE.length);
	const base = BASE_PALETTE[baseIdx] ?? BASE_PALETTE[0];

	const paletteLength = NC_PALETTE.length;
	const indices: number[] = Array.from({ length: paletteLength }, (_, i) => i);
	for (let i = indices.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const valAtI = indices[i];
		const valAtJ = indices[j];
		if (valAtI !== undefined && valAtJ !== undefined) {
			indices[i] = valAtJ;
			indices[j] = valAtI;
		}
	}

	const accentIdx = indices.at(0);
	const highlightIdx = indices.at(1);
	if (accentIdx === undefined || highlightIdx === undefined) {
		throw new Error("Failed to initialize palette indices");
	}
	const accent = getPaletteColor(accentIdx);
	const highlight = getPaletteColor(highlightIdx);
	const bgChroma = Number((base.c * 0.18).toFixed(3));
	return {
		foreground: toOklch(base),
		accent: toOklch(accent),
		highlight: toOklch(highlight),
		background: `oklch(0.94 ${bgChroma} ${base.h})`,
	};
}
