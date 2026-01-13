/* eslint-disable @codaco/spellcheck/spell-checker */

import { mount } from "enzyme";
import React from "react";
import { vi } from "vitest";

vi.mock("../../containers/Node");

import { NO_SCROLL } from "../../behaviours/DragAndDrop/DragManager";
import MultiNodeBucket from "../MultiNodeBucket";

describe("MultiNodeBucket", () => {
	let bucket;

	beforeEach(() => {
		bucket = mount(<MultiNodeBucket nodes={[{}]} sortOrder={[]} />);
	});

	it("renders connected node items", () => {
		expect(bucket.find("Connect(Node)")).toHaveLength(1);
	});

	it("specifies no_scroll on items for improved drag responsiveness", () => {
		expect(bucket.find("Connect(Node)").prop("scrollDirection")).toEqual(NO_SCROLL);
	});
});
