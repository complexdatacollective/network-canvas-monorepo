import { useCallback, useState } from "react";
import { useJsonPreview } from "~/hooks/useJsonPreview";

export function JsonPreviewOverlay() {
	const { isOpen, context, close } = useJsonPreview();
	const [copied, setCopied] = useState(false);

	const jsonString = context ? JSON.stringify(context.data, null, 2) : "";

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(jsonString);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [jsonString]);

	if (!isOpen || !context) return null;

	return (
		<div className="fixed inset-0 z-(--z-modal) flex flex-col bg-black/95">
			<button type="button" className="absolute inset-0 cursor-default" onClick={close} aria-label="Close preview" />
			<div className="relative flex flex-col h-full">
				<div className="flex items-center justify-between px-(--space-lg) py-(--space-md) border-b border-white/10">
					<span className="text-sm font-mono text-white/70">{context.label}</span>
					<div className="flex items-center gap-(--space-sm)">
						<span className="text-xs text-white/40 font-mono">Alt+Shift+J to close</span>
						<button
							type="button"
							onClick={handleCopy}
							className="px-(--space-sm) py-(--space-xs) text-xs font-mono rounded bg-white/10 text-white/80 hover:bg-white/20 transition-colors cursor-pointer"
						>
							{copied ? "Copied!" : "Copy"}
						</button>
					</div>
				</div>
				<pre className="flex-1 overflow-auto p-(--space-lg) m-0 text-sm font-mono text-white/90 whitespace-pre select-all">
					{jsonString}
				</pre>
			</div>
		</div>
	);
}
