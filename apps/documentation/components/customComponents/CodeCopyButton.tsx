"use client";

import { Button } from "@codaco/ui";
import * as Popover from "@radix-ui/react-popover";
import { ClipboardCheck, ClipboardCopy } from "lucide-react";
import { useState } from "react";

const CodeCopyButton = ({ code }: { code: string }) => {
	const [isCopied, setIsCopied] = useState(false);

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000); // Reset state after 2 seconds
		} catch (error) {}
	};

	return (
		<div className="absolute right-2 top-2">
			<Popover.Root open={true}>
				<Popover.Anchor asChild={true}>
					{isCopied ? (
						<Button size={"icon"}>
							<ClipboardCheck className="h-4 w-4" />
						</Button>
					) : (
						<Button
							size={"icon"}
							className="transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
							onClick={() => copyToClipboard(code)}
						>
							<ClipboardCopy className="h-4 w-4" />
						</Button>
					)}
				</Popover.Anchor>
				<Popover.Portal>
					{isCopied && (
						<Popover.Content
							side="left"
							className="rounded-md bg-background p-1.5 text-sm font-semibold"
							sideOffset={5}
						>
							Copied!
							<Popover.Arrow className="fill-background" />
						</Popover.Content>
					)}
				</Popover.Portal>
			</Popover.Root>
		</div>
	);
};

export default CodeCopyButton;
