import { Globe } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'wouter';

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

  // A Geospatial stage renders an online map, so a protocol containing one
  // can't be administered offline. Mirrors interviewer's DeckCard pill.
  const requiresInternet =
    protocol?.stages?.some((stage) => stage.type === 'Geospatial') ?? false;

  const [localName, setLocalName] = useState(name ?? '');

  useEffect(() => {
    setLocalName(name ?? '');
  }, [name]);

  return (
    <motion.div
      initial={animate ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="text-navy-taupe bg-platinum border-platinum-dark relative mx-auto w-full max-w-3xl overflow-hidden rounded border shadow-xl"
    >
      {/* The pattern fills the whole card; a top-to-bottom gradient lets it
          read at the top, then fades to opaque platinum so the editable
          content below stays legible. Mirrors interviewer's DeckCard. */}
      <Pattern
        aria-hidden
        seed={name ?? 'Network Canvas Protocol'}
        className="absolute inset-0 size-full"
      />
      <div className="from-rich-black/25 via-platinum/90 to-platinum absolute inset-0 size-full bg-linear-to-b via-20% to-45%" />

      <div className="relative z-10 flex flex-col gap-(--space-md) p-(--space-lg)">
        {/* Top controls row — reserves space above the heading (pushing the
            dark title clear of the gradient's dark top) and houses the
            requires-internet pill, mirroring interviewer's DeckCard. */}
        <div className="flex min-h-(--space-2xl) items-start justify-end">
          {requiresInternet && (
            <span className="text-neon-carrot border-neon-carrot bg-rich-black/60 font-monospace flex items-center gap-2 rounded-full border px-(--space-sm) py-(--space-xs) text-xs uppercase backdrop-blur-sm">
              <Globe className="size-4" />
              Requires Internet
            </span>
          )}
        </div>

        <input
          type="text"
          className="font-heading text-navy-taupe placeholder:text-navy-taupe/50 focus-visible:ring-sea-green w-full rounded-sm border-none bg-transparent p-0 text-4xl leading-tight font-black outline-none focus-visible:ring-2 focus-visible:outline-none"
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

        <div className="border-platinum-dark/60 focus-within:border-primary overflow-hidden rounded-sm border bg-white/45 backdrop-blur-sm transition-colors">
          <TextArea
            className="[&>textarea]:field-sizing-content [&>textarea]:max-h-52 [&>textarea]:min-h-24 [&>textarea]:rounded-none [&>textarea]:border-0 [&>textarea]:bg-transparent [&>textarea]:focus:border-0 [&>textarea]:focus:ring-0"
            placeholder="Enter a description for your protocol..."
            input={{
              value: description,
              onChange: (event) =>
                dispatch(
                  updateProtocolDescription({
                    description: event.target.value,
                  }),
                ),
            }}
          />
        </div>

        <div className="text-navy-taupe/70 font-monospace flex flex-wrap items-center gap-2 text-xs tracking-wide uppercase">
          <span>
            {stageCount} {stageCount === 1 ? 'stage' : 'stages'}
          </span>
          <span aria-hidden>/</span>
          <Link
            href="/protocol/codebook"
            className="hover:text-navy-taupe hover:underline"
          >
            {nodeTypeCount} node {nodeTypeCount === 1 ? 'type' : 'types'}
          </Link>
          <span aria-hidden>/</span>
          <Link
            href="/protocol/codebook"
            className="hover:text-navy-taupe hover:underline"
          >
            {edgeTypeCount} edge {edgeTypeCount === 1 ? 'type' : 'types'}
          </Link>
        </div>
      </div>
    </motion.div>
  );
};

export default ProtocolInfoCard;
