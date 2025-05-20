import Link from "next/link";
import { useTheme } from "next-themes";
import { cn } from "~/lib/utils";

type LogoComponentProps = {
	invisible?: boolean;
	className?: string;
};

const LogoComponent = ({ invisible = false, className }: LogoComponentProps) => {
	const { resolvedTheme } = useTheme();
	return (
		<Link
			href="/"
			className={cn(
				className,
				invisible ? "invisible" : "visible",
				"focusable flex-shrink-0 transition-transform duration-1000",
			)}
		>
			<img src="/images/mark.svg" alt="Network Canvas Documentation" className="h-9 w-auto lg:hidden" />
			<img
				src={resolvedTheme === "dark" ? "/images/typemark-positive.svg" : "/images/typemark-negative.svg"}
				alt="Network Canvas Documentation"
				className="hidden h-12 w-auto lg:block"
			/>
		</Link>
	);
};

export default LogoComponent;
