import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
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

    // `StageFormBridge` mirrors the stage form's live values into Redux on a
    // debounce while the researcher types, replacing
    // `stageEditorDraft.ui.liveValues` with a new object per tick even when
    // nothing relevant changed. Every mounted consumer of variable options
    // selects through this selector, so its identity must hold across those
    // ticks or each keystroke re-renders every picker and prompt editor.
    describe('identity across live-value mirror ticks', () => {
      const subject = { type: 'bar', entity: 'node' as const };
      const withLiveValues = (liveValues: Record<string, unknown> | null) => ({
        ...testState,
        stageEditorDraft: {
          ...testState.stageEditorDraft,
          ui: { ...testState.stageEditorDraft.ui, liveValues },
        },
      });

      it('returns the identical array and elements when only the liveValues object identity changes', () => {
        // Content-equal but referentially distinct: a mirror tick that
        // changed nothing.
        const tickA = withLiveValues({ draftPromptText: 'still typing' });
        const tickB = withLiveValues({ draftPromptText: 'still typing' });

        const resultA = getVariableOptionsForSubject(
          tickA as unknown as RootState,
          subject,
        );
        const resultB = getVariableOptionsForSubject(
          tickB as unknown as RootState,
          subject,
        );

        expect(resultB).toBe(resultA);
        expect(resultB[0]).toBe(resultA[0]);
      });

      it('still recomputes when a live value starts referencing a variable', () => {
        // 'charlie' is defined on node/bar but referenced by no stage, so a
        // live value naming it must flip its isUsed — the intentional
        // live-stage reactivity the identity fix must not break.
        const before = withLiveValues({ draftPromptText: 'still typing' });
        const after = withLiveValues({ someField: 'charlie' });

        const resultBefore = getVariableOptionsForSubject(
          before as unknown as RootState,
          subject,
        );
        const resultAfter = getVariableOptionsForSubject(
          after as unknown as RootState,
          subject,
        );

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

    it('returns error if codebook is not found', () => {
      expect(() =>
        makeGetVariable('foo')({} as unknown as RootState),
      ).toThrow();
    });
  });
});
