import { useMemo } from 'react';

import { sociogramStage, type Stage } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { useStageNodeTypes } from '../../../sections/useStageSubject.ts';

const promptSchema = sociogramStage.shape.prompts.element;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The Sociogram as it is being edited, with only what decides how it uses its
 * layout: its id, layout, node types, automatic layout and prompts. Built from
 * the live form values, so a stage that is not saved yet, or one whose prompts
 * were just edited, is judged as it stands. A prompt that is not valid yet is
 * left out, and a stage with no valid prompt yet is not judged at all: it sets
 * nothing and reads nothing until the researcher gives it a task.
 */
export function useDraftSociogram(): Stage | undefined {
  const { identity } = useStageEditorForm();
  const layout = useStageValue('layout');
  const prompts = useStageValue('prompts');
  const behaviours = useStageValue('behaviours');
  const nodeTypes = useStageNodeTypes();
  return useMemo(() => {
    const id = sociogramStage.shape.id.safeParse(identity.id);
    const [first, ...rest] = nodeTypes;
    if (
      identity.type !== 'Sociogram' ||
      !id.success ||
      typeof layout !== 'string' ||
      first === undefined
    ) {
      return undefined;
    }
    const draftPrompts = Array.isArray(prompts)
      ? prompts.flatMap((prompt: unknown) => {
          const parsed = promptSchema.safeParse(prompt);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    const [firstPrompt, ...otherPrompts] = draftPrompts;
    if (firstPrompt === undefined) {
      return undefined;
    }
    const automaticLayout =
      isRecord(behaviours) && behaviours.automaticLayout === true;
    const draft: Extract<Stage, { type: 'Sociogram' }> = {
      id: id.data,
      type: 'Sociogram',
      label: {},
      layout,
      subject: { entity: 'node', types: [first, ...rest] },
      // The background does not decide how the stage uses its layout.
      background: { concentricCircles: 0 },
      behaviours: automaticLayout ? { automaticLayout: true } : {},
      prompts: [firstPrompt, ...otherPrompts],
    };
    return draft;
  }, [behaviours, identity.id, identity.type, layout, nodeTypes, prompts]);
}
