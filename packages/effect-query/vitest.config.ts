import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The adapter's hooks render through @testing-library/react.
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
});
