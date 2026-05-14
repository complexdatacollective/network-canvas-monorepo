import { defineConfig } from "cva";
import { twMerge } from "tailwind-merge";

// Mirrors `packages/fresco-ui/src/utils/cva.ts`. Only the exports actively
// used by architect-vite are re-exported here; add `compose` back when an
// area migration needs it.
const config = defineConfig({
	hooks: {
		onComplete: (className) => twMerge(className),
	},
});

export const { cva, cx } = config;
export type { VariantProps } from "cva";
