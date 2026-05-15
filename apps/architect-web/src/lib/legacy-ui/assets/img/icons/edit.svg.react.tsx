import type { SVGProps } from "react";
import { cx } from "~/utils/cva";

export default function SVG({ className, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 80 94"
			className={cx("size-(--space-3xl)", className)}
			{...props}
		>
			<title>Edit</title>
			<path fill="var(--color-sea-green)" d="M53.545 10.772l7.071 7.07L10.61 67.85l-7.071-7.07z" />
			<path fill="var(--color-sea-green-dark)" d="M60.615 17.84l7.071 7.071L17.68 74.918l-7.071-7.071z" />
			<circle fill="var(--color-tomato)" cx="73.46" cy="13.49" r="5" transform="rotate(-45 73.467 13.489)" />
			<circle fill="var(--color-tomato-dark)" cx="64.98" cy="5" r="5" transform="rotate(-45 64.979 4.995)" />
			<path fill="var(--color-tomato)" d="M69.227 9.24l7.778 7.778-8.683 8.684-7.778-7.779z" />
			<path fill="var(--color-tomato-dark)" d="M61.447 1.458l7.778 7.778-8.683 8.683-7.778-7.778z" />
			<path fill="var(--color-tomato)" d="M72.757 5.715L77 9.957 66.902 20.055l-4.242-4.243z" />
			<path fill="var(--color-tomato-dark)" d="M68.517 1.454l4.243 4.243-10.098 10.097-4.242-4.242z" />
			<circle fill="var(--color-tomato-dark)" cx="53.46" cy="10.86" r="3" transform="rotate(-45 53.457 10.857)" />
			<circle fill="var(--color-tomato-dark)" cx="67.61" cy="25" r="3" transform="rotate(-45 67.608 25.006)" />
			<path fill="var(--color-tomato-dark)" d="M55.583 8.737L69.725 22.88l-4.243 4.243L51.34 12.98z" />
			<path fill="var(--color-platinum)" d="M3.537 60.779l7.071 7.07-3.019 3.02-7.07-7.071z" />
			<path
				fill="var(--color-platinum-dark)"
				d="M10.617 67.847l7.071 7.071-3.019 3.02-7.07-7.071zM0 78.46l14.67-.52-7.08-7.07L0 78.46z"
			/>
			<path fill="var(--color-platinum)" d="M0 78.46L.52 63.8l7.07 7.07L0 78.46z" />
			<circle fill="var(--color-platinum-dark)" cx="1.61" cy="85.18" r="1.61" />
			<circle fill="var(--color-platinum-dark)" cx="60.51" cy="85.18" r="1.61" />
			<circle fill="var(--color-platinum-dark)" cx="78.39" cy="85.18" r="1.61" />
			<circle fill="var(--color-platinum-dark)" cx="70.71" cy="85.18" r="1.61" />
			<path fill="var(--color-platinum-dark)" d="M70.71 83.57h7.68v3.22h-7.68zM1.61 83.57h58.9v3.22H1.61z" />
			<circle fill="var(--color-platinum-dark)" cx="11.61" cy="92.39" r="1.61" />
			<circle fill="var(--color-platinum-dark)" cx="50.51" cy="92.39" r="1.61" />
			<path fill="var(--color-platinum-dark)" d="M11.61 90.78h38.9V94h-38.9z" />
		</svg>
	);
}
