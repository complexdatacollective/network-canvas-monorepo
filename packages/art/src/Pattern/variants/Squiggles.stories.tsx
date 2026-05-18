import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { seedToDeepAccent } from "../palette";
import { SquigglesPattern } from "./Squiggles";

const meta: Meta<typeof SquigglesPattern> = {
	title: "Patterns/Squiggles",
	component: SquigglesPattern,
	tags: ["autodocs"],
	argTypes: {
		seed: { control: "text" },
		width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
		height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
	},
	args: {
		seed: "Kinship and Caregiving",
		width: 400,
		height: 250,
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
	render: (args) => (
		<div style={{ width: 400, height: 250 }}>
			<SquigglesPattern {...args} style={{ width: "100%", height: "100%" }} />
		</div>
	),
};

export const OnCard: Story = {
	render: (args) => (
		<ProtocolCardMock title={args.seed} meta="Squiggles variant" subheadingColor={seedToDeepAccent(args.seed)}>
			<SquigglesPattern {...args} style={{ width: "100%", height: "100%" }} />
		</ProtocolCardMock>
	),
};
