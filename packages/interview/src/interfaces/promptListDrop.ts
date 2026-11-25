import { has } from 'es-toolkit/compat';

import type { DragMetadata } from '@codaco/fresco-ui/dnd/types';

import type { DropSound } from '../sounds/InteractionSounds';

/**
 * Whether a person dropped on a prompt's list of people is already in the
 * network: a node from the network carries the prompts it was named on
 * (`promptIDs`), and dropping it adds it to this prompt. Anything else (a
 * person from a roster or another external data source, dragged from a name
 * generator's panel or from the roster) is not yet in the network, and
 * dropping it adds a new node.
 */
export const isNetworkNode = (metadata: DragMetadata | undefined): boolean =>
  has(metadata, 'promptIDs');

/**
 * The sound of a drop on a prompt's list of people, by what the drop does:
 * `create-node` when it adds a new node to the network, the sound of adding
 * a person, and `toggle-on` when it adds a person already in the network to
 * this prompt.
 */
export const promptListDropSound = (
  metadata: DragMetadata | undefined,
): DropSound => (isNetworkNode(metadata) ? 'toggle-on' : 'create-node');
