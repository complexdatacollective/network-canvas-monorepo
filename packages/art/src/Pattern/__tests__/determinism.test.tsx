import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DotsPattern } from "../variants/Dots";
import { FlowPattern } from "../variants/Flow";
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
});
