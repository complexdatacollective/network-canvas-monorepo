import type { StageSection } from '../../editors/defineStageEditor.tsx';
import PageContentSection, {
  type PageContentVariant,
} from '../page-content/PageContentSection.tsx';
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
 *
 * `variant` says what the page is TO the stage around it — the stage itself,
 * or an introduction shown before the task it does — which decides where the
 * blocks live, whether there is a heading above them and whether the whole
 * thing can be switched off. See `PageContentVariant`; a stage that IS its
 * page leaves it out.
 */
export const contentBlocks =
  ({
    variant,
  }: Readonly<{ variant?: PageContentVariant }> = {}): StageSection =>
  () => (
    <PageContentSection
      variant={variant}
      ItemEditor={ContentBlockEditor}
      ItemPreview={ContentBlockPreview}
      slots={contentBlockSlots}
    />
  );
