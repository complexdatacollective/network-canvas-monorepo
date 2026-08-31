import { useEffect, useId } from 'react';

import { useStageEditorForm } from './stageEditorContext.ts';

/**
 * Registers one section with the editor's outline and hands back the id the
 * section must put on its own element.
 *
 * Separate from the section component because not every section looks like
 * one: the stage's name is rendered as the page's own heading rather than as
 * a card, and it still belongs in the outline. What makes something a section
 * is that it is a named part of the stage a researcher can navigate to, not
 * the chrome it happens to wear.
 */
export function useOutlineSection(
  title: string,
  disabled = false,
): Readonly<{ sectionId: string }> {
  const { outline } = useStageEditorForm();
  const sectionId = useId();

  useEffect(() => {
    const unregister = outline.registerSection({ id: sectionId, title });
    // Looked up rather than held by a ref: the element belongs to whichever
    // component renders the section's chrome. The outline needs it only to
    // order sections by where they sit on the page.
    outline.setSectionElement(sectionId, document.getElementById(sectionId));
    return unregister;
  }, [outline, sectionId, title]);

  useEffect(() => {
    outline.setSectionDisabled(sectionId, disabled);
  }, [disabled, outline, sectionId]);

  return { sectionId };
}
