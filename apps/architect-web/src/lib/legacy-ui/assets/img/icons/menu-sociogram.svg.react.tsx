import type { SVGProps } from "react";

// Two-tone via CSS variables. Defaults to `currentColor` so the icon inherits
// the parent's text color (single-tone). Callers wanting two-tone set both
// vars — see Codebook/EntityIcon.tsx for the cerulean-blue case.
export default function SVG(props: SVGProps<SVGSVGElement>) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 70" {...props}>
			<title>Menu - Sociogram</title>
			<path fill="var(--icon-tone-primary, currentColor)" d="M18.741 42.178l14.996-23.004 2.514 1.638-14.996 23.004z" />
			<path fill="var(--icon-tone-primary, currentColor)" d="M33.74 20.818l2.512-1.638 15 23-2.513 1.64z" />
			<path fill="var(--icon-tone-primary, currentColor)" d="M20 42h30v3H20z" />
			<path
				fill="var(--icon-tone-secondary, currentColor)"
				d="M35 4A31 31 0 1 1 4 35 31 31 0 0 1 35 4m0-4a35 35 0 1 0 35 35A35 35 0 0 0 35 0z"
			/>
			<circle fill="var(--icon-tone-primary, currentColor)" cx="35" cy="20.5" r="7.5" />
			<path
				fill="var(--icon-tone-primary, currentColor)"
				d="M35 13a7.5 7.5 0 0 0-5.3 12.8l10.6-10.6A7.48 7.48 0 0 0 35 13z"
			/>
			<circle fill="var(--icon-tone-primary, currentColor)" cx="20.5" cy="43.5" r="7.5" />
			<path
				fill="var(--icon-tone-primary, currentColor)"
				d="M20.5 36a7.5 7.5 0 0 0-5.3 12.8l10.6-10.6a7.48 7.48 0 0 0-5.3-2.2z"
			/>
			<circle fill="var(--icon-tone-primary, currentColor)" cx="49.5" cy="43.5" r="7.5" />
			<path
				fill="var(--icon-tone-primary, currentColor)"
				d="M49.5 36a7.5 7.5 0 0 0-5.3 12.8l10.6-10.6a7.48 7.48 0 0 0-5.3-2.2z"
			/>
		</svg>
	);
}
