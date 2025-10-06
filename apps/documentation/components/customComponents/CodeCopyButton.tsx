"use client";

import { Button } from "@codaco/ui";
import { Anchor, Arrow, Content, Portal, Root } from "@radix-ui/react-popover";
import { ClipboardCheck, ClipboardCopy } from "lucide-react";
import { useState } from "react";

const CodeCopyButton = ({ code }: { code: string }) => {
	const [isCopied, setIsCopied] = useState(false);

	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		} catch (_error) {}
	};

	return (
		<div className="absolute right-2 top-2">
			<Root open>
				<Anchor asChild>
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
				</Anchor>
				<Portal>
					{isCopied && (
						<Content side="left" className="rounded-md bg-background p-1.5 text-sm font-semibold" sideOffset={5}>
							Copied!
							<Arrow className="fill-background" />
						</Content>
					)}
				</Portal>
			</Root>
		</div>
	);
};

export default CodeCopyButton;
