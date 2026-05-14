// Electron-builder configuration for the Modern Interviewer desktop app.
// Used by the `electron:dist*` scripts in package.json.
/** @type {import('electron-builder').Configuration} */
module.exports = {
	appId: "org.complexdatacollective.networkcanvas.modern-interviewer",
	productName: "Network Canvas Interviewer",
	copyright: "Copyright © 2026 Complex Data Collective",
	directories: {
		buildResources: "build-resources",
		output: "release-builds",
	},
	files: ["out/**/*", "package.json"],
	asar: true,
	fileAssociations: [
		{
			ext: "netcanvas",
			name: "Network Canvas Protocol",
			description: "Network Canvas interview protocol",
			role: "Editor",
		},
	],
	mac: {
		category: "public.app-category.education",
		target: [
			{ target: "dmg", arch: ["x64", "arm64"] },
			{ target: "zip", arch: ["x64", "arm64"] },
		],
	},
	win: {
		target: [{ target: "nsis", arch: ["x64"] }],
	},
	linux: {
		target: ["AppImage", "deb", "rpm"],
		category: "Education",
	},
};
