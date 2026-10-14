import { Predicate } from 'effect';

type ReportStageCrash = () => void;

let activeReporter: ReportStageCrash | undefined;

export const reportStageCrashesTo = (
  report: ReportStageCrash,
): (() => void) => {
  activeReporter = report;
  return () => {
    if (activeReporter === report) activeReporter = undefined;
  };
};

export const isStageErrorBoundary = (boundary: unknown): boolean => {
  if (!Predicate.hasProperty(boundary, 'props')) return false;
  const { props } = boundary;
  return (
    Predicate.hasProperty(props, 'captureException') &&
    Predicate.isFunction(props.captureException) &&
    Predicate.hasProperty(props, 'isOffline') &&
    Predicate.isBoolean(props.isOffline)
  );
};

export const reportCaughtStageCrash = (boundary: unknown): void => {
  if (isStageErrorBoundary(boundary)) activeReporter?.();
};
