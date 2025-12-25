"use client";

import { CursorField } from "@codaco/cursor-field/react";
import { env } from "~/env";

export function CursorFieldWrapper() {
	const partyHost = env.NEXT_PUBLIC_CURSOR_FIELD_HOST;

	if (!partyHost) {
		return null;
	}

	return (
		<CursorField
			partyHost={partyHost}
			room="documentation"
			lineColour="rgba(147, 51, 234, 0.6)"
			lineMaxOpacity={0.5}
			cursorSize={24}
		/>
	);
}
