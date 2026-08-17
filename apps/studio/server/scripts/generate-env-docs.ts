import { readFileSync, writeFileSync } from 'node:fs';

import {
  ENV_DEVELOPMENT_PATH,
  ENV_EXAMPLE_PATH,
  README_PATH,
  renderEnvDevelopment,
  renderEnvExample,
  renderReadmeSection,
  spliceReadme,
} from './env-docs.ts';

writeFileSync(ENV_DEVELOPMENT_PATH, renderEnvDevelopment());
writeFileSync(ENV_EXAMPLE_PATH, renderEnvExample());
writeFileSync(
  README_PATH,
  spliceReadme(readFileSync(README_PATH, 'utf8'), renderReadmeSection()),
);

console.log(
  'Wrote .env.development, .env.example, and the README env section.',
);
