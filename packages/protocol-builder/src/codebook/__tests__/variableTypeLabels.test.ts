import { describe, expect, it } from 'vitest';

import { controlLabel } from '../../sections/collectableTypes.ts';
import {
  variableTypeBadgeColor,
  variableTypeLabel,
} from '../variableTypeLabels.ts';

describe('naming a type the schema may not know', () => {
  it('names the types it does know', () => {
    expect(variableTypeLabel('datetime')).toMatchObject({
      defaultMessage: 'Date',
    });
    expect(variableTypeBadgeColor('text')).toBe('cerulean-blue');
    expect(controlLabel('Text')).toMatchObject({
      defaultMessage: 'Text Input',
    });
  });

  it('says nothing for a name that is only a property every object has', () => {
    expect(variableTypeLabel('constructor')).toBeUndefined();
    expect(variableTypeBadgeColor('toString')).toBe('charcoal');
    expect(controlLabel('hasOwnProperty')).toBeUndefined();
  });
});
