"use client";

import { useContext } from "react";
import { AnalyticsContext } from "./AnalyticsContext";

export function useTrack() {
	const tracker = useContext(AnalyticsContext);
	return tracker.track;
}

export function useCaptureException() {
	const tracker = useContext(AnalyticsContext);
	return tracker.captureException;
}
