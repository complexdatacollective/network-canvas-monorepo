import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CrossesPattern } from "../variants/Crosses";
import { DotsPattern } from "../variants/Dots";
import { FlowPattern } from "../variants/Flow";
import { RingsPattern } from "../variants/Rings";
import { SquigglesPattern } from "../variants/Squiggles";
import { TilesPattern } from "../variants/Tiles";

describe("determinism", () => {
	describe("DotsPattern", () => {
		it("produces identical markup on repeat renders with the same seed", () => {
			const a = renderToStaticMarkup(<DotsPattern seed="fixture" width={400} height={250} />);
			const b = renderToStaticMarkup(<DotsPattern seed="fixture" width={400} height={250} />);
			expect(a).toBe(b);
		});

		it("renders an svg with the background rect first", () => {
			const markup = renderToStaticMarkup(<DotsPattern seed="fixture" width={400} height={250} />);
			expect(markup.startsWith("<svg")).toBe(true);
			expect(markup).toContain("<rect");
			expect(markup).toContain("<circle");
		});

		it("matches snapshot for the determinism fixture seed", () => {
			const markup = renderToStaticMarkup(<DotsPattern seed="determinism-fixture" width={400} height={250} />);
			expect(markup).toMatchSnapshot();
		});
	});

	describe("TilesPattern", () => {
		it("produces identical markup on repeat renders with the same seed", () => {
			const a = renderToStaticMarkup(<TilesPattern seed="fixture" width={400} height={250} />);
			const b = renderToStaticMarkup(<TilesPattern seed="fixture" width={400} height={250} />);
			expect(a).toBe(b);
		});

		it("renders an svg with polygons", () => {
			const markup = renderToStaticMarkup(<TilesPattern seed="fixture" width={400} height={250} />);
			expect(markup.startsWith("<svg")).toBe(true);
			expect(markup).toContain("<polygon");
		});

		it("matches snapshot for the determinism fixture seed", () => {
			const markup = renderToStaticMarkup(<TilesPattern seed="determinism-fixture" width={400} height={250} />);
			expect(markup).toMatchSnapshot();
		});
	});

	describe("FlowPattern", () => {
		it("produces identical markup on repeat renders with the same seed", () => {
			const a = renderToStaticMarkup(<FlowPattern seed="fixture" width={400} height={250} />);
			const b = renderToStaticMarkup(<FlowPattern seed="fixture" width={400} height={250} />);
			expect(a).toBe(b);
		});

		it("renders an svg with paths", () => {
			const markup = renderToStaticMarkup(<FlowPattern seed="fixture" width={400} height={250} />);
			expect(markup.startsWith("<svg")).toBe(true);
			expect(markup).toContain("<path");
		});

		it("matches snapshot for the determinism fixture seed", () => {
			const markup = renderToStaticMarkup(<FlowPattern seed="determinism-fixture" width={400} height={250} />);
			expect(markup).toMatchSnapshot();
		});
	});

	describe("RingsPattern", () => {
		it("produces identical markup on repeat renders with the same seed", () => {
			const a = renderToStaticMarkup(<RingsPattern seed="fixture" width={400} height={250} />);
			const b = renderToStaticMarkup(<RingsPattern seed="fixture" width={400} height={250} />);
			expect(a).toBe(b);
		});

		it("renders an svg with circles", () => {
			const markup = renderToStaticMarkup(<RingsPattern seed="fixture" width={400} height={250} />);
			expect(markup.startsWith("<svg")).toBe(true);
			expect(markup).toContain("<circle");
		});

		it("matches snapshot for the determinism fixture seed", () => {
			const markup = renderToStaticMarkup(<RingsPattern seed="determinism-fixture" width={400} height={250} />);
			expect(markup).toMatchSnapshot();
		});
	});

	describe("SquigglesPattern", () => {
		it("produces identical markup on repeat renders with the same seed", () => {
			const a = renderToStaticMarkup(<SquigglesPattern seed="fixture" width={400} height={250} />);
			const b = renderToStaticMarkup(<SquigglesPattern seed="fixture" width={400} height={250} />);
			expect(a).toBe(b);
		});

		it("renders an svg with paths", () => {
			const markup = renderToStaticMarkup(<SquigglesPattern seed="fixture" width={400} height={250} />);
			expect(markup.startsWith("<svg")).toBe(true);
			expect(markup).toContain("<path");
		});

		it("matches snapshot for the determinism fixture seed", () => {
			const markup = renderToStaticMarkup(<SquigglesPattern seed="determinism-fixture" width={400} height={250} />);
			expect(markup).toMatchSnapshot();
		});
	});

	describe("CrossesPattern", () => {
		it("produces identical markup on repeat renders with the same seed", () => {
			const a = renderToStaticMarkup(<CrossesPattern seed="fixture" width={400} height={250} />);
			const b = renderToStaticMarkup(<CrossesPattern seed="fixture" width={400} height={250} />);
			expect(a).toBe(b);
		});

		it("renders an svg with lines", () => {
			const markup = renderToStaticMarkup(<CrossesPattern seed="fixture" width={400} height={250} />);
			expect(markup.startsWith("<svg")).toBe(true);
			expect(markup).toContain("<line");
		});

		it("matches snapshot for the determinism fixture seed", () => {
			const markup = renderToStaticMarkup(<CrossesPattern seed="determinism-fixture" width={400} height={250} />);
			expect(markup).toMatchSnapshot();
		});
	});
});
