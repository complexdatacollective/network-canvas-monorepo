import { find, get } from 'es-toolkit/compat';
import { motion } from 'motion/react';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import StageTypeImage from '@codaco/protocol-builder/interfaces/StageTypeImage';
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
  const ref = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const tagsId = useId();
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
    (e: React.MouseEvent<HTMLButtonElement>) => {
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
    // Without the label/description split, this button takes its name from its
    // whole subtree: the screenshot's alt, then the heading, then the sentence
    // and every tag — one unbroken string per card, and the same title twice.
    // A researcher listing this dialog's buttons hears the title alone, and
    // the rest only on the card they stop at.
    <motion.button
      type="button"
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId} ${tagsId}`}
      className={`border-outline focusable w-full flex-1 cursor-pointer border-x-0 border-t-0 border-b-2 py-4 text-left ${highlighted ? 'bg-action' : 'bg-transparent'}`}
      onClick={handleSelect}
      onMouseEnter={setHighlighted}
      onMouseLeave={removeHighlighted}
      onFocus={setHighlighted}
      onBlur={removeHighlighted}
    >
      <div className="mx-6 flex items-center gap-10">
        <div className="shrink-0">
          <StageTypeImage
            type={interfaceType}
            ratio="4:3"
            sizes="10rem"
            alt=""
            className="h-auto w-40 rounded-sm"
          />
        </div>
        <div className="flex flex-col">
          <Heading
            id={titleId}
            level="h4"
            margin="none"
            className={`mb-2 ${highlighted ? 'text-white' : ''}`}
          >
            {title}
          </Heading>
          <div
            id={descriptionId}
            className={`mb-3 ${highlighted ? 'text-white' : ''}`}
          >
            {description}
          </div>
          <div id={tagsId} className="flex flex-wrap gap-2">
            {tags.map((tag: string) => (
              <Tag key={tag} id={tag} color={get(TAG_COLORS, tag)} light>
                {tag}
              </Tag>
            ))}
          </div>
        </div>
      </div>
    </motion.button>
  );
};

export default InterfaceThumbnail;
