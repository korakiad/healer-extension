import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      vscode: resolve(__dirname, "test/__mocks__/vscode.ts"),
    },
  },
});
