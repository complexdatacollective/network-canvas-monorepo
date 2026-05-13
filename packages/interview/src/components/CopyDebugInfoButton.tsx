"use client";

import { Button } from "@codaco/fresco-ui/Button";
import { useToast } from "@codaco/fresco-ui/Toast";
import { cx } from "@codaco/fresco-ui/utils/cva";
import { ClipboardCopy } from "lucide-react";

export default function CopyDebugInfoButton({
	debugInfo,
	showToast = true,
	className,
}: {
	debugInfo: string;
	showToast?: boolean;
	className?: string;
}) {
	const { add } = useToast();

	const copyDebugInfoToClipboard = async () => {
		await navigator.clipboard.writeText(debugInfo);

		if (showToast) {
			add({
				title: "Debug information copied to clipboard",
				type: "success",
			});
		}
	};

	return (
		<Button
			onClick={copyDebugInfoToClipboard}
			className={cx(className)}
			title="Copy to clipboard"
			color="primary"
			icon={<ClipboardCopy />}
		>
			Copy Debug Info
		</Button>
	);
}
