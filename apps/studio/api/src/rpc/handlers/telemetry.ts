import { Effect, Option } from 'effect';

import { TelemetryRpcs } from '@codaco/studio-contract/rpc/telemetry';
import type { ErrorReport } from '@codaco/studio-contract/schema/telemetry';

import { clientAddress } from '../../http/middleware/rate-limit.ts';
import {
  ErrorReporter,
  type ReportedException,
  requestOrigin,
} from '../../platform/error-reporter.ts';
import { enforceRateLimit } from '../../rate-limit/enforce.ts';

const browserException = (report: ErrorReport): ReportedException => ({
  type: report.type,
  platform: 'web:javascript',
  frames: report.frames.map((frame) => ({
    filename: frame.filename,
    function: frame.function,
    lineno: frame.lineno,
    colno: frame.colno,
    chunkId: frame.chunkId,
    inApp: true,
  })),
});

export const TelemetryHandlers = TelemetryRpcs.toLayer({
  'telemetry.report': (report) =>
    Effect.gen(function* () {
      yield* enforceRateLimit('error_report_address', yield* clientAddress);
      const reporter = yield* Effect.serviceOption(ErrorReporter);
      if (Option.isNone(reporter)) return;
      const context = yield* Effect.context();
      yield* reporter.value.reportException(browserException(report), {
        ...requestOrigin(context),
        origin: 'browser',
        surface: report.surface,
      });
    }),
});
