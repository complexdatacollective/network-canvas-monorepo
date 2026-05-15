import NextLink from "next/link";
import { type ComponentProps, forwardRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";

const Link = forwardRef<
	HTMLAnchorElement,
	ComponentProps<typeof NextLink> & { children: ReactNode; className?: string }
>((props, ref) => {
	return (
		<NextLink
			ref={ref}
			className={cn(
				"focusable group font-semibold text-link transition-[background-size] duration-300 ease-in-out",
				props.className,
			)}
			{...props}
		>
			<span className="bg-linear-to-r from-link to-link bg-size-[0%_2px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-200 ease-out group-hover:bg-size-[100%_2px]">
				{props.children}
			</span>
		</NextLink>
	);
});

Link.displayName = "Link";

export default Link;
