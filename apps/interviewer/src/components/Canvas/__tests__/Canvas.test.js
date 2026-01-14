/* eslint-env jest */

import { shallow } from 'enzyme';
import React from 'react';

import Canvas from '../Canvas';

describe('<Canvas />', () => {
  it('renders children in a canvas', () => {
    const subject = shallow(<Canvas>foo</Canvas>);
    expect(subject.find('.canvas')).toHaveLength(1);
    expect(subject.childAt(0).text()).toEqual('foo');
  });
});
