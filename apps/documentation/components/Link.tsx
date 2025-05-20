import NextLink, { type LinkProps } from "next/link";
import { type ReactNode, forwardRef } from "react";
import { cn } from "~/lib/utils";

const Link = forwardRef<HTMLAnchorElement, LinkProps & { children: ReactNode; className?: string }>((props, ref) => {
	return (
		<NextLink
			ref={ref}
			className={cn(
				"focusable group font-semibold text-link transition-[background-size] duration-300 ease-in-out",
				props.className,
			)}
			{...props}
		>
			<span className="bg-gradient-to-r from-link to-link bg-[length:0%_2px] bg-left-bottom bg-no-repeat pb-[2px] transition-[background-size] duration-200 ease-out group-hover:bg-[length:100%_2px]">
				{props.children}
			</span>
		</NextLink>
	);
});

Link.displayName = "Link";

export default Link;
