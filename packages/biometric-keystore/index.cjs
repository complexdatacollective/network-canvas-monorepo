'use strict';

const { platform, arch } = process;
const { join } = require('node:path');
const { existsSync } = require('node:fs');

function unavailable(reason) {
  return {
    isAvailable: async () => false,
    store: async () => {
      throw new Error(reason);
    },
    load: async () => {
      throw new Error(reason);
    },
    delete: async () => {
      throw new Error(reason);
    },
  };
}

if (platform !== 'darwin') {
  module.exports = unavailable(
    `biometric-keystore: native module is only built for darwin (got ${platform})`,
  );
} else {
  const binaryName =
    arch === 'arm64'
      ? 'biometric-keystore.darwin-arm64.node'
      : 'biometric-keystore.darwin-x64.node';
  const binaryPath = join(__dirname, binaryName);
  if (!existsSync(binaryPath)) {
    module.exports = unavailable(
      `biometric-keystore: native binary missing at ${binaryPath}. Run "pnpm --filter @codaco/biometric-keystore build".`,
    );
  } else {
    module.exports = require(binaryPath);
  }
}
