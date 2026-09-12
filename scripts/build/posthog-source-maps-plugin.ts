import { dirname, resolve } from 'node:path';

import {
  resolveConfig,
  runSourcemapCli,
  type PluginConfig,
} from '@posthog/plugin-utils';
import type { Plugin } from 'vite';

/**
 * Upload every source map in a Vite output, including Web Workers.
 *
 * Vite generates worker bundles in memory and emits them into the parent build
 * as assets, so Rollup plugins attached to worker builds never receive a
 * writeBundle hook. Processing the completed output directory from the parent
 * hook includes both ordinary chunks and those worker assets. This still runs
 * before vite-plugin-pwa's closeBundle hook calculates precache revisions.
 */
export function createPostHogSourceMapsPlugin(options: PluginConfig): Plugin {
  const config = resolveConfig(options);
  const sourcemap = config.sourcemaps.deleteAfterUpload ? 'hidden' : true;

  return {
    name: 'network-canvas-posthog-source-maps',
    apply: 'build',
    config: () => ({ build: { sourcemap } }),
    outputOptions: {
      order: 'post',
      handler: (outputOptions) => ({ ...outputOptions, sourcemap }),
    },
    writeBundle: {
      sequential: true,
      handler: async (outputOptions) => {
        const outputDirectory = outputOptions.dir
          ? resolve(outputOptions.dir)
          : outputOptions.file
            ? dirname(resolve(outputOptions.file))
            : undefined;

        if (!outputDirectory) {
          throw new Error(
            'PostHog source-map upload requires an output directory or file.',
          );
        }

        await runSourcemapCli(config, { directory: outputDirectory });
      },
    },
  };
}
