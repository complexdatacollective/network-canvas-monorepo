'use client';

import { HelpCircle } from 'lucide-react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
} from 'motion/react';
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useStageSelector } from '~/hooks/useStageSelector';

import { buildPedigreeDialog } from '../buildPedigreeDialog';
import { useFamilyPedigreeStore } from '../FamilyPedigreeProvider';
import { getRelationshipTypeVariable } from '../utils/edgeUtils';
import { getEgoVariable, getNodeLabelVariable } from '../utils/nodeUtils';
import {
  buildParentsItem,
  type ChecklistItem,
  partnersNeedingParents,
} from './pedigreeChecklistItems';

export default function PedigreeChecklist({
  dragConstraints,
  onFinalize,
  onAllDoneChange,
}: {
  dragConstraints: RefObject<HTMLElement | null>;
  onFinalize: () => void;
  onAllDoneChange?: (allDone: boolean) => void;
}) {
  const nodes = useFamilyPedigreeStore((s) => s.network.nodes);
  const edges = useFamilyPedigreeStore((s) => s.network.edges);
  const nodeLabelVariable = useStageSelector(getNodeLabelVariable);
  const egoVariable = useStageSelector(getEgoVariable);
  const relationshipTypeVariable = useStageSelector(
    getRelationshipTypeVariable,
  );
  const { openDialog } = useDialog();

  const [dismissed, setDismissed] = useState(false);
  const [manuallyChecked, setManuallyChecked] = useState<Set<string>>(
    new Set(),
  );

  const toggleManualCheck = useCallback((id: string) => {
    setManuallyChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const egoId = useMemo(() => {
    for (const [id, node] of nodes) {
      if (node.attributes[egoVariable] === true) return id;
    }
    return null;
  }, [nodes, egoVariable]);

  const egoParentIds = useMemo(() => {
    if (!egoId) return [];
    const parents: string[] = [];
    for (const edge of edges.values()) {
      const relType = edge.attributes[relationshipTypeVariable] as
        | string
        | undefined;
      if (edge.to === egoId && relType !== 'partner' && relType !== 'social') {
        parents.push(edge.from);
      }
    }
    return parents;
  }, [egoId, edges, relationshipTypeVariable]);

  const hasPartner = useMemo(() => {
    if (!egoId) return false;
    for (const edge of edges.values()) {
      if (
        edge.attributes[relationshipTypeVariable] === 'partner' &&
        (edge.from === egoId || edge.to === egoId)
      ) {
        return true;
      }
    }
    return false;
  }, [egoId, edges, relationshipTypeVariable]);

  const hasSiblings = useMemo(() => {
    if (!egoId || egoParentIds.length === 0) return false;
    for (const edge of edges.values()) {
      const relType = edge.attributes[relationshipTypeVariable] as
        | string
        | undefined;
      if (
        relType !== 'partner' &&
        relType !== 'social' &&
        egoParentIds.includes(edge.from) &&
        edge.to !== egoId
      ) {
        return true;
      }
    }
    return false;
  }, [egoId, egoParentIds, edges, relationshipTypeVariable]);

  const hasParentSiblings = useMemo(() => {
    if (!egoId || egoParentIds.length === 0) return false;
    for (const parentId of egoParentIds) {
      const grandparentIds: string[] = [];
      for (const edge of edges.values()) {
        const relType = edge.attributes[relationshipTypeVariable] as
          | string
          | undefined;
        if (
          edge.to === parentId &&
          relType !== 'partner' &&
          relType !== 'social'
        ) {
          grandparentIds.push(edge.from);
        }
      }
      for (const gpId of grandparentIds) {
        for (const edge of edges.values()) {
          const relType = edge.attributes[relationshipTypeVariable] as
            | string
            | undefined;
          if (
            edge.from === gpId &&
            relType !== 'partner' &&
            relType !== 'social' &&
            edge.to !== parentId
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }, [egoId, egoParentIds, edges, relationshipTypeVariable]);

  const hasChildren = useMemo(() => {
    if (!egoId) return false;
    for (const edge of edges.values()) {
      if (
        edge.from === egoId &&
        edge.attributes[relationshipTypeVariable] !== 'partner'
      ) {
        return true;
      }
    }
    return false;
  }, [egoId, edges, relationshipTypeVariable]);

  const items = useMemo<ChecklistItem[]>(() => {
    if (!egoId) return [];

    const list: ChecklistItem[] = [];

    for (const parentId of egoParentIds) {
      const rawName = nodes.get(parentId)?.attributes[nodeLabelVariable];
      if (typeof rawName !== 'string' || rawName.length === 0) continue;

      // Only nudge for a parent's own parents when that parent is a genetic
      // parent of ego. An adoptive or surrogate parent's parents carry no
      // genetic information about ego, so they are never prompted for. Even for
      // genetic parents the ancestry may be unknown (e.g. a gamete donor), so
      // this item is optional and never blocks finalizing.
      const edgeToEgo = [...edges.values()].find(
        (e) => e.from === parentId && e.to === egoId,
      );
      const relTypeToEgo = edgeToEgo?.attributes[relationshipTypeVariable];
      if (relTypeToEgo !== 'biological' && relTypeToEgo !== 'donor') {
        continue;
      }

      list.push(
        buildParentsItem(
          parentId,
          rawName,
          'grandparents',
          edges,
          relationshipTypeVariable,
          manuallyChecked,
        ),
      );
    }

    // Once a partner has had children with ego, that partner contributes to the
    // next generation, so their own parents become relevant to those children's
    // family history (the same reason ego's parents are nudged above).
    for (const partnerId of partnersNeedingParents(
      egoId,
      edges,
      relationshipTypeVariable,
    )) {
      const rawName = nodes.get(partnerId)?.attributes[nodeLabelVariable];
      if (typeof rawName !== 'string' || rawName.length === 0) continue;

      list.push(
        buildParentsItem(
          partnerId,
          rawName,
          'partner-parents',
          edges,
          relationshipTypeVariable,
          manuallyChecked,
        ),
      );
    }

    list.push({
      id: 'parent-siblings',
      label: "Add parent's siblings",
      done: hasParentSiblings || manuallyChecked.has('parent-siblings'),
      required: false,
    });

    list.push({
      id: 'siblings',
      label: 'Add siblings',
      done: hasSiblings || manuallyChecked.has('siblings'),
      required: false,
    });

    list.push({
      id: 'partner',
      label: 'Add partners',
      done: hasPartner || manuallyChecked.has('partner'),
      required: false,
    });

    list.push({
      id: 'children',
      label: 'Add children',
      done: hasChildren || manuallyChecked.has('children'),
      required: false,
    });

    return list;
  }, [
    egoId,
    egoParentIds,
    nodes,
    edges,
    nodeLabelVariable,
    hasParentSiblings,
    hasSiblings,
    hasPartner,
    hasChildren,
    manuallyChecked,
    relationshipTypeVariable,
  ]);

  const sortedItems = useMemo(
    () =>
      [...items].toSorted((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.required !== b.required) return a.required ? -1 : 1;
        return 0;
      }),
    [items],
  );

  const allDone = sortedItems.every((i) => i.done);

  useEffect(() => {
    onAllDoneChange?.(allDone);
  }, [allDone, onAllDoneChange]);

  const overflowY = useMotionValue('auto');

  if (items.length === 0) return null;

  return (
    <AnimatePresence>
      {!dismissed && (
        <MotionSurface
          key="pedigree-checklist"
          className="bg-surface/80 absolute bottom-4 left-4 z-20 w-80 cursor-move overflow-hidden border-b-2 shadow-2xl backdrop-blur-md"
          layout
          drag
          dragConstraints={dragConstraints}
          noContainer
          spacing="sm"
          shadow="sm"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', duration: 0.5 }}
        >
          <div className="flex items-center justify-between">
            <Heading level="h4" margin="none">
              Pedigree Checklist
            </Heading>
            <CloseButton size="sm" onClick={() => setDismissed(true)} />
          </div>
          <Paragraph intent="smallText" className="text-current/50">
            Complete the following tasks before continuing. If a task doesn't
            apply you can click it to mark it as done.
          </Paragraph>
          <motion.div className="mt-4 max-h-64" style={{ overflowY }}>
            <LayoutGroup>
              <ul className="flex flex-col gap-3">
                {sortedItems.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    transition={{
                      layout: {
                        type: 'spring',
                        damping: 20,
                        stiffness: 300,
                      },
                    }}
                    onLayoutAnimationStart={() => overflowY.set('hidden')}
                    onLayoutAnimationComplete={() => overflowY.set('auto')}
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer items-center gap-4"
                    onClick={() => toggleManualCheck(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleManualCheck(item.id);
                      }
                    }}
                  >
                    <span className="contents">
                      <Checkbox
                        value={item.done}
                        onChange={() => toggleManualCheck(item.id)}
                        tabIndex={-1}
                        aria-hidden
                      />
                    </span>
                    <span
                      className={
                        item.done ? 'text-current/50 line-through' : ''
                      }
                    >
                      {item.label}
                      {item.required && !item.done && (
                        <span className="text-destructive ml-auto">
                          &nbsp;*
                        </span>
                      )}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </LayoutGroup>
          </motion.div>
          <motion.div
            layout
            className="mt-4 flex flex-col justify-between gap-2"
          >
            {allDone && (
              <Button color="primary" onClick={onFinalize}>
                Finalize family pedigree
              </Button>
            )}
            <Button
              color="dynamic"
              variant="text"
              aria-label="How to build your pedigree"
              icon={<HelpCircle />}
              onClick={() => void openDialog(buildPedigreeDialog)}
            >
              Help
            </Button>
          </motion.div>
        </MotionSurface>
      )}
    </AnimatePresence>
  );
}
