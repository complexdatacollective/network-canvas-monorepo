import { Option, Schema } from 'effect';

const StudySettings = Schema.Struct({
  participantAnalytics: Schema.optionalKey(Schema.Boolean),
});

const decodeSettings = Schema.decodeUnknownOption(StudySettings);

export const participantAnalyticsEnabled = (settings: unknown): boolean =>
  Option.match(decodeSettings(settings), {
    onNone: () => false,
    onSome: (decoded) => decoded.participantAnalytics ?? true,
  });

export const studySettings = (input: {
  readonly participantAnalytics: boolean;
}): typeof StudySettings.Type => ({
  participantAnalytics: input.participantAnalytics,
});
