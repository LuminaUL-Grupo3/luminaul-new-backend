import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

/** Ejecuta solo las pruebas de SPEC-04 sin cambiar la configuración compartida del equipo. */
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    globals: true,
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    include: [
      "src/modules/group-messaging/__tests__/*.spec.ts",
      "src/modules/group-messaging/gateways/room-presence.spec.ts",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/hu22",
      reporter: ["text-summary", "json", "json-summary", "html"],
      include: [
        "src/modules/group-messaging/repositories/groups.repository.ts",
        "src/modules/group-messaging/group-messaging.service.ts",
      ],
    },
  },
});
