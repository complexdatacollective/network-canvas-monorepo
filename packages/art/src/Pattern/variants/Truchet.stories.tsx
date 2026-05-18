import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProtocolCardMock } from "../../../.storybook/ProtocolCardMock";
import { seedToDeepAccent } from "../palette";
import { TruchetPattern } from "./Truchet";

const meta: Meta<typeof TruchetPattern> = {
	title: "Patterns/Truchet",
	component: TruchetPattern,
	tags: ["autodocs"],
	argTypes: {
		seed: { control: "text" },
		width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
		height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
	},
	args: {
		seed: "Adolescent Friendships",
		width: 400,
		height: 250,
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
	render: (args) => (
		<div style={{ width: 400, height: 250 }}>
			<TruchetPattern {...args} style={{ width: "100%", height: "100%" }} />
		</div>
	),
};

export const OnCard: Story = {
	render: (args) => (
		<ProtocolCardMock title={args.seed} meta="Truchet variant" subheadingColor={seedToDeepAccent(args.seed)}>
			<TruchetPattern {...args} style={{ width: "100%", height: "100%" }} />
		</ProtocolCardMock>
	),
};
