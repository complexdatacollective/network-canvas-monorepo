import { renderSchemaDocs, writeSchemaDocs } from './schema-docs.ts';

const artifacts = await renderSchemaDocs();
writeSchemaDocs(artifacts);

console.log(`Wrote the Studio ERD and README schema section.`);
console.log(`Schema fingerprint: ${artifacts.fingerprint}`);
