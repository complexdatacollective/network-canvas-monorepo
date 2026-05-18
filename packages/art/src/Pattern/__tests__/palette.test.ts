import { describe, expect, it } from "vitest";
import { BASE_PALETTE, rngToPalette, seedToDeepAccent } from "../palette";
import { seedToRng } from "../seed";

const parseOklch = (s: string) => {
	const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/.exec(s);
	if (!m?.[1] || !m[2] || !m[3]) throw new Error(`Not an oklch string: ${s}`);
	return {
		l: Number.parseFloat(m[1]),
		c: Number.parseFloat(m[2]),
		h: Number.parseFloat(m[3]),
		a: m[4] ? Number.parseFloat(m[4]) : 1,
	};
};

describe("rngToPalette", () => {
	it("foreground is translucent white", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const fg = parseOklch(palette.foreground);
		expect(fg.l).toBe(1);
		expect(fg.c).toBe(0);
		expect(fg.a).toBeGreaterThan(0);
		expect(fg.a).toBeLessThan(1);
	});

	it("backgroundTop matches one of the four BASE_PALETTE colors at full strength", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const baseStrings = BASE_PALETTE.map((c) => `oklch(${c.l} ${c.c} ${c.h})`);
		expect(baseStrings).toContain(palette.backgroundTop);
	});

	it("backgroundBottom shares the backgroundTop hue but is darker", () => {
		const palette = rngToPalette(seedToRng("alice"));
		const top = parseOklch(palette.backgroundTop);
		const bot = parseOklch(palette.backgroundBottom);
		expect(bot.h).toBeCloseTo(top.h, 4);
		expect(bot.l).toBeLessThan(top.l);
	});

	it("produces the same palette for the same seed", () => {
		const a = rngToPalette(seedToRng("alice"));
		const b = rngToPalette(seedToRng("alice"));
		expect(a).toEqual(b);
	});
});

describe("seedToDeepAccent", () => {
	it("returns a much darker version of the seed's base hue", () => {
		const accent = parseOklch(seedToDeepAccent("alice"));
		const top = parseOklch(rngToPalette(seedToRng("alice")).backgroundTop);
		expect(accent.h).toBeCloseTo(top.h, 4);
		expect(accent.l).toBeLessThan(top.l - 0.2);
	});

	it("is deterministic for the same seed", () => {
		expect(seedToDeepAccent("alice")).toBe(seedToDeepAccent("alice"));
	});
});
