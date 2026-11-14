import { defineConfig } from 'vitest/config';
import shared from '../vitest.config.mts';
/** Pruebas de integración optativas; la configuración compartida permanece intacta. */
export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    fileParallelism: false,
    include: ['src/modules/administration/__tests__/notifications*.spec.ts'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
