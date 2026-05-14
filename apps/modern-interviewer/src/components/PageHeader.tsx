import type { ReactNode } from "react";

type PageHeaderProps = {
	title: string;
	subtitle?: ReactNode;
	actions?: ReactNode;
};

export default function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
	return (
		<header className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h1 className="font-heading text-3xl font-bold leading-tight">{title}</h1>
				{subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
			</div>
			{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
		</header>
	);
}
