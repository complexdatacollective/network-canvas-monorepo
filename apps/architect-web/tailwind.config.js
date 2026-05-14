/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}", "./src/**/*.css"],
	// Add safelist for commonly used theme variables
	safelist: [
		// Force inclusion of theme variables
		{ pattern: /^(text|bg|border|space|color)-/ },
	],
};
