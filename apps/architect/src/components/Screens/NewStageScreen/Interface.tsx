import { find, get } from 'es-toolkit/compat';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import StageTypeImage from '~/components/StageTypeImage';
import Tag from '~/components/Tag';

import { INTERFACE_TYPES, TAG_COLORS } from './interfaceOptions';

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
      className={`border-outline flex-1 cursor-pointer border-b-2 py-4 ${highlighted ? 'bg-action' : ''}`}
      onClick={handleSelect}
      onMouseEnter={setHighlighted}
      onMouseLeave={removeHighlighted}
    >
      <div className="mx-6 flex items-center gap-10">
        <div className="shrink-0">
          <StageTypeImage
            type={interfaceType}
            ratio="4:3"
            sizes="10rem"
            alt={title}
            className="h-auto w-40 rounded-sm"
          />
        </div>
        <div className="flex flex-col">
          <Heading
            level="h4"
            margin="none"
            className={`mb-2 ${highlighted ? 'text-white' : ''}`}
          >
            {title}
          </Heading>
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
