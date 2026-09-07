import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import StageNameSection from '../../sections/StageNameSection.tsx';
import type {
  StageEditorComponent,
  StageEditorProps,
} from '../../stage-editor-contract.ts';
import {
  renderStageEditor,
  type RenderStageEditorOptions,
} from '../renderStageEditor.tsx';

const InformationEditor: StageEditorComponent<'Information'> = ({
  stageType,
}: StageEditorProps<'Information'>) => <p>the {stageType} editor</p>;

/**
 * Options as they reach the harness from somewhere the compiler cannot check:
 * a helper that assembles them, a value widened on the way in, a call written
 * before the union below existed. The refusal is for that path — the compiler
 * refuses the calls it can see, and those are checked further down.
 */
const asOptions = (
  options: Readonly<Record<string, unknown>>,
): RenderStageEditorOptions => options as unknown as RenderStageEditorOptions;

/**
 * `editor`, `sections` and `registry` are three ways of mounting what is under
 * test, and a call means exactly one: what is on screen is a different thing
 * in each case.
 *
 * They used to be three independent optionals that a call could give in any
 * combination, and `HarnessEditor` preferred `editor`, then `sections`. A call
 * that gave two mounted one of them and dropped the other in silence — so a
 * test could name the editor it meant to exercise, run the dispatcher's
 * instead, and pass while being about something else.
 */
describe('the harness mounting modes', () => {
  it.each([
    {
      combination: '`editor` and `sections`',
      options: {
        stageId: 'information-1',
        editor: InformationEditor,
        sections: <StageNameSection />,
      },
      named: ['`editor`', '`sections`'],
    },
    {
      combination: '`editor` and `registry`',
      options: {
        stageId: 'information-1',
        editor: InformationEditor,
        registry: { Information: InformationEditor },
      },
      named: ['`editor`', '`registry`'],
    },
    {
      combination: '`sections` and `registry`',
      options: {
        stageId: 'information-1',
        sections: <StageNameSection />,
        registry: { Information: InformationEditor },
      },
      named: ['`sections`', '`registry`'],
    },
  ])('refuses a call giving $combination', ({ options, named }) => {
    expect(() => renderStageEditor(asOptions(options))).toThrow(
      new RegExp(named.map((name) => `\\${name}`).join('.*')),
    );
    // Named rather than resolved: the message has to say which two, because
    // the call that has to change is the one that gave two.
    for (const name of named) {
      expect(() => renderStageEditor(asOptions(options))).toThrow(
        new RegExp(`\\${name}`),
      );
    }
  });

  /**
   * The same refusal from the compiler, for every call it can type. Each
   * `@ts-expect-error` fails `tsc` the day that combination starts being
   * allowed — which is the day the union has collapsed back into three
   * independent optionals and stopped saying anything.
   */
  it('does not compile a call giving two of them', () => {
    // @ts-expect-error `editor` and `sections` are alternatives
    const editorAndSections: RenderStageEditorOptions<'Information'> = {
      stageId: 'information-1',
      editor: InformationEditor,
      sections: <StageNameSection />,
    };
    // @ts-expect-error `editor` and `registry` are alternatives
    const editorAndRegistry: RenderStageEditorOptions<'Information'> = {
      stageId: 'information-1',
      editor: InformationEditor,
      registry: { Information: InformationEditor },
    };
    // @ts-expect-error `sections` and `registry` are alternatives
    const sectionsAndRegistry: RenderStageEditorOptions<'Information'> = {
      stageId: 'information-1',
      sections: <StageNameSection />,
      registry: { Information: InformationEditor },
    };

    expect(editorAndSections.editor).toBe(InformationEditor);
    expect(editorAndRegistry.editor).toBe(InformationEditor);
    expect(sectionsAndRegistry.sections).toBeDefined();
  });

  /**
   * The control. A guard that refused a call giving ONE of them would fail
   * every test in the package, but not this file — so each mode is mounted
   * here, and each is asked for something only it puts on screen.
   */
  it('mounts the named editor a call gives on its own', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      editor: InformationEditor,
    });

    expect(harness.getByText('the Information editor')).toBeInTheDocument();
  });

  it('mounts sections a call gives on their own in the shared shell', async () => {
    renderStageEditor({
      stageId: 'information-1',
      sections: <StageNameSection />,
    });

    expect(
      await screen.findByRole('textbox', { name: 'Stage name' }),
    ).toBeInTheDocument();
  });

  it('dispatches through a registry a call gives on its own', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      registry: { Information: InformationEditor },
    });

    expect(harness.getByText('the Information editor')).toBeInTheDocument();
  });
});
