import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../../migration/migrate-protocol.ts';
import { toReportableProtocolError } from '../reportableProtocolError.ts';

function migrationError() {
  try {
    migrateProtocol(
      {
        schemaVersion: 7,
        name: 'Private Study',
        stages: 'not-an-array',
        codebook: { node: { secret_variable_name: {} } },
      },
      9,
    );
  } catch (error) {
    return error;
  }
  throw new Error('expected the migration to fail');
}

describe('toReportableProtocolError', () => {
  it('keeps the name and frames, and drops the message', () => {
    const original = migrationError();
    expect(original).toBeInstanceOf(Error);
    const reportable = toReportableProtocolError(original);

    expect(reportable.name).toBe((original as Error).name);
    expect(reportable.message).toBe(
      'Protocol could not be opened or upgraded (invalidBeforeUpgrade).',
    );
    expect(reportable.stack).toMatch(/^\w+: Protocol could not be opened/);
    expect(reportable.stack).toMatch(/\n\s+at /);
    expect(reportable.stack).not.toContain((original as Error).message);
  });

  it('copies the cause chain the same way, so nothing below leaks either', () => {
    const wrapper = new Error('Failed to migrate "Private Study" (id=cm-1)', {
      cause: migrationError(),
    });
    const reportable = toReportableProtocolError(wrapper);
    const all = JSON.stringify([
      reportable.message,
      reportable.stack,
      (reportable.cause as Error).name,
      (reportable.cause as Error).message,
      (reportable.cause as Error).stack,
    ]);

    expect((reportable.cause as Error).name).toBe('ValidationError');
    expect(all).not.toMatch(/Private Study|cm-1|stages|not-an-array/);
  });

  it('stops following a cause chain that never ends', () => {
    const looping = new Error('loop');
    Object.assign(looping, { cause: looping });
    expect(() => toReportableProtocolError(looping)).not.toThrow();
  });
});
