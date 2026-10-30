import Surface from '@codaco/fresco-ui/layout/Surface';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';

import ContentItem from '../../components/ContentItem';
import { LocalizedText } from '../../localization/LocalizedText';
import type { StageProps } from '../../types';

type InformationProps = StageProps<'Information'>;

/**
 * Information Interface
 */
const Information = ({ stage: { title, items } }: InformationProps) => (
  <ScrollArea className="m-0 size-full">
    {/* oxlint-disable-next-line tailwindcss/no-conflicting-classes -- min-h-full deliberately overrides the interface utility's min-h-0, so the stage fills the scroll area */}
    <div className="interface mx-auto min-h-full max-w-[80ch] select-text">
      <Surface className="grow-0" noContainer spacing="lg" shadow="lg">
        <LocalizedText
          value={title}
          render={<Heading level="h1" className="text-center" />}
        />
        {items.map((item) => (
          <ContentItem key={item.id} item={item} />
        ))}
      </Surface>
    </div>
  </ScrollArea>
);

export default Information;
