import { describe, expect, it } from 'vitest';

import {
  appSettingPreprocessedSchema,
  createUploadThingTokenFormSchema,
} from '../appSettings';

describe('App Settings Schema Validators', () => {
  describe('App Setting Preprocessed Schema', () => {
    const storedSettings = {
      configured: 'true',
      allowAnonymousRecruitment: 'false',
      limitInterviews: 'true',
      initializedAt: '2023-10-01T00:00:00.000Z',
      installationId: 'installation123',
      disableAnalytics: 'true',
    };

    it('rejects an initializedAt that is not a date', () => {
      const result = appSettingPreprocessedSchema.safeParse({
        ...storedSettings,
        initializedAt: 'invalid-date',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([
        ['initializedAt'],
      ]);
    });

    it('preprocesses stored strings into booleans and dates, and defaults the settings that are absent', () => {
      expect(appSettingPreprocessedSchema.parse(storedSettings)).toEqual({
        configured: true,
        allowAnonymousRecruitment: false,
        limitInterviews: true,
        initializedAt: new Date('2023-10-01T00:00:00.000Z'),
        installationId: 'installation123',
        disableAnalytics: true,
        disableSmallScreenOverlay: false,
        freezeInterviewsAfterCompletion: true,
        enableInterviewDataApi: false,
      });
    });
  });
  describe('UPLOADTHING_TOKEN Parsing through Schema', () => {
    it("should parse token value from UPLOADTHING_TOKEN='token'", () => {
      const result = createUploadThingTokenFormSchema.parse({
        uploadThingToken: "UPLOADTHING_TOKEN='ABCD1234Token'",
      });
      expect(result.uploadThingToken).toBe('ABCD1234Token');
    });

    it('should remove surrounding quotes', () => {
      const result = createUploadThingTokenFormSchema.parse({
        uploadThingToken: "'ABCD1234Token'",
      });
      expect(result.uploadThingToken).toBe('ABCD1234Token');
    });

    it('should not change already correct tokens', () => {
      const result = createUploadThingTokenFormSchema.parse({
        uploadThingToken: 'ABCD1234Token',
      });
      expect(result.uploadThingToken).toBe('ABCD1234Token');
    });
  });
});
