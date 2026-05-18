import { find, get } from 'es-toolkit/compat';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import Tag from '~/components/Tag';
import timelineImages from '~/images/timeline';

import { INTERFACE_TYPES, TAG_COLORS } from './interfaceOptions';

const getTimelineImage = (type: string) => get(timelineImages, type);

type InterfaceThumbnailProps = {
  type: string;
  onClick: (type: string) => void;
  highlighted?: boolean;
  setHighlighted?: () => void;
  removeHighlighted?: () => void;
};

const InterfaceThumbnail = ({
  type: interfaceType,
  onClick,
  highlighted = false,
  setHighlighted,
  removeHighlighted,
}: InterfaceThumbnailProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const meta = useMemo(
    () => find(INTERFACE_TYPES, ['type', interfaceType]),
    [interfaceType],
  );
  const image = getTimelineImage(interfaceType);
  const { title, tags, description } = meta ?? {
    title: '',
    tags: [],
    description: '',
  };

  if (!meta) {
    throw Error(`${interfaceType} definition not found`);
  }

  const handleSelect = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      onClick(interfaceType);
    },
    [onClick, interfaceType],
  );

  useEffect(() => {
    if (highlighted && ref.current) {
      // Move element into view when it is selected
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [highlighted]);

  return (
    <motion.div
      ref={ref}
      className={`border-divider flex-1 cursor-pointer border-b-2 py-4 ${highlighted ? 'bg-action' : ''}`}
      onClick={handleSelect}
      onMouseEnter={setHighlighted}
      onMouseLeave={removeHighlighted}
    >
      <div className="mx-6 flex items-center gap-10">
        <img
          className="h-auto w-40 shrink-0 rounded-sm"
          src={image}
          alt={title}
        />
        <div className="flex flex-col">
          <h4 className={`mt-0 mb-2 ${highlighted ? 'text-white' : ''}`}>
            {title}
          </h4>
          <div className={`mb-3 ${highlighted ? 'text-white' : ''}`}>
            {description}
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag: string) => (
              <Tag key={tag} id={tag} color={get(TAG_COLORS, tag)} light>
                {tag}
              </Tag>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default InterfaceThumbnail;
