// Prompt texts are Markdown files imported as strings: Vite and vitest load
// them through the markdownText plugin (vitest.config.ts), esbuild through
// its text loader (scripts/bundle-functions.mjs).
declare module '*.md' {
  const text: string;
  export default text;
}
