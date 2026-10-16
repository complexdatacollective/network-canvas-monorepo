import { describe, expect, it } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { messageFields } from '~/test/messageText';

import {
  getFinishStageDeleteBlockedReason,
  getFinishStageReorderWarning,
} from '../finishStageGuards';

const english = createAppIntl({ locale: 'en' });

const intro = { id: 'intro', type: 'Information' as const };
const names = { id: 'names', type: 'NameGenerator' as const };
const finish = { id: 'finish', type: 'FinishSession' as const };
const stages = [intro, names, finish];

describe('Timeline finish stage guards', () => {
  it('explains why the only finish stage cannot be deleted', () => {
    const reason = getFinishStageDeleteBlockedReason(stages, 'finish');
    expect(reason && english.formatMessage(reason)).toBe(
      "You cannot delete this 'finish interview' stage because at least one stage of this kind is required to allow the interview to end.",
    );
  });

  it('lets any other stage, or one of two finish stages, be deleted', () => {
    expect(getFinishStageDeleteBlockedReason(stages, 'names')).toBeNull();
    expect(
      getFinishStageDeleteBlockedReason(
        [...stages, { ...finish, id: 'finish-2' }],
        'finish',
      ),
    ).toBeNull();
  });

  it('refuses an order that moves the finish stage off the end, or a stage after it', () => {
    const refusal = {
      title: 'Cannot move stage',
      description:
        'Stages that end the interview have to stay together at the end of the protocol. No participant could reach a stage placed after them.',
    };
    expect(
      messageFields(
        getFinishStageReorderWarning(stages, [intro, finish, names]),
      ),
    ).toEqual(refusal);
    expect(
      messageFields(
        getFinishStageReorderWarning(stages, [finish, intro, names]),
      ),
    ).toEqual(refusal);
  });

  it('accepts reordering the stages before the finish stage', () => {
    expect(
      getFinishStageReorderWarning(stages, [names, intro, finish]),
    ).toBeNull();
  });

  // Several finish stages can end an interview in different ways. They change
  // places freely among themselves, but none goes above the first of them.
  describe('with several finish stages', () => {
    const ineligible = { id: 'ineligible', type: 'FinishSession' as const };
    const ended = { id: 'ended', type: 'FinishSession' as const };
    const endings = [intro, names, finish, ineligible, ended];

    it('accepts any order of the finish stages among themselves', () => {
      expect(
        getFinishStageReorderWarning(endings, [
          intro,
          names,
          ended,
          finish,
          ineligible,
        ]),
      ).toBeNull();
      expect(
        getFinishStageReorderWarning(endings, [
          intro,
          names,
          ineligible,
          ended,
          finish,
        ]),
      ).toBeNull();
    });

    it('refuses a finish stage above the first of them, or another stage among them', () => {
      expect(
        getFinishStageReorderWarning(endings, [
          intro,
          ended,
          names,
          finish,
          ineligible,
        ]),
      ).not.toBeNull();
      expect(
        getFinishStageReorderWarning(endings, [
          intro,
          finish,
          names,
          ineligible,
          ended,
        ]),
      ).not.toBeNull();
    });
  });
});
