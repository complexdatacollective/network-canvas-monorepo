import type { ReactNode } from "react";

type EmptyStateProps = {
	title: string;
	description?: ReactNode;
	action?: ReactNode;
	icon?: ReactNode;
};

export default function EmptyState({ title, description, action, icon }: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-surface-1/40 px-6 py-12 text-center">
			{icon ? <div className="text-muted-foreground">{icon}</div> : null}
			<h2 className="font-heading text-xl font-semibold">{title}</h2>
			{description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
			{action ? <div className="mt-2">{action}</div> : null}
		</div>
	);
}
