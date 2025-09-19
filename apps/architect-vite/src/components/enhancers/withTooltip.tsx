import { useRef } from "react";
import Tippy, { type TippyProps } from "@tippyjs/react";
import type { ComponentType, ReactNode } from "react";

type WithTooltipProps = {
	tooltip?: ReactNode;
	tippyProps?: Partial<TippyProps>;
};

const withTooltip = <P extends object>(WrappedComponent: ComponentType<P>) => {
	return ({ tooltip, tippyProps, ...props }: P & WithTooltipProps) => {
		const ref = useRef<HTMLSpanElement>(null);
		return (
			<>
				<span ref={ref}>
					<WrappedComponent {...(props as P)} />
				</span>
				{tooltip && <Tippy content={tooltip} reference={ref} {...tippyProps} />}
			</>
		);
	};
};

export default withTooltip;
