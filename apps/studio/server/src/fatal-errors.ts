import { logOperational } from './observability/logger.ts';
import type { ServerTelemetry } from './telemetry.ts';

/**
 * Executable-owned failure policy, also needed when telemetry is off. No
 * telemetry module installs process listeners. Removal is explicit for runtime
 * replacement/tests; SIGTERM/SIGINT remain the entrypoint's graceful policy.
 */
export function installFatalErrorHandlers(options: {
  telemetry: () => ServerTelemetry | undefined;
  stopServing: () => void;
}) {
  let failing = false;
  function fail(
    diagnostic: 'server_uncaught_exception' | 'server_unhandled_rejection',
    error: unknown,
  ) {
    if (failing) process.exit(1);
    failing = true;
    logOperational('STUDIO_PROCESS_FAILED');
    // Close admission before allowing any asynchronous telemetry work. This
    // also terminates upgraded sockets; an uncaught failure never carries on.
    try {
      options.stopServing();
    } catch {
      /* Fatal exit still happens. */
    }
    const reporter = options.telemetry();
    if (!reporter) process.exit(1);
    const deadline = setTimeout(() => process.exit(1), 1_000);
    try {
      reporter.capture(diagnostic, error);
    } catch {
      /* Fatal policy wins. */
    }
    void reporter
      .close()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(deadline);
        process.exit(1);
      });
  }
  const onException = (error: unknown) =>
    fail('server_uncaught_exception', error);
  const onRejection = (error: unknown) =>
    fail('server_unhandled_rejection', error);
  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onRejection);
  return () => {
    process.off('uncaughtException', onException);
    process.off('unhandledRejection', onRejection);
  };
}
