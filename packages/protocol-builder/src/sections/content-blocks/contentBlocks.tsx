import type { StageSection } from '../../editors/defineStageEditor.tsx';
import PageContentSection from '../page-content/PageContentSection.tsx';
import ContentBlockEditor from './ContentBlockEditor.tsx';
import ContentBlockPreview from './ContentBlockPreview.tsx';
import { contentBlockSlots } from './contentBlockTypes.ts';

/**
 * A page of blocks of text and media, in the order the participant reads them.
 *
 * The shared page section given the shared block editor: what a page IS
 * belongs to `PageContentSection`, and what a block may be — prose, an image,
 * audio, video — belongs here, so an interface composing a page of content
 * chooses the pair rather than wiring them together itself.
 */
export const contentBlocks = (): StageSection => () => (
  <PageContentSection
    ItemEditor={ContentBlockEditor}
    ItemPreview={ContentBlockPreview}
    slots={contentBlockSlots}
  />
);
