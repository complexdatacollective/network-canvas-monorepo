import { describe, expect, it } from "vitest";
import { NC_PALETTE, rngToPalette } from "../palette";
import { seedToRng } from "../seed";

const parseOklch = (s: string) => {
	const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(s);
	if (!m || !m[1] || !m[2] || !m[3]) throw new Error(`Not an oklch string: ${s}`);
	return { l: Number.parseFloat(m[1]), c: Number.parseFloat(m[2]), h: Number.parseFloat(m[3]) };
};

describe("rngToPalette", () => {
	it("returns 3 distinct vivid colors sourced from NC_PALETTE", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const vivid = [palette.foreground, palette.accent, palette.highlight];
		expect(new Set(vivid).size).toBe(3);
		const ncOklch = new Set(NC_PALETTE.map((c) => `oklch(${c.l} ${c.c} ${c.h})`));
		for (const color of vivid) {
			expect(ncOklch.has(color)).toBe(true);
		}
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
