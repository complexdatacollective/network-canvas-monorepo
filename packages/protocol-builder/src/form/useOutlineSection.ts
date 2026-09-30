import { useEffect, useId, useRef } from 'react';

import type { SectionAvailability } from './outlineStore.ts';
import { useStageEditorForm } from './stageEditorContext.ts';

/**
 * Registers one section with the editor's outline and hands back the id the
 * section must put on its own element.
 *
 * Separate from the section component because what makes something a section
 * is that it is a named part of the stage a researcher can navigate to, rather
 * than the markup it happens to be drawn in.
 */
export function useOutlineSection(
  title: string,
  availability: SectionAvailability = 'available',
): Readonly<{ sectionId: string }> {
  const { outline } = useStageEditorForm();
  const sectionId = useId();

  // The title is deliberately absent from this effect's dependencies. A
  // section registering is a lifecycle event — it takes the fields inside it
  // with it — and being renamed is not one: the fields do not remount, so
  // unregistering here would empty the section's field list and leave the
  // renamed section reporting itself as finished.
  const initialTitle = useRef(title);
  useEffect(() => {
    return outline.registerSection({
      id: sectionId,
      title: initialTitle.current,
    });
  }, [outline, sectionId]);

  useEffect(() => {
    outline.setSectionTitle(sectionId, title);
  }, [outline, sectionId, title]);

  useEffect(() => {
    outline.setSectionAvailability(sectionId, availability);
  }, [availability, outline, sectionId]);

  return { sectionId };
}
