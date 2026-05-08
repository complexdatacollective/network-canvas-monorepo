import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { cn } from "~/utils/cn";

export type BreadcrumbItem = {
	label: string;
	onClick?: () => void;
	truncate?: boolean;
};

type BreadcrumbProps = {
	items: BreadcrumbItem[];
};

const Breadcrumb = ({ items }: BreadcrumbProps) => (
	<nav aria-label="Breadcrumb" className="flex items-center gap-(--space-sm) min-w-0 flex-1">
		{items.map((item, index) => {
			const labelClasses = cn("inline-block text-current", item.truncate !== false && "truncate max-w-xs");

			return (
				<Fragment key={item.label}>
					{index > 0 && <ChevronRight aria-hidden className="size-4 text-current/40 shrink-0" />}
					{item.onClick ? (
						<button
							type="button"
							onClick={item.onClick}
							className={cn(
								labelClasses,
								"bg-transparent border-none p-0 cursor-pointer hover:opacity-70 transition-opacity",
							)}
						>
							{item.label}
						</button>
					) : (
						<span className={labelClasses}>{item.label}</span>
					)}
				</Fragment>
			);
		})}
	</nav>
);

export default Breadcrumb;
