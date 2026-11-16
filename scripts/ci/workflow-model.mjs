import { readdirSync, readFileSync } from 'node:fs';

import { parse } from 'yaml';

// Lookups over parsed GitHub Actions workflows for the guard suites. They
// assert on job and step objects rather than on the YAML text, and every
// step's `run` and github-script `script` has its whole-line comments removed
// when the file is read. So a YAML comment, a shell or JavaScript comment line,
// or a step switched off with one of the `if` forms below cannot stand in for
// the real thing, and a missing job or step throws instead of handing
// `undefined` to an assertion. A condition that is false for a less obvious
// reason (`if: ${{ !true }}`) is not recognised.

export const WORKFLOW_DIR = new URL(
  '../../.github/workflows/',
  import.meta.url,
);

/** Source without its whole-line `#` (shell, Dockerfile) or `//` comments. */
export function codeOf(source) {
  return source
    .split('\n')
    .filter((line) => !/^\s*(?:#|\/\/)/.test(line))
    .join('\n');
}

function stripStepComments(steps) {
  if (!Array.isArray(steps)) return;
  for (const step of steps) {
    if (typeof step?.run === 'string') step.run = codeOf(step.run);
    if (typeof step?.with?.script === 'string') {
      step.with.script = codeOf(step.with.script);
    }
  }
}

/** A workflow or composite action, with step comments removed. */
export function readActionsYaml(url) {
  const document = parse(readFileSync(url, 'utf8'));
  for (const job of Object.values(document?.jobs ?? {})) {
    stripStepComments(job?.steps);
  }
  stripStepComments(document?.runs?.steps);
  return document;
}

export function readWorkflow(file) {
  return readActionsYaml(new URL(file, WORKFLOW_DIR));
}

export function workflowFiles() {
  return readdirSync(WORKFLOW_DIR).filter((file) => /\.ya?ml$/.test(file));
}

// `if: false`, `if: 'false'`, `if: ${{ false }}` and a condition that starts
// `false &&` can never be true (GitHub evaluates a quoted scalar as an
// expression too), so the job or step they guard does not exist for our
// purposes.
const NEVER = /^\s*(?:\$\{\{\s*)?(?:false|0)\s*(?:\}\}\s*$|&&|$)/;

function isDisabled(entity) {
  const condition = entity?.if;
  if (condition === false || condition === 0) return true;
  return typeof condition === 'string' && NEVER.test(condition);
}

export function getJob(workflow, name) {
  const job = workflow.jobs?.[name];
  if (job === undefined || job === null) {
    throw new Error(`the workflow has no job "${name}"`);
  }
  if (isDisabled(job)) {
    throw new Error(`job "${name}" is disabled by its if: ${job.if}`);
  }
  return job;
}

export function hasJob(workflow, name) {
  const job = workflow.jobs?.[name];
  return job !== undefined && job !== null && !isDisabled(job);
}

export function needsOf(job) {
  if (job.needs === undefined) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

function describe(matcher) {
  if (typeof matcher === 'function') return 'matching the predicate';
  return Object.entries(matcher)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(', ');
}

function matches(step, matcher) {
  if (typeof matcher === 'function') return matcher(step);
  return Object.entries(matcher).every(([key, expected]) => {
    const actual = step[key];
    if (expected instanceof RegExp) {
      return typeof actual === 'string' && expected.test(actual);
    }
    if (key === 'uses' && typeof actual === 'string') {
      // `uses: owner/action` matches any pinned ref of that action.
      return actual === expected || actual.startsWith(`${expected}@`);
    }
    return actual === expected;
  });
}

/** Every step of the job that is not switched off. */
export function liveSteps(job) {
  if (!Array.isArray(job.steps)) {
    throw new Error('the job has no steps (is it a reusable-workflow call?)');
  }
  return job.steps.filter((step) => !isDisabled(step));
}

export function findSteps(job, matcher) {
  return liveSteps(job).filter((step) => matches(step, matcher));
}

/** The first live step matching `matcher`; throws when there is none. */
export function getStep(job, matcher) {
  const [step] = findSteps(job, matcher);
  if (step === undefined) {
    throw new Error(`no live step ${describe(matcher)}`);
  }
  return step;
}

/** The position of `getStep(job, matcher)` among the job's steps. */
export function stepIndex(job, matcher) {
  return job.steps.indexOf(getStep(job, matcher));
}

/** The shell and github-script source of the job's live steps. */
export function scriptsOf(job) {
  return liveSteps(job)
    .flatMap((step) => [step.run, step.with?.script])
    .filter((source) => typeof source === 'string')
    .join('\n');
}
