import { useCallback, useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useAppSelector } from "~/ducks/hooks";
import { getProtocol, getStage } from "~/selectors/protocol";

type JsonPreviewContext = {
	label: string;
	data: unknown;
} | null;

export function useJsonPreview() {
	const [isOpen, setIsOpen] = useState(false);

	const [, stageParams] = useRoute("/protocol/stage/:stageId");
	const stageId = stageParams?.stageId;
	const isStageRoute = !!stageId && stageId !== "new";

	const protocol = useAppSelector(getProtocol);
	const stage = useAppSelector((state) => (isStageRoute ? getStage(state, stageId) : null));

	const context: JsonPreviewContext =
		isStageRoute && stage
			? { label: "Stage JSON", data: stage }
			: protocol
				? { label: "Protocol JSON", data: protocol }
				: null;

	const toggle = useCallback(() => {
		setIsOpen((prev) => !prev);
	}, []);

	const close = useCallback(() => {
		setIsOpen(false);
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.altKey && e.shiftKey && e.code === "KeyJ") {
				e.preventDefault();
				toggle();
			}

			if (e.key === "Escape" && isOpen) {
				e.preventDefault();
				close();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, toggle, close]);

	return { isOpen, context, close };
}
