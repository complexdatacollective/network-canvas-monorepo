import { configureStore } from "@reduxjs/toolkit";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { change, reduxForm } from "redux-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionCreators as codebookActions } from "../../../../ducks/modules/protocol/codebook";
import { rootReducer } from "../../../../ducks/modules/root";
import PromptFields from "../PromptFields";

// Mock the Option component to include test ID
vi.mock("../../../Options/Option", () => ({
	default: ({ children, ...props }) => (
		<div data-testid="option" {...props}>
			{children}
		</div>
	),
}));

// Mock other components that cause issues
vi.mock("../../PromptText", () => ({
	default: () => <div data-testid="prompt-text" />,
}));

vi.mock("../../../Form/ValidatedField", () => ({
	default: ({ children, ...props }) => (
		<div data-testid="validated-field" {...props}>
			{children}
		</div>
	),
}));

const mockFormName = "foo";

const initialState = {
	protocol: {
		timeline: [],
		present: {
			codebook: {
				node: {
					person: {
						variables: {
							bazz: {
								name: "bazz",
								options: [
									{ value: "a", label: "a" },
									{ value: "b", label: "b" },
									{ value: "c", label: "c" },
									{ value: "d", label: "d" },
								],
							},
							buzz: {
								name: "buzz",
								options: [
									{ value: 1, label: "1" },
									{ value: 2, label: "2" },
								],
							},
						},
					},
				},
			},
		},
	},
};

const MockForm = reduxForm({
	form: mockFormName,
})(({ handleSubmit, children }) => <form onSubmit={handleSubmit}>{children}</form>);

const getSubject = (node, store, { form }) =>
	render(
		<Provider store={store}>
			<MockForm {...form}>{node}</MockForm>
		</Provider>,
	);

// Create a store factory function
const createTestStore = (initialState) =>
	configureStore({
		reducer: rootReducer,
		preloadedState: initialState,
		middleware: (getDefaultMiddleware) =>
			getDefaultMiddleware({
				serializableCheck: false,
			}),
	});

// eslint-disable-next-line import/prefer-default-export
export const testPromptFields = (PromptFieldsComponent, name = "") => {
	let mockStore;

	beforeEach(() => {
		mockStore = createTestStore(initialState);
	});

	// FIXME This seems to test the wrong part of codebook

	describe(name, () => {
		describe("PromptFields", () => {
			it("when variable is created, variable options are updated", () => {
				const formProps = {
					initialValues: {
						variable: "bazz",
						variableOptions: [
							{ label: "bazz", value: "bazz" },
							{ label: "buzz", value: "buzz" },
						],
					},
				};
				const additionalProps = { form: formProps };

				const subject = getSubject(
					<PromptFieldsComponent
						form={mockFormName}
						entity="node"
						type="person"
						handleDeleteVariable={vi.fn()}
						handleUpdate={vi.fn()}
					/>,
					mockStore,
					additionalProps,
				);

				expect(subject.container.querySelectorAll('[data-testid="option"]')).toHaveLength(2);

				mockStore.dispatch(
					codebookActions.createVariable("node", "person", {
						name: "fizz",
						type: "foo",
						options: [1, 2, 3],
					}),
				);

				mockStore.dispatch(change(mockFormName, "variable", "809895df-bbd7-4c76-ac58-e6ada2625f9b"));

				subject.rerender(
					<Provider store={mockStore}>
						<MockForm {...formProps}>
							<PromptFieldsComponent
								form={mockFormName}
								entity="node"
								type="person"
								handleDeleteVariable={vi.fn()}
								handleUpdate={vi.fn()}
							/>
						</MockForm>
					</Provider>,
				);

				expect(subject.container.querySelectorAll('[data-testid="option"]')).toHaveLength(3);
			});

			it("when variable is changed, variable options are updated", () => {
				const formProps = {
					initialValues: {
						variable: "bazz",
						variableOptions: [
							{ label: "bazz", value: "bazz" },
							{ label: "buzz", value: "buzz" },
						],
					},
				};
				const additionalProps = { form: formProps };

				const subject = getSubject(
					<PromptFieldsComponent
						form={mockFormName}
						entity="node"
						type="person"
						handleDeleteVariable={vi.fn()}
						handleUpdate={vi.fn()}
					/>,
					mockStore,
					additionalProps,
				);

				expect(subject.container.querySelectorAll('[data-testid="option"]')).toHaveLength(2);

				mockStore.dispatch(change(mockFormName, "variable", "buzz"));

				subject.rerender(
					<Provider store={mockStore}>
						<MockForm {...formProps}>
							<PromptFieldsComponent
								form={mockFormName}
								entity="node"
								type="person"
								handleDeleteVariable={vi.fn()}
								handleUpdate={vi.fn()}
							/>
						</MockForm>
					</Provider>,
				);

				expect(subject.container.querySelectorAll('[data-testid="option"]')).toHaveLength(2);
			});
		});
	});
};

testPromptFields(PromptFields);
