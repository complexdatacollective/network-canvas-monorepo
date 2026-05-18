import { describe, expect, it } from "vitest";
import { BASE_PALETTE, NC_PALETTE, rngToPalette } from "../palette";
import { seedToRng } from "../seed";

const parseOklch = (s: string) => {
	const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(s);
	if (!m?.[1] || !m[2] || !m[3]) throw new Error(`Not an oklch string: ${s}`);
	return { l: Number.parseFloat(m[1]), c: Number.parseFloat(m[2]), h: Number.parseFloat(m[3]) };
};

describe("rngToPalette", () => {
	it("foreground is sourced from BASE_PALETTE; accent/highlight are distinct entries from NC_PALETTE", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const baseOklch = new Set(BASE_PALETTE.map((c) => `oklch(${c.l} ${c.c} ${c.h})`));
		const ncOklch = new Set(NC_PALETTE.map((c) => `oklch(${c.l} ${c.c} ${c.h})`));
		expect(baseOklch.has(palette.foreground)).toBe(true);
		expect(ncOklch.has(palette.accent)).toBe(true);
		expect(ncOklch.has(palette.highlight)).toBe(true);
		expect(palette.accent).not.toEqual(palette.highlight);
	});

	it("derives a high-lightness, low-chroma background", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const bg = parseOklch(palette.background);
		expect(bg.l).toBeGreaterThanOrEqual(0.9);
		expect(bg.c).toBeLessThanOrEqual(0.05);
	});

	it("produces the same palette for the same seed", () => {
		const a = rngToPalette(seedToRng("alice"));
		const b = rngToPalette(seedToRng("alice"));
		expect(a).toEqual(b);
	});

	it("background hue matches foreground hue", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const bg = parseOklch(palette.background);
		const fg = parseOklch(palette.foreground);
		expect(bg.h).toBeCloseTo(fg.h, 4);
	});
});
