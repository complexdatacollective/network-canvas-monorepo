import { describe, it, expect, vi } from "vitest";

import { render } from "@testing-library/react";
import { Dialogs } from "../Dialogs";

vi.mock("../../utils/CSSVariables");

const warningDialog = () => ({
	id: Math.random(),
	type: "Warning",
	title: "Warning!",
	text: "Something happened",
	onConfirm: vi.fn(),
	onCancel: vi.fn(),
});

const confirmDialog = () => ({
	id: Math.random(),
	type: "Confirm",
	title: "Do you want to confirm the thing?",
	text: "We might have more details here",
	onConfirm: vi.fn(),
	onCancel: vi.fn(),
});

const noticeDialog = () => ({
	id: Math.random(),
	type: "Notice",
	title: "Hi",
	text: "Notice me",
	onConfirm: vi.fn(),
});

const makeDialogs = () => [warningDialog(), confirmDialog(), noticeDialog()];

const makeProps = () => ({
	closeDialog: vi.fn(),
});

describe("<Dialogs />", () => {
	it("Renders nothing when dialogs empty", () => {
		const { container } = render(<Dialogs {...makeProps()} />);
		expect(container.firstChild).toBeNull();
	});

	it("It renders dialogs", () => {
		const { getByText } = render(<Dialogs {...makeProps()} dialogs={makeDialogs()} />);
		expect(getByText("Warning!")).toBeInTheDocument();
		expect(getByText("Do you want to confirm the thing?")).toBeInTheDocument();
		expect(getByText("Hi")).toBeInTheDocument();
	});
});
