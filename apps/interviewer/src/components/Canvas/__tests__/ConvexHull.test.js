/* eslint-env jest */
/* eslint-disable @codaco/spellcheck/spell-checker */

import { shallow } from "enzyme";
import React from "react";

import ConvexHull from "../ConvexHull";

describe("<ConvexHull />", () => {
	it("renders a convex hull with a polygon", () => {
		const props = {
			nodePoints: [{ attributes: { coords: { x: 0, y: 1 } } }],
			layoutVariable: "coords",
			windowDimensions: {},
		};
		expect(shallow(<ConvexHull {...props} />).find("polygon")).toHaveLength(1);
	});
});
