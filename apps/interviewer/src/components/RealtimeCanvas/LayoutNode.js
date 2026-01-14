import { entityPrimaryKeyProperty } from '@codaco/shared-consts';
import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import DragManager from '../../behaviours/DragAndDrop/DragManager';
import UINode from '../../containers/Node';

const LayoutNode = ({
  node,
  portal,
  onSelected,
  onDragStart,
  onDragMove,
  onDragEnd,
  allowPositioning,
  selected,
  inactive,
  linking,
  index,
}) => {
  const dragManager = useRef();

  useEffect(() => {
    if (portal && allowPositioning) {
      const uuid = node[entityPrimaryKeyProperty];

      dragManager.current = new DragManager({
        el: portal,
        onDragStart: (data) => onDragStart(uuid, index, data),
        onDragMove: (data) => onDragMove(uuid, index, data),
        onDragEnd: (data) => onDragEnd(uuid, index, data),
      });
    }

    return () => {
      if (dragManager.current) {
        dragManager.current.unmount();
      }
    };
  }, [portal, index, onDragStart, onDragMove, onDragEnd]);

  useEffect(() => {
    const handleSelected = () => onSelected(node);

    portal.addEventListener('click', handleSelected);

    return () => {
      portal.removeEventListener('click', handleSelected);
    };
  }, [onSelected, node]);

  return ReactDOM.createPortal(<UINode {...node} selected={selected} linking={linking} inactive={inactive} />, portal);
};

export default LayoutNode;
