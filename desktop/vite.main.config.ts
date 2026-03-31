import path from "path";
import type { ConfigEnv, UserConfig } from "vite";
import { defineConfig, mergeConfig } from "vite";

import { builtins, getBuildConfig, getBuildDefine, pluginHotRestart } from "./vite.base.config";

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<"build">;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);
  const config: UserConfig = {
    build: {
      lib: {
        entry: forgeConfigSelf.entry,
        fileName: () => "[name].js",
        formats: ["cjs"],
      },
      rollupOptions: {
        // The packaged app does not ship runtime node_modules in Resources,
        // so bundle all non-builtin dependencies into the main bundle.
        external: builtins,
      },
    },
    plugins: [pluginHotRestart("restart")],
    define,
    resolve: {
      // Load the Node.js entry.
      mainFields: ["module", "jsnext:main", "jsnext"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
