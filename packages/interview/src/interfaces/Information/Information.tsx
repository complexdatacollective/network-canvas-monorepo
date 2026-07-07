import Surface from '@codaco/fresco-ui/layout/Surface';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import Heading from '@codaco/fresco-ui/typography/Heading';
import ContentItem from '~/components/ContentItem';
import type { StageProps } from '~/types';

type InformationProps = StageProps<'Information'>;

/**
 * Information Interface
 */
const Information = ({ stage: { title, items } }: InformationProps) => (
  <ScrollArea className="m-0 size-full">
    <div className="interface allow-text-selection mx-auto flex min-h-full max-w-[80ch] flex-col justify-center">
      <Surface className="grow-0" noContainer spacing="lg" shadow="lg">
        <Heading level="h1" className="text-center">
          {title}
        </Heading>
        {items.map((item) => (
          <ContentItem key={item.id} item={item} />
        ))}
      </Surface>
    </div>
  </ScrollArea>
);

export default Information;
