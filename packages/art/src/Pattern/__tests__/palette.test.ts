import { describe, expect, it } from "vitest";
import { BASE_PALETTE, rngToPalette } from "../palette";
import { seedToRng } from "../seed";

const parseOklch = (s: string) => {
	const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(s);
	if (!m?.[1] || !m[2] || !m[3]) throw new Error(`Not an oklch string: ${s}`);
	return { l: Number.parseFloat(m[1]), c: Number.parseFloat(m[2]), h: Number.parseFloat(m[3]) };
};

describe("rngToPalette", () => {
	it("produces foreground, backgroundTop, backgroundBottom that all share the base hue", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const fg = parseOklch(palette.foreground);
		const top = parseOklch(palette.backgroundTop);
		const bot = parseOklch(palette.backgroundBottom);
		expect(top.h).toBeCloseTo(fg.h, 4);
		expect(bot.h).toBeCloseTo(fg.h, 4);
	});

	it("backgroundTop matches one of the four BASE_PALETTE colors at full strength", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const baseStrings = BASE_PALETTE.map((c) => `oklch(${c.l} ${c.c} ${c.h})`);
		expect(baseStrings).toContain(palette.backgroundTop);
	});

	it("foreground is lighter and less saturated than the background top", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const fg = parseOklch(palette.foreground);
		const top = parseOklch(palette.backgroundTop);
		expect(fg.l).toBeGreaterThan(top.l);
		expect(fg.c).toBeLessThan(top.c);
	});

	it("backgroundBottom is darker than backgroundTop", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const top = parseOklch(palette.backgroundTop);
		const bot = parseOklch(palette.backgroundBottom);
		expect(bot.l).toBeLessThan(top.l);
	});

	it("produces the same palette for the same seed", () => {
		const a = rngToPalette(seedToRng("alice"));
		const b = rngToPalette(seedToRng("alice"));
		expect(a).toEqual(b);
	});
});
