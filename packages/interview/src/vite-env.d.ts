/// <reference types="vite/client" />

// `interface` is required (not `type`) so this declaration MERGES with
// the global Window from lib.dom.d.ts instead of replacing it. Biome's
// `useConsistentTypeDefinitions` rule must NOT flip this back.
// biome-ignore lint/style/useConsistentTypeDefinitions: declaration merging
interface Window {
	__e2eMap?: import("mapbox-gl").Map;
	__interviewStore?: import("@reduxjs/toolkit").Store<import("./store/store").RootState>;
}
