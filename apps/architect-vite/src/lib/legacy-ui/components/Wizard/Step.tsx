import { motion } from "motion/react";
import { ReactNode, ComponentType, HTMLAttributes } from "react";

interface StepProps {
	children?: ReactNode;
	component?: ComponentType<any>;
	[key: string]: any;
}

const Step = ({ children = null, component: Container = motion.div, ...props }: StepProps) => (
	<Container {...props}>{children}</Container>
);

export default Step;