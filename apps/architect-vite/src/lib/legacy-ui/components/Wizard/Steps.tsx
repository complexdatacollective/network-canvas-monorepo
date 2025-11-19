import type { ReactNode } from "react";

interface StepsProps {
	index?: number;
	children?: ReactNode[];
}

const Steps = ({ index = 1, children = null }: StepsProps) => {
	if (!children || !Array.isArray(children)) {
		return null;
	}

	const step = children[index - 1];

	return <>{step}</>;
};

export default Steps;
