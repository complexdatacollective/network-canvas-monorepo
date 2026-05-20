import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import { Pattern } from '@codaco/art';
import { TextArea } from '~/components/Form/Fields';
import { useAppDispatch } from '~/ducks/hooks';
import {
  updateProtocolDescription,
  updateProtocolName,
} from '~/ducks/modules/activeProtocol';
import { useRunOnce } from '~/hooks/useRunOnce';
import { getProtocol, getProtocolName } from '~/selectors/protocol';

const ProtocolInfoCard = () => {
  const dispatch = useAppDispatch();
  const name = useSelector(getProtocolName);
  const protocol = useSelector(getProtocol);
  const description = protocol?.description ?? '';
  const shouldReduceMotion = useReducedMotion();
  const isFirstMount = useRunOnce('protocol-summary-entrance');
  const animate = !shouldReduceMotion && isFirstMount;

  const stageCount = protocol?.stages?.length ?? 0;
  const nodeTypeCount = Object.keys(protocol?.codebook?.node ?? {}).length;
  const edgeTypeCount = Object.keys(protocol?.codebook?.edge ?? {}).length;

  const [localName, setLocalName] = useState(name ?? '');

  useEffect(() => {
    setLocalName(name ?? '');
  }, [name]);

  return (
    <motion.div
      initial={animate ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="bg-surface-1 relative mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded shadow-md"
    >
      <div className="relative h-32 w-full overflow-hidden px-(--space-lg) py-(--space-md)">
        <Pattern
          aria-hidden
          seed={name ?? 'Network Canvas Protocol'}
          className="absolute inset-0 size-full"
        />
        <div className="relative">
          <input
            type="text"
            className="h1 my-0 w-full border-none bg-transparent p-0 text-white outline-none placeholder:text-white/60 focus:outline-none"
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
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/80">
            <span>
              {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
            </span>
            <span aria-hidden>/</span>
            <span>
              {nodeTypeCount} node {nodeTypeCount === 1 ? 'type' : 'types'}
            </span>
            <span aria-hidden>/</span>
            <span>
              {edgeTypeCount} edge {edgeTypeCount === 1 ? 'type' : 'types'}
            </span>
          </div>
        </div>
      </div>
      <div className="px-(--space-lg) py-(--space-md)">
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
