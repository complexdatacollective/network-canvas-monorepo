#!/usr/bin/env node
// Asks the deployed service whether it answers Architect and nobody else,
// and keeps asking until it does or the time runs out. The release job runs
// it straight after `wrangler deploy`: a first deploy attaches the custom
// domain, whose DNS record and certificate take a few minutes to answer.
//
// Run with Node's own TypeScript support (no build): `pnpm check:deployment`.
import { deploymentProblems } from '../src/deployment-check.ts';

const DEADLINE_MS = 10 * 60 * 1000;
const RETRY_MS = 10 * 1000;

const attempt = async () => {
  try {
    return await deploymentProblems((url, init) => fetch(url, init));
  } catch (error) {
    // The host does not resolve or the certificate is not issued yet.
    return [`The service could not be reached: ${error?.cause ?? error}`];
  }
};

const startedAt = Date.now();
let problems = await attempt();
while (problems.length > 0 && Date.now() - startedAt < DEADLINE_MS) {
  console.log(`Not answering yet (${problems[0]}); asking again.`);
  await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  problems = await attempt();
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(
  'The deployed service answers Architect and refuses other origins.',
);
