import { Schema } from 'effect';

import { NonNegativeInt } from './primitives.ts';

export const MAX_REPORTED_FRAMES = 50;

export const REPORTED_ERROR_TYPE = /^[A-Za-z][\w.]{0,99}$/;

export const REPORTED_FUNCTION_NAME = /^[\w$.<>[\] -]{1,200}$/;

export const REPORTED_BUNDLE_PATH = /^\/assets\/[\w.-]{1,200}\.m?js$/;

export const REPORTED_CHUNK_ID = /^[\w-]{1,128}$/;

export const REPORTING_SURFACES = ['researcher', 'participant'] as const;

export const ReportedFrame = Schema.Struct({
  filename: Schema.String.check(Schema.isPattern(REPORTED_BUNDLE_PATH)),
  function: Schema.String.check(Schema.isPattern(REPORTED_FUNCTION_NAME)),
  lineno: Schema.optionalKey(NonNegativeInt),
  colno: Schema.optionalKey(NonNegativeInt),
  chunkId: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(REPORTED_CHUNK_ID)),
  ),
});
export type ReportedFrame = typeof ReportedFrame.Type;

export const ErrorReport = Schema.Struct({
  surface: Schema.Literals(REPORTING_SURFACES),
  type: Schema.String.check(Schema.isPattern(REPORTED_ERROR_TYPE)),
  frames: Schema.Array(ReportedFrame).check(
    Schema.isMaxLength(MAX_REPORTED_FRAMES),
  ),
});
export type ErrorReport = typeof ErrorReport.Type;
