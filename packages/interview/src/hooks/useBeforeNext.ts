"use client";

import { useContext, useEffect, useRef } from "react";
import { StageMetadataContext } from "../contexts/StageMetadataContext";
import type { BeforeNextFunction } from "../types";

export default function useBeforeNext(handler: BeforeNextFunction) {
	const registerBeforeNext = useContext(StageMetadataContext);
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		registerBeforeNext((direction) => handlerRef.current(direction));
		return () => registerBeforeNext(null);
	}, [registerBeforeNext]);
}
