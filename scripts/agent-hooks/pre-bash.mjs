#!/usr/bin/env node
// PreToolUse hook for shell commands: refuses whole-tree lint/typecheck/knip
// runs (the other hooks make them redundant and they cost minutes) and
// `git commit --no-verify`, explaining the alternative. Package-scoped runs,
// including those from inside a package directory, are allowed. AGENT_GATES=1
// in the command bypasses the refusal.
import {
  GATE_EXPLANATION,
  NO_VERIFY_EXPLANATION,
  classifyGateCommand,
  emit,
  readHookInput,
  recordCommandStart,
  resolveRepoRoot,
} from './lib.mjs';

const input = readHookInput();
const toolInput = input.tool_input ?? input.toolInput ?? {};
function commandText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  // Codex sends ["bash", "-lc", "<script>"]: classify the script itself.
  if (value.length === 3 && /^-[a-z]*c[a-z]*$/.test(value[1])) return value[2];
  return value.join(' ');
}
const command = commandText(toolInput.command ?? toolInput.cmd);

const root = resolveRepoRoot(input);
// The post-edit hook formats files a shell command wrote; it needs to know
// when the command started, not when it finished.
recordCommandStart(root, input.tool_use_id ?? input.toolUseId);
const verdict = classifyGateCommand(String(command), {
  cwd: toolInput.workdir ?? toolInput.cwd ?? input.cwd,
  root,
});
if (!verdict) process.exit(0);

const explanation =
  verdict.kind === 'no-verify' ? NO_VERIFY_EXPLANATION : GATE_EXPLANATION;
emit({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: `Refused \`${verdict.segment}\`. ${explanation}`,
  },
});
