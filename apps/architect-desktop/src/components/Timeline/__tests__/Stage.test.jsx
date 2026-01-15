/* eslint-env jest */

import { shallow } from "enzyme";
import uuid from "uuid";
import { UnconnectedStage } from "../Stage";

jest.mock("@codaco/ui/lib/utils/CSSVariables");

const mockProps = {
	id: uuid(),
	stageNumber: 1,
	type: "Foo",
	onEditStage: () => {},
	onDeleteStage: () => {},
	onEditSkipLogic: () => {},
	onInsertStage: () => {},
};

describe("<Stage />", () => {
	it("can render", () => {
		const component = shallow(<UnconnectedStage {...mockProps} />);

		expect(component).toMatchSnapshot();
	});
});
