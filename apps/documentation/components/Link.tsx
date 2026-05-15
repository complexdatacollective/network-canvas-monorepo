import NextLink from "next/link";
import { type AnchorHTMLAttributes, type ComponentProps, forwardRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

// next/link intercepts clicks on its rendered <a> and performs client-side
// navigation through the Next.js router. Any href that doesn't match a
// registered route (file downloads in /public, full-origin URLs, mailto:,
// etc.) falls through to the SPA 404 page — even though a direct HTTP GET
// of the same URL would succeed. Bypass next/link for those cases so the
// browser handles them with a real navigation/download.
const NON_ROUTE_HREF = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|mailto:|tel:)/i;
const DOWNLOADABLE_EXTENSION =
	/\.(?:netcanvas|zip|pdf|csv|json|xml|graphml|tsv|xlsx?|docx?|pptx?|mp4|mov|webm|mp3|wav|png|jpe?g|gif|svg|webp)(?:\?|$)/i;

const isNonRouteHref = (href: unknown): href is string => {
	if (typeof href !== "string" || href.length === 0) return false;
	return NON_ROUTE_HREF.test(href) || DOWNLOADABLE_EXTENSION.test(href);
};

type LinkProps = ComponentProps<typeof NextLink> & {
	children: ReactNode;
	className?: string;
};

const LINK_CLASS_NAMES =
	"focusable group font-semibold text-link transition-[background-size] duration-300 ease-in-out";

const Link = forwardRef<HTMLAnchorElement, LinkProps>((props, ref) => {
	const className = cn(LINK_CLASS_NAMES, props.className);
	const innerSpan = (
		<span className="bg-gradient-to-r from-link to-link bg-[length:0%_2px] bg-left-bottom bg-no-repeat pb-[2px] transition-[background-size] duration-200 ease-out group-hover:bg-[length:100%_2px]">
			{props.children}
		</span>
	);

	if (isNonRouteHref(props.href) || props.target === "_blank") {
		const { href, ...rest } = props as LinkProps & AnchorHTMLAttributes<HTMLAnchorElement>;
		return (
			<a ref={ref} {...rest} href={typeof href === "string" ? href : undefined} className={className}>
				{innerSpan}
			</a>
		);
	}

	return (
		<NextLink ref={ref} className={className} {...props}>
			{innerSpan}
		</NextLink>
	);
});

Link.displayName = "Link";

export default Link;
