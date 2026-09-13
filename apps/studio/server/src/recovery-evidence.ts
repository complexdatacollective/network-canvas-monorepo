import { runRecoveryEvidenceTool } from './recovery/evidence-tool.ts';

try {
  process.stdout.write(
    `${await runRecoveryEvidenceTool(process.argv.slice(2))}\n`,
  );
} catch {
  process.stderr.write('STUDIO_RECOVERY_EVIDENCE_TOOL_FAILED\n');
  process.exitCode = 1;
}
