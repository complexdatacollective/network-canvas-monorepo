import { motion } from "motion/react";
import type { ComponentType, ReactNode } from "react";

interface StepProps {
	children?: ReactNode;
	component?: ComponentType<Record<string, unknown>>;
	[key: string]: unknown;
}

const Step = ({ children = null, component: Container = motion.div, ...props }: StepProps) => (
	<Container {...props}>{children}</Container>
);

export default Step;
