import { useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import { previewUploadFailed, previewUploadStarted, previewUploadSucceeded } from "~/ducks/modules/preview";
import { getProtocol } from "~/selectors/protocol";
import { uploadProtocolForPreview } from "~/utils/preview/uploadPreview";

const DEBOUNCE_MS = 2000;

type Props = {
	stageIndex?: number;
};

function stableHash(value: unknown): string {
	return JSON.stringify(value);
}

export default function PreviewIframe({ stageIndex = 0 }: Props) {
	const dispatch = useAppDispatch();
	const protocol = useAppSelector(getProtocol);
	const { status, url, error, lastUploadedHash } = useAppSelector((s) => s.preview);

	const latestHash = useRef<string>("");
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inflight = useRef<AbortController | null>(null);

	const runUpload = useCallback(
		async (hash: string) => {
			if (!protocol) return;
			inflight.current?.abort();
			const controller = new AbortController();
			inflight.current = controller;
			dispatch(previewUploadStarted({ hash }));
			try {
				const result = await uploadProtocolForPreview(protocol, stageIndex);
				if (controller.signal.aborted) return;
				if (result.status === "ready") {
					dispatch(previewUploadSucceeded({ url: result.previewUrl, hash, at: Date.now() }));
				} else {
					dispatch(previewUploadFailed({ error: "Upload failed" }));
				}
			} catch (err) {
				if (controller.signal.aborted) return;
				dispatch(previewUploadFailed({ error: err instanceof Error ? err.message : "Upload failed" }));
			}
		},
		[dispatch, protocol, stageIndex],
	);

	useEffect(() => {
		if (!protocol) return;
		const hash = `${stableHash(protocol)}|stage=${stageIndex}`;
		if (hash === latestHash.current && hash === lastUploadedHash) return;
		latestHash.current = hash;
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			void runUpload(hash);
		}, DEBOUNCE_MS);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [protocol, stageIndex, lastUploadedHash, runUpload]);

	const onRetry = useCallback(() => {
		if (!protocol) return;
		void runUpload(latestHash.current);
	}, [protocol, runUpload]);

	return (
		<div className="relative h-full w-full" style={{ background: "#F3EFF6" }}>
			{status === "error" && (
				<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
					<div className="font-heading text-sm font-bold" style={{ color: "hsl(240 35% 17%)" }}>
						Preview unavailable
					</div>
					<div className="text-xs" style={{ color: "hsl(220 4% 44%)" }}>
						{error}
					</div>
					<button
						type="button"
						onClick={onRetry}
						className="rounded-full bg-white px-4 py-1.5 font-heading text-xs font-bold uppercase tracking-[0.15em]"
						style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
					>
						Retry
					</button>
				</div>
			)}

			{status !== "error" && !url && (
				<div
					data-testid="preview-skeleton"
					className="flex h-full items-center justify-center text-xs"
					style={{ color: "hsl(220 4% 44%)" }}
				>
					{status === "uploading" ? "Preparing preview…" : "Loading preview…"}
				</div>
			)}

			{url && <iframe title="Protocol preview" src={url} className="h-full w-full border-0" />}

			{status === "uploading" && url && (
				<div
					className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 font-heading text-[10px] font-bold uppercase tracking-[0.15em]"
					style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)", color: "hsl(220 4% 44%)" }}
				>
					Updating…
				</div>
			)}
		</div>
	);
}
