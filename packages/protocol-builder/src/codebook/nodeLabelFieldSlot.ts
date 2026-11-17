import { createContext, useContext, type ComponentType } from 'react';

import type { NodeLabelFieldProps } from '../fields/NodeLabelField.tsx';

/**
 * The field a node type's own label is written in, handed down rather than
 * imported by the node type editor.
 *
 * The label's text holds rules, a rule names an entity type, and the picker
 * that names one can open the node type editor to create it: imported
 * directly, the editor and the field would each depend on the other. So the
 * root of the builder, which nothing here imports, supplies the field, and
 * the editor shows its Dynamic label section only where one is supplied.
 */
const NodeLabelFieldSlot = createContext<
  ComponentType<NodeLabelFieldProps> | undefined
>(undefined);

export const NodeLabelFieldProvider = NodeLabelFieldSlot.Provider;

export const useNodeLabelField = ():
  | ComponentType<NodeLabelFieldProps>
  | undefined => useContext(NodeLabelFieldSlot);
