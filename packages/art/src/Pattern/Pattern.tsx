import type { ComponentType } from "react";
import { useMemo } from "react";
import { seedToRng } from "./seed";
import { PATTERN_VARIANTS, type PatternProps, type PatternVariant } from "./types";
import { CrossesPattern } from "./variants/Crosses";
import { DotsPattern } from "./variants/Dots";
import { FlowPattern } from "./variants/Flow";
import { RingsPattern } from "./variants/Rings";
import { SquigglesPattern } from "./variants/Squiggles";
import { TilesPattern } from "./variants/Tiles";
import { TruchetPattern } from "./variants/Truchet";

const componentByVariant: Record<PatternVariant, ComponentType<PatternProps>> = {
	dots: DotsPattern,
	tiles: TilesPattern,
	flow: FlowPattern,
	rings: RingsPattern,
	crosses: CrossesPattern,
	squiggles: SquigglesPattern,
	truchet: TruchetPattern,
};

export const Pattern = ({ seed, variant, ...rest }: PatternProps & { variant?: PatternVariant }) => {
	const resolvedVariant = useMemo<PatternVariant>(() => {
		if (variant) return variant;
		const rng = seedToRng(`${seed}::variant`);
		return PATTERN_VARIANTS[Math.floor(rng() * PATTERN_VARIANTS.length)] ?? "dots";
	}, [seed, variant]);

	const Component = componentByVariant[resolvedVariant];
	return <Component seed={seed} {...rest} />;
};
