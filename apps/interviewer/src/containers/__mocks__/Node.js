import React from 'react';
import { vi } from 'vitest';

const MockNode = (props) => <div className="mock-node" {...props} />;
MockNode.displayName = 'Connect(Node)';

export const Node = MockNode;
export default MockNode;
