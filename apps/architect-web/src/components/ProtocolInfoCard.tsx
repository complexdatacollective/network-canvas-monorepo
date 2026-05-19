import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { TextArea } from '~/components/Form/Fields';
import { useProjectMountAnimation } from '~/components/ProjectNav/projectMountAnimationContext';
import { useAppDispatch } from '~/ducks/hooks';
import {
  updateProtocolDescription,
  updateProtocolName,
} from '~/ducks/modules/activeProtocol';
import { getProtocol, getProtocolName } from '~/selectors/protocol';

const ProtocolInfoCard = () => {
  const dispatch = useAppDispatch();
  const name = useSelector(getProtocolName);
  const protocol = useSelector(getProtocol);
  const description = protocol?.description ?? '';
  const shouldReduceMotion = useReducedMotion();
  const { isInitialLoad } = useProjectMountAnimation();
  // Snapshot at first render — Timeline flips markAnimated() on mount, which
  // would cause this card's `initial` to drop mid-flight on the resulting re-render.
  const [animate] = useState(() => !shouldReduceMotion && isInitialLoad);

  const [localName, setLocalName] = useState(name ?? '');

  useEffect(() => {
    setLocalName(name ?? '');
  }, [name]);

  return (
    <motion.div
      initial={animate ? { y: -80, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="bg-surface-1 relative mx-auto flex w-full max-w-4xl flex-col overflow-hidden rounded shadow-md"
    >
      <div className="px-(--space-lg) py-(--space-md)">
        <input
          type="text"
          className="h1 my-0 mb-(--space-sm) w-full border-none bg-transparent p-0 text-inherit outline-none focus:outline-none"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={() => {
            const trimmed = localName.trim();
            if (trimmed) {
              dispatch(updateProtocolName({ name: trimmed }));
            } else {
              setLocalName(name ?? '');
            }
          }}
          placeholder="Enter protocol name..."
          aria-label="Protocol name"
        />
        <TextArea
          placeholder="Enter a description for your protocol..."
          input={{
            value: description,
            onChange: (event) =>
              dispatch(
                updateProtocolDescription({ description: event.target.value }),
              ),
          }}
        />
      </div>
    </motion.div>
  );
};

export default ProtocolInfoCard;
