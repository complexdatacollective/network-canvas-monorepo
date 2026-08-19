import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';

import {
  findDanglingIdReferences,
  ID_REFERENCE_ATTRIBUTES,
} from '@codaco/fresco-ui/utils/ariaIdReferences';

import ValidationRule from '../ValidationRule';

/**
 * ValidationRule points `aria-labelledby` and `aria-describedby` at elements it
 * renders itself, and which of them exist varies with `hint`, `issues` and the
 * rule's value control. The property that has to hold across that matrix is
 * that every ID named resolves to an element: a dangling IDREF changes nothing
 * visible, but drops the whole `aria-describedby` announcement for some screen
 * readers, and a dangling `aria-labelledby` outranks `aria-label` in the
 * accessible-name computation.
 *
 * Taking both the IDs and the describedby list from fresco-ui's
 * `fieldElementIds`/`fieldDescribedBy` removes the hand-written `${id}-…`
 * strings that could drift from the markup, but it cannot rule out naming an
 * element the row does not render — so the property is asserted directly here
 * rather than assumed from the seam.
 */

const noop = () => undefined;

function renderRule(
  props: Partial<ComponentProps<typeof ValidationRule>> = {},
) {
  return render(
    <ValidationRule
      ruleKey="minLength"
      label="Minimum length"
      isOn={false}
      text=""
      issues={[]}
      onToggle={noop}
      onTextChange={noop}
      onCommit={noop}
      onValueExit={noop}
      {...props}
    />,
  );
}

/** Every ARIA ID reference the row renders, as `attribute` → list of IDs. */
function idReferences(container: HTMLElement): string[] {
  const selector = ID_REFERENCE_ATTRIBUTES.map((name) => `[${name}]`).join(',');
  return [...container.querySelectorAll(selector)].flatMap((element) =>
    ID_REFERENCE_ATTRIBUTES.flatMap((attribute) =>
      (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean),
    ),
  );
}

// The matrix of what the row conditionally renders: the value control
// (none / number input / target select) crossed with the describing elements
// (hint and error region), which are what `aria-describedby` names.
const controls = [
  { name: 'no value control', ruleKey: 'required' },
  { name: 'number value control', ruleKey: 'minLength' },
  { name: 'target value control', ruleKey: 'sameAs' },
] as const;

const descriptions = [
  { name: 'no hint, no issues', hint: undefined, issues: [] },
  { name: 'hint only', hint: 'Must be at least this long.', issues: [] },
  { name: 'issues only', hint: undefined, issues: ['Enter a number.'] },
  {
    name: 'hint and issues',
    hint: 'Must be at least this long.',
    issues: ['Enter a number.'],
  },
] as const;

describe('ValidationRule ARIA ID references', () => {
  for (const control of controls) {
    for (const description of descriptions) {
      for (const isOn of [false, true]) {
        it(`resolves every referenced ID with ${control.name}, ${description.name}, ${isOn ? 'on' : 'off'}`, () => {
          const { container } = renderRule({
            ruleKey: control.ruleKey,
            isOn,
            hint: description.hint,
            issues: [...description.issues],
            targetOptions: [{ label: 'Nickname', value: 'nickname' }],
          });

          // Guards the assertion below against passing vacuously: the row
          // always names its label, so a render that references nothing at all
          // means this test stopped exercising the component.
          expect(idReferences(container).length).toBeGreaterThan(0);

          expect(findDanglingIdReferences(container)).toEqual([]);
        });
      }
    }
  }
});
