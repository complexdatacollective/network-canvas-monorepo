import anime from "animejs";
import type { ReactNode } from "react";
import { Transition } from "react-transition-group";
import { getCSSVariableAsNumber, getCSSVariableAsObject } from "../../utils/CSSVariables";

interface FadeDuration {
	enter: number;
	exit: number;
}

interface FadeProps {
	children?: ReactNode;
	customDuration?: FadeDuration | null;
	customEasing?: number[] | null;
	enter?: boolean;
	in: boolean;
	onExited?: () => void;
}

function Fade({
	children = null,
	customDuration = null,
	customEasing = null,
	enter = true,
	in: inProp,
	onExited = () => {},
}: FadeProps) {
	const defaultDuration = {
		enter: getCSSVariableAsNumber("--animation-duration-fast-ms"),
		exit: getCSSVariableAsNumber("--animation-duration-fast-ms"),
	};

	const defaultEasing = getCSSVariableAsObject("--animation-easing-js");

	const duration = customDuration || defaultDuration;
	const easing = customEasing || defaultEasing;

	return (
		<Transition
			timeout={duration}
			onEnter={(el) => {
				anime({
					targets: el,
					opacity: [0, 1],
					elasticity: 0,
					easing,
					duration: duration.enter,
				});
			}}
			onExit={(el) => {
				anime({
					targets: el,
					opacity: [1, 0],
					elasticity: 0,
					easing,
					duration: duration.exit,
				});
			}}
			enter={enter}
			in={inProp}
			appear
			unmountOnExit
			onExited={onExited}
		>
			{children}
		</Transition>
	);
}

export default Fade;
