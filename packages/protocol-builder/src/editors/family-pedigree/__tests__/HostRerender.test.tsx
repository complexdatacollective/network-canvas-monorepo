import { act, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import type { StageEditorProps } from '../../../stage-editor-contract.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { mountedAs } from '../../__tests__/formEditorHarness.tsx';
import { familyPedigreeStageEditor } from '../FamilyPedigreeStageEditor.ts';
import { shimMarkdownEditorMeasurement } from './editorFixtures.ts';

shimMarkdownEditorMeasurement();

/**
 * A host re-renders the editor whenever the editor's form changes: Architect
 * follows the draft from the page that mounts the editor, so every change to
 * the form re-renders the whole editor beneath it. An editor that changes its
 * form merely by being rendered again therefore never settles under such a
 * host — React gives up with "Maximum update depth exceeded" — while a
 * harness that does not follow the draft never sees anything wrong.
 *
 * The gender identity words were that editor: their field was handed a fresh
 * starting mapping on every render, and the form re-registers a field whose
 * starting value changes identity, which is a form change.
 */
let rerenderHost: (() => void) | undefined;
let formChanges = 0;

function FormChangeCounter() {
  const { storeApi } = useStageEditorForm();
  useEffect(
    () =>
      storeApi.subscribe(() => {
        formChanges += 1;
      }),
    [storeApi],
  );
  return null;
}

const FamilyPedigreeEditor = familyPedigreeStageEditor.FamilyPedigree;

function RerenderingHost(props: StageEditorProps<'FamilyPedigree'>) {
  const [, setRenders] = useState(0);
  rerenderHost = () => setRenders((renders) => renders + 1);
  const { header } = props;
  return (
    <FamilyPedigreeEditor
      {...props}
      header={(context) => (
        <>
          {header?.(context)}
          <FormChangeCounter />
        </>
      )}
    />
  );
}

describe('the family pedigree stage editor under a host that re-renders it', () => {
  it('leaves its form unchanged when it is rendered again', async () => {
    renderStageEditor({
      stageId: 'family-pedigree-1',
      editor: mountedAs(RerenderingHost),
    });

    // The fixture binds a gender identity attribute, so its words are shown.
    await screen.findByRole('table', {
      name: 'Words for each gender identity',
    });
    await act(async () => {});
    formChanges = 0;

    for (let render = 0; render < 3; render += 1) {
      act(() => rerenderHost?.());
    }
    await act(async () => {});

    expect(formChanges).toBe(0);
  });
});
