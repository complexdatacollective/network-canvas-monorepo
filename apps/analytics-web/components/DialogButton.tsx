import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";

type DialogButtonProps = {
	buttonLabel: string;
	title: string;
	description: string | null;
	content: ReactNode;
};

export function DialogButton({ buttonLabel, title, description, content }: DialogButtonProps) {
	return (
		<Dialog>
			<DialogTrigger asChild={true}>
				<Button variant="outline">{buttonLabel}</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<DialogDescription>{description}</DialogDescription>
				<div className="break-all rounded-sm p-2">
					<code>{content}</code>
				</div>
			</DialogContent>
		</Dialog>
	);
}
