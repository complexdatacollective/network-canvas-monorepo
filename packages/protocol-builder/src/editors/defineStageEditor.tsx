import type { ReactNode } from 'react';

import type { StageType } from '@codaco/protocol-validation';

import StageEditorShell from '../form/StageEditorShell.tsx';
import type {
  StageEditorComponent,
  StageEditorProps,
} from '../stage-editor-contract.ts';
import { saveStageAction } from './saveStageAction.tsx';

/**
 * One entry in an editor's list: a section that has already been given its
 * props and renders itself.
 *
 * A section takes SEMANTIC props — which entity its subject is, whose codebook
 * its fields collect into — and never the lock, the codebook, or the stage
 * document. Everything a section reads about the rest of the protocol it
 * subscribes to itself, so composing one is choosing it and saying what it is
 * about, which is what makes an editor a list rather than a component.
 */
export type StageSection = () => ReactNode;

/**
 * A named editor, written as the ordered list of sections it composes.
 *
 * Answers with the registry entry the interface claims rather than with the
 * component, so an editor module IS its part: `stageEditorRegistry.ts` adds it
 * to `REGISTRY_PARTS` and the compile-time coverage checks read the interface
 * out of the key. One editor, one file, one line in the registry.
 *
 * The shell and the fallback save control are here rather than in each editor
 * because they are the same for every interface — a researcher who has learnt
 * what saving a stage does has learnt it for all of them — and an editor that
 * could compose its own shell could leave the host's action chrome out.
 */
export function defineStageEditor<T extends StageType>(
  stageType: T,
  sections: readonly StageSection[],
): Record<T, StageEditorComponent<T>> {
  function StageEditorFromSections({ actions }: StageEditorProps<T>) {
    return (
      <StageEditorShell actions={actions ?? saveStageAction}>
        {sections.map((Section, index) => (
          // The list is settled when the editor is defined and never reordered
          // afterwards, so a section's position in it is its identity.
          <Section key={index} />
        ))}
      </StageEditorShell>
    );
  }
  StageEditorFromSections.displayName = `${stageType}StageEditor`;

  // The key is a type parameter, which a computed property widens to a string
  // index signature — so the exact interface this editor claims, the fact the
  // registry's coverage checks are built on, has to be said here.
  return { [stageType]: StageEditorFromSections } as Record<
    T,
    StageEditorComponent<T>
  >;
}
