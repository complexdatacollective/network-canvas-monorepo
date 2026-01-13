/* eslint-disable react/prop-types */
/* eslint-disable react/jsx-props-no-spreading */

import Tippy from "@tippyjs/react";
import React, { useRef } from "react";

const withTooltip =
	(WrappedComponent) =>
	({ tooltip, tippyProps, ...props }) => {
		const ref = useRef();
		return (
			<>
				<span ref={ref}>
					<WrappedComponent {...props} />
				</span>
				{tooltip && <Tippy content={tooltip} reference={ref} {...tippyProps} />}
			</>
		);
	};

export default withTooltip;
