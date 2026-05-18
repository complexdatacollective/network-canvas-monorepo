import Markdown from '~/components/Form/Fields/Markdown';

import Asset from '../Asset';
import MiniTable from '../MiniTable';
import SectionFrame from './SectionFrame';

type ItemsProps = {
  items?: Array<{
    id?: string;
    type?: string;
    content?: string;
    size?: string;
  }> | null;
};

const Items = ({ items = null }: ItemsProps) => {
  if (!items) {
    return null;
  }

  return (
    <SectionFrame title="Items">
      {items.map(({ type, content, size, id }) => {
        switch (type) {
          case 'asset':
            return (
              <div key={id}>
                <Asset id={content ?? ''} size={size ?? ''} />
              </div>
            );
          default:
            return (
              <div key={id}>
                <MiniTable
                  rotated
                  rows={[
                    ['Block Size', size],
                    ['Type', 'Text'],
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    [
                      'Content',
                      <Markdown key="content" label={content ?? ''} />,
                    ],
                  ]}
                />
              </div>
            );
        }
      })}
    </SectionFrame>
  );
};

export default Items;
