import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `netlify dev` serves the functions; run it from the repo root with
// `npx netlify dev --filter @codaco/sketch` to get /api/* locally.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5186,
  },
});
