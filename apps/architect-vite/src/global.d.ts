// Browser environment type overrides - prevent Node.js globals from being available

// Remove Buffer from global scope to ensure it causes TypeScript errors in browser context
declare const Buffer: undefined;

// Remove other Node.js globals that shouldn't be available in browser
declare const process: undefined;
declare const global: undefined;
declare const __dirname: undefined;
declare const __filename: undefined;
declare const require: undefined;
declare const module: undefined;
declare const exports: undefined;
