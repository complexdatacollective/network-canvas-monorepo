import { runMonthAuthorizationTool } from './observability-anchor-operator.mjs';

try {
  process.stdout.write(
    `${await runMonthAuthorizationTool(process.argv.slice(2))}\n`,
  );
} catch {
  process.stderr.write('ANCHOR_MONTH_AUTHORIZATION_TOOL_FAILED\n');
  process.exitCode = 1;
}
