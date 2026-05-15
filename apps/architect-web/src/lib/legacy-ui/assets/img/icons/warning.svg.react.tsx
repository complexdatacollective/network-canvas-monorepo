import type { SVGProps } from "react";
import { cx } from "~/utils/cva";

// CSS-var hooks let parents repaint the body (platinum) and accent (tomato)
// regions. VariableSpotlight uses them to flag rows that need attention.
export default function SVG({ className, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 180 160"
			className={cx("size-(--space-3xl)", className)}
			{...props}
		>
			<title>Warning</title>
			<circle fill="var(--warning-body, var(--color-platinum))" cx="90" cy="17.5" r="17.5" />
			<circle fill="var(--warning-body, var(--color-platinum))" cx="17.5" cy="142.5" r="17.5" />
			<circle fill="var(--warning-body-shadow, var(--color-platinum-dark))" cx="162.5" cy="142.5" r="17.5" />
			<path fill="var(--warning-body, var(--color-platinum))" d="M1.84 134.68L74.19 10h31.56l72.41 124.68H1.84z" />
			<path fill="var(--warning-body-shadow, var(--color-platinum-dark))" d="M78 134.68l63.36-63.36 36.8 63.36H78z" />
			<path fill="var(--warning-body, var(--color-platinum))" d="M17.5 126.68h145V160h-145z" />
			<circle fill="var(--warning-mark, var(--color-tomato))" cx="84.29" cy="99.31" r="3" />
			<circle fill="var(--warning-mark, var(--color-tomato))" cx="95.71" cy="99.31" r="3" />
			<circle fill="var(--warning-mark-shadow, var(--color-tomato-dark))" cx="79.93" cy="48.69" r="3" />
			<circle fill="var(--warning-mark-shadow, var(--color-tomato-dark))" cx="100.07" cy="48.69" r="3" />
			<path fill="var(--warning-mark, var(--color-tomato))" d="M84.29 96.31h11.42v6H84.29z" />
			<path fill="var(--warning-mark-shadow, var(--color-tomato-dark))" d="M79.93 45.69h20.15v6H79.93z" />
			<path
				fill="var(--warning-mark-shadow, var(--color-tomato-dark))"
				d="M76.93 48.69l4.36 50.62h17.42l4.36-50.62H76.93z"
			/>
			<path fill="var(--warning-mark, var(--color-tomato))" d="M80.03 84.75l1.26 14.56h17.42l3.13-36.37-21.81 21.81z" />
			<path
				fill="var(--warning-body-shadow, var(--color-platinum-dark))"
				d="M162.5 126.68H86L52.64 160H162.5v-33.32z"
			/>
			<circle fill="var(--warning-mark-shadow, var(--color-tomato-dark))" cx="90" cy="122.68" r="12" />
			<path fill="var(--warning-mark, var(--color-tomato))" d="M81.51 131.17a12 12 0 0 0 17-17z" />
		</svg>
	);
}
