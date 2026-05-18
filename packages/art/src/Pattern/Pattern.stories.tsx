import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties } from "react";
import { ProtocolCardMock } from "../../.storybook/ProtocolCardMock";
import { Pattern } from "./Pattern";
import { PATTERN_VARIANTS, type PatternVariant } from "./types";

const meta = {
	title: "Patterns/Overview",
	component: Pattern,
	argTypes: {
		seed: { control: "text" },
		variant: { control: "select", options: [undefined, ...PATTERN_VARIANTS] },
		width: { control: { type: "number", min: 100, max: 1200, step: 10 } },
		height: { control: { type: "number", min: 100, max: 1200, step: 10 } },
	},
	args: {
		seed: "Family Networks 2024",
		width: 400,
		height: 250,
	},
} satisfies Meta<typeof Pattern>;

export default meta;
type Story = StoryObj<typeof meta>;

const tileBox: CSSProperties = {
	width: 200,
	height: 125,
	borderRadius: 8,
	overflow: "hidden",
	border: "1px solid rgba(0,0,0,0.08)",
};

export const SeedPlayground: Story = {
	render: (args) => (
		<div style={{ width: 400, height: 250 }}>
			<Pattern {...args} style={{ width: "100%", height: "100%" }} />
		</div>
	),
};

export const AllVariants: Story = {
	args: { seed: "Comparison Seed" },
	render: (args) => (
		<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 900 }}>
			{PATTERN_VARIANTS.map((variant) => (
				<div key={variant}>
					<div style={tileBox}>
						<Pattern seed={args.seed} variant={variant} style={{ width: "100%", height: "100%" }} />
					</div>
					<div style={{ fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>{variant}</div>
				</div>
			))}
		</div>
	),
};

const SEED_GRID_SEEDS = [
	"alpha",
	"beta",
	"gamma",
	"delta",
	"epsilon",
	"zeta",
	"eta",
	"theta",
	"iota",
	"kappa",
	"lambda",
	"mu",
] as const;

export const SeedGrid: Story = {
	args: { variant: "dots", seed: "" },
	argTypes: {
		variant: { control: "select", options: PATTERN_VARIANTS },
	},
	render: (args) => {
		const v: PatternVariant = args.variant ?? "dots";
		return (
			<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 900 }}>
				{SEED_GRID_SEEDS.map((seed) => (
					<div key={seed}>
						<div style={tileBox}>
							<Pattern seed={seed} variant={v} style={{ width: "100%", height: "100%" }} />
						</div>
						<div style={{ fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>{seed}</div>
					</div>
				))}
			</div>
		);
	},
};

const PROTOCOL_NAMES = [
	"Family Networks 2024",
	"Drug Use Among Young Adults",
	"Migration Pathways",
	"Social Capital Study",
	"Health Worker Networks",
	"Kinship and Caregiving",
	"Adolescent Friendships",
] as const;

export const OnCardGrid: Story = {
	render: () => (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
				gap: 16,
				maxWidth: 1080,
			}}
		>
			{PROTOCOL_NAMES.map((name) => (
				<ProtocolCardMock key={name} title={name}>
					<Pattern seed={name} style={{ width: "100%", height: "100%" }} />
				</ProtocolCardMock>
			))}
		</div>
	),
};
