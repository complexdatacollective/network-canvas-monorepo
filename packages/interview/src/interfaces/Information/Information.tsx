import Surface from '@codaco/fresco-ui/layout/Surface';
import { ALLOWED_MARKDOWN_SECTION_TAGS } from '@codaco/fresco-ui/RenderMarkdown';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';

import { assetBlockImages } from '../../components/AssetBlock';
import { ContentDocument } from '../../content/ContentDocument';
import type { StageProps } from '../../types';

type InformationProps = StageProps<'Information'>;

/**
 * Information Interface: a page the participant reads. The page is one
 * text: its heading, its words and each image, audio recording or video are
 * shown in the order the text holds them.
 */
const Information = ({ stage: { content } }: InformationProps) => (
  <ScrollArea className="m-0 size-full">
    {/* oxlint-disable-next-line tailwindcss/no-conflicting-classes -- min-h-full deliberately overrides the interface utility's min-h-0, so the stage fills the scroll area */}
    <div className="interface mx-auto min-h-full max-w-[80ch] select-text">
      <Surface className="grow-0" noContainer spacing="lg" shadow="lg">
        <ContentDocument
          value={content}
          allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
          blockImages={assetBlockImages}
        />
      </Surface>
    </div>
  </ScrollArea>
);

export default Information;
