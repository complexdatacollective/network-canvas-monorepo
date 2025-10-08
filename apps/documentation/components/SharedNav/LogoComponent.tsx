import Image from "next/image";
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
			<Image
				src="/images/mark.svg"
				alt="Network Canvas Documentation"
				className="h-9 w-auto lg:hidden"
				width={36}
				height={36}
			/>
			<Image
				src={resolvedTheme === "dark" ? "/images/typemark-positive.svg" : "/images/typemark-negative.svg"}
				alt="Network Canvas Documentation"
				className="hidden h-12 w-auto lg:block"
				width={120}
				height={48}
			/>
		</Link>
	);
};

export default LogoComponent;
