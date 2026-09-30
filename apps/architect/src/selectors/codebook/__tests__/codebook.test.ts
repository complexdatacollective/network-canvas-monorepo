import { afterEach, describe, expect, it } from 'vitest';

import type { Codebook, Stage } from '@codaco/protocol-validation';
import {
  closeStageDraft,
  publishStageDraft,
} from '~/components/StageEditor/stageDraftBeacon';
import type { RootState } from '~/ducks/modules/root';

import {
  getAllVariablesByUUID,
  getVariableOptionsForSubject,
  makeGetVariable,
} from '..';
import testState from '../../../__tests__/testState.json' with { type: 'json' };

describe('codebook selectors', () => {
  describe('getVariableOptionsForSubject()', () => {
    it('extracts variables for nodeType into options list for node entity', () => {
      const subject = {
        type: 'bar',
        entity: 'node' as const,
      };

      const result = getVariableOptionsForSubject(
        testState as unknown as RootState,
        subject,
      );

      expect(result).toMatchSnapshot();
    });

    it('extracts variables for nodeType into options list for ego entity', () => {
      const subject = {
        type: undefined,
        entity: 'ego' as const,
      };

      const result = getVariableOptionsForSubject(
        testState as unknown as RootState,
        subject,
      );

      expect(result).toMatchSnapshot();
    });

    // The stage editor publishes its whole document on every change to its
    // form, and every mounted consumer of variable options selects through
    // this selector — so its identity must hold across the publications that
    // change nothing relevant, or each keystroke re-renders every picker and
    // prompt editor.
    describe('identity across published stage drafts', () => {
      const subject = { type: 'bar', entity: 'node' as const };
      const state = testState as unknown as RootState;
      const publish = (fields: Record<string, unknown>) => {
        publishStageDraft(
          { id: 'stage-1', type: 'Information', ...fields } as unknown as Stage,
          {},
          fields,
        );
      };

      afterEach(() => {
        closeStageDraft();
      });

      it('returns the identical array and elements when only the published draft identity changes', () => {
        publish({ draftPromptText: 'still typing' });
        const resultA = getVariableOptionsForSubject(state, subject);
        // The same document again: a keystroke that changed nothing about
        // which variables are named.
        publish({ draftPromptText: 'still typing' });
        const resultB = getVariableOptionsForSubject(state, subject);

        expect(resultB).toBe(resultA);
        expect(resultB[0]).toBe(resultA[0]);
      });

      it('still recomputes when a live value starts referencing a variable', () => {
        // 'charlie' is defined on node/bar but referenced by no stage, so a
        // live value naming it must flip its isUsed — the intentional
        // live-stage reactivity the identity fix must not break.
        publish({ draftPromptText: 'still typing' });
        const resultBefore = getVariableOptionsForSubject(state, subject);
        publish({ someField: 'charlie' });
        const resultAfter = getVariableOptionsForSubject(state, subject);

        expect(resultAfter).not.toBe(resultBefore);
        expect(
          resultBefore.find((option) => option.value === 'charlie')?.isUsed,
        ).toBe(false);
        expect(
          resultAfter.find((option) => option.value === 'charlie')?.isUsed,
        ).toBe(true);
      });
    });
  });

  describe('getAllVariablesByUUID()', () => {
    it('returns all variables by UUID', () => {
      const result = getAllVariablesByUUID(
        testState.activeProtocol.present.codebook as unknown as Codebook,
      );

      expect(result).toMatchSnapshot();
    });

    it('handles missing codebook', () => {
      const result = getAllVariablesByUUID(undefined as unknown as Codebook);

      expect(result).toMatchSnapshot();
    });

    it('handles missing nodeTypes', () => {
      const result = getAllVariablesByUUID({
        edge: {},
        ego: {},
      } as unknown as Codebook);

      expect(result).toMatchSnapshot();
    });

    it('handles missing edgeTypes', () => {
      const result = getAllVariablesByUUID({
        node: {},
        ego: {},
      } as unknown as Codebook);

      expect(result).toMatchSnapshot();
    });

    it('handles missing ego', () => {
      const result = getAllVariablesByUUID({
        node: {},
        edge: {},
      } as unknown as Codebook);

      expect(result).toMatchSnapshot();
    });

    it('handles missing variables', () => {
      const result = getAllVariablesByUUID({
        node: {
          foo: {},
        },
        edge: {
          bar: {},
        },
        ego: {},
      } as unknown as Codebook);

      expect(result).toMatchSnapshot();
    });
  });

  describe('makeGetVariable()', () => {
    it('returns a variable by UUID', () => {
      const result = makeGetVariable('foo')(testState as unknown as RootState);

      expect(result).toMatchSnapshot();
    });

    it('returns null if variable is not found', () => {
      const result = makeGetVariable('not found')(
        testState as unknown as RootState,
      );

      expect(result).toBeNull();
    });

    // `makeGetVariable` returns null when there is no codebook; it used to
    // throw only because reading the protocol off an empty state threw first.
    // The protocol accessors tolerate an unpopulated store now, so the
    // function's own contract is what shows through.
    it('returns null if there is no codebook', () => {
      expect(makeGetVariable('foo')({} as unknown as RootState)).toBeNull();
    });
  });
});
