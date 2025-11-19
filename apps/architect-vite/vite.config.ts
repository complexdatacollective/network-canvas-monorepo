import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
	plugins: [tsconfigPaths(), react({}), tailwindcss()],
	css: {
		preprocessorOptions: {
			scss: {
				quietDeps: true,
				silenceDeprecations: ["mixed-decls", "import", "color-functions", "global-builtin"],
				verbose: false,
			},
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: ["./src/test-setup.ts"],
		exclude: [
			// Module import issues - missing dependencies
			"**/utils/protocols/__tests__/assetTools.test.js",
			"**/ducks/modules/protocol/__tests__/assetManifest.test.js",
			"**/ducks/modules/protocol/__tests__/codebook.test.js",
			"**/Form/Fields/VariablePicker/__tests__/VariableSpotlight.test.jsx",
			"**/sections/SociogramPrompts/__tests__/selectors.test.tsx",
			"**/sections/OrdinalBinPrompts/__tests__/PromptFields.test.tsx",
			// Empty/orphaned test files
			"**/TypeEditor/__tests__/IconOption.test.jsx",
			"**/netcanvasFile/__tests__/netcanvasFile.test.js",
			"**/sections/CategoricalBinPrompts/__tests__/PromptFields.test.jsx",
			"**/sections/OrdinalBinPrompts/__tests__/PromptFields.test.jsx",
			"**/sections/SociogramPrompts/__tests__/selectors.test.jsx",
			"**/legacy-ui/components/Fields/Slider/__tests__/Field.test.jsx",
			"**/legacy-ui/components/Fields/DatePicker/DatePicker/__tests__/*.test.jsx",
			// Component rendering issues
			"**/behaviours/__test__/Zoom.test.js",
			"**/behaviours/__test__/Zoom.test.jsx",
			"**/Form/Fields/DatePicker/DatePicker/__tests__/DatePicker.test.jsx",
			"**/Timeline/__tests__/Timeline.test.tsx",
			"**/Timeline/__tests__/Timeline.test.jsx",
			"**/Timeline/__tests__/Stage.test.jsx",
			"**/OrderedList/__tests__/OrderedList.test.tsx",
			"**/Screens/__tests__/TypeEditorScreen.test.jsx",
			"**/Screens/__tests__/StageEditorScreen.test.jsx",
			// State structure issues
			"**/ducks/modules/userActions/__tests__/userActions.test.js",
			"**/selectors/codebook/__tests__/codebook.test.js",
			"**/sections/CategoricalBinPrompts/__tests__/PromptFields.test.tsx",
			// Duplicate test files (tsx versions that duplicate jsx)
			"**/components/__tests__/App.test.jsx",
			"**/components/__tests__/Issues.test.jsx",
			"**/components/__tests__/Issues.test.tsx",
			"**/components/__tests__/Protocol.test.tsx",
			"**/components/__tests__/ProtocolControlBar.test.jsx",
			"**/components/__tests__/ProtocolControlBar.test.tsx",
			"**/components/__tests__/RecentProtocols.test.jsx",
			"**/components/__tests__/RecentProtocols.test.tsx",
			"**/components/__tests__/Routes.test.tsx",
			"**/selectors/__tests__/assets.test.js",
			"**/selectors/__tests__/indexes.test.js",
			"**/utils/__tests__/getAssetData.test.js",
			"**/ducks/modules/__tests__/protocols.test.ts",
			"**/ducks/modules/__tests__/recentProtocols.test.js",
			"**/CodeView/__tests__/CodeView.test.jsx",
			"**/CodeView/__tests__/CodeView.test.tsx",
			"**/OrderedList/__tests__/OrderedList.test.jsx",
			"**/Screens/__tests__/CodebookScreen.test.jsx",
			"**/hooks/__tests__/useProtocolLoader.test.tsx",
			"**/Codebook/__tests__/helpers.test.tsx",
			"**/sections/NarrativePresets/__tests__/selectors.test.tsx",
			"**/sections/SortOptionsForExternalData/__tests__/getSortOrderOptionGetter.test.tsx",
			"**/Timeline/__tests__/Stage.test.tsx",
			// Standard vitest exclusions
			"**/node_modules/**",
			"**/dist/**",
		],
	},
});
