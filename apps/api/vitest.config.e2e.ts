import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    // e2e tests share the same DB, must run sequentially to avoid FK conflicts
    fileParallelism: false,
    // Each e2e suite loads the full NestJS AppModule (Prisma + BullMQ) and needs more heap
    // Run: NODE_OPTIONS="--max-old-space-size=4096" npm run test:e2e
  },
});
