import type { CurrentProtocol } from "@codaco/protocol-validation";
import { configureStore } from "@reduxjs/toolkit";
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { change, reduxForm } from "redux-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVariableAsync } from "../../../../ducks/modules/protocol/codebook";
import type { RootState } from "../../../../ducks/modules/root";
import { rootReducer } from "../../../../ducks/modules/root";
import PromptFields from "../PromptFields";

// Mock the Option component to include test ID
vi.mock("../../../Options/Option", () => ({
	default: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
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
	default: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
		<div data-testid="validated-field" {...props}>
			{children}
		</div>
	),
}));

const mockFormName = "foo";

const protocolFixture: CurrentProtocol = {
	schemaVersion: 8,
	codebook: {
		node: {
			person: {
				name: "Person",
				color: "node-color-seq-1",
				variables: {
					bazz: {
						name: "bazz",
						type: "categorical",
						options: [
							{ value: "a", label: "a" },
							{ value: "b", label: "b" },
							{ value: "c", label: "c" },
							{ value: "d", label: "d" },
						],
					},
					buzz: {
						name: "buzz",
						type: "categorical",
						options: [
							{ value: "1", label: "1" },
							{ value: "2", label: "2" },
						],
					},
				},
			},
		},
		edge: {},
		ego: {},
	},
	stages: [],
	assetManifest: {},
};

const initialState = {
	form: {},
	app: {},
	dialogs: {
		dialogs: [],
	},
	activeProtocol: {
		timeline: [],
		present: protocolFixture,
		past: [],
		future: [],
		futureTimeline: [],
	},
	protocolValidation: {
		validationResult: null,
		isValidating: false,
		validationError: null,
		lastValidatedProtocol: null,
	},
	toasts: [],
	protocols: {},
} as unknown as Partial<RootState>;

const MockFormComponent = (props: { children?: ReactNode; [key: string]: unknown }) => <form>{props.children}</form>;

const MockForm = reduxForm({
	form: mockFormName,
	// redux-form library has complex typing that doesn't work well with TypeScript strict mode
	// biome-ignore lint/suspicious/noExplicitAny: redux-form requires this
})(MockFormComponent as any);

const getSubject = (node: ReactNode, store: ReturnType<typeof createTestStore>): RenderResult =>
	render(
		<Provider store={store}>
			{/* @ts-expect-error MockForm from reduxForm doesn't properly type children in JSX */}
			<MockForm>{node}</MockForm>
		</Provider>,
	);

// Create a store factory function
const createTestStore = (initialState: Partial<RootState>) =>
	configureStore({
		reducer: rootReducer,
		preloadedState: initialState,
		middleware: (getDefaultMiddleware) =>
			getDefaultMiddleware({
				serializableCheck: false,
			}),
	});

type PromptFieldsTestProps = {
	form: string;
	entity: "node" | "edge" | "ego";
	type: string;
	changeForm: (form: string, field: string, value: unknown) => void;
	onCreateOtherVariable: (value: string, field: string) => void;
};

// eslint-disable-next-line import/prefer-default-export
export const testPromptFields = (PromptFieldsComponent: React.ComponentType<PromptFieldsTestProps>, name = "") => {
	let mockStore: ReturnType<typeof createTestStore>;

	beforeEach(() => {
		mockStore = createTestStore(initialState);
	});

	// FIXME This seems to test the wrong part of codebook

	describe(name, () => {
		describe("PromptFields", () => {
			it("when variable is created, variable options are updated", () => {
				const subject = getSubject(
					<PromptFieldsComponent
						form={mockFormName}
						entity="node"
						type="person"
						changeForm={vi.fn()}
						onCreateOtherVariable={vi.fn()}
					/>,
					mockStore,
				);

				expect(subject.container.querySelectorAll('[data-testid="option"]')).toHaveLength(2);

				mockStore.dispatch(
					createVariableAsync({
						entity: "node",
						type: "person",
						configuration: {
							name: "fizz",
							type: "categorical",
							options: [
								{ label: "Option 1", value: 1 },
								{ label: "Option 2", value: 2 },
								{ label: "Option 3", value: 3 },
							],
						},
					}),
				);

				mockStore.dispatch(change(mockFormName, "variable", "809895df-bbd7-4c76-ac58-e6ada2625f9b"));

				subject.rerender(
					<Provider store={mockStore}>
						{/* @ts-expect-error MockForm from reduxForm doesn't properly type children in JSX */}
						<MockForm>
							<PromptFieldsComponent
								form={mockFormName}
								entity="node"
								type="person"
								changeForm={vi.fn()}
								onCreateOtherVariable={vi.fn()}
							/>
						</MockForm>
					</Provider>,
				);

				expect(subject.container.querySelectorAll('[data-testid="option"]')).toHaveLength(3);
			});

			it("when variable is changed, variable options are updated", () => {
				const subject = getSubject(
					<PromptFieldsComponent
						form={mockFormName}
						entity="node"
						type="person"
						changeForm={vi.fn()}
						onCreateOtherVariable={vi.fn()}
					/>,
					mockStore,
				);

				expect(subject.container.querySelectorAll('[data-testid="option"]')).toHaveLength(2);

				mockStore.dispatch(change(mockFormName, "variable", "buzz"));

				subject.rerender(
					<Provider store={mockStore}>
						{/* @ts-expect-error MockForm from reduxForm doesn't properly type children in JSX */}
						<MockForm>
							<PromptFieldsComponent
								form={mockFormName}
								entity="node"
								type="person"
								changeForm={vi.fn()}
								onCreateOtherVariable={vi.fn()}
							/>
						</MockForm>
					</Provider>,
				);

				expect(subject.container.querySelectorAll('[data-testid="option"]')).toHaveLength(2);
			});
		});
	});
};

testPromptFields(PromptFields as unknown as React.ComponentType<PromptFieldsTestProps>);
