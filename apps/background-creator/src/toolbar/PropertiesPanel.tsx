import { BringToFront, SendToBack, Trash2 } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button, IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { zonesOf } from '~/geometry/zones';
import type {
  EllipseElement,
  LineElement,
  PolygonElement,
  RectElement,
  SvgElement,
  TextElement,
  ZoneElement,
} from '~/model/types';
import { assertNever } from '~/state/assertNever';
import { nextZoneLabel, useEditorStore } from '~/state/editorStore';
import { elementKindLabel } from '~/state/labels';

import { ColorControl } from './ColorControl';
import { NumberField } from './NumberField';

const WEIGHT_OPTIONS: { value: TextElement['fontWeight']; label: string }[] = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
];

const SIZE_OPTIONS: { value: TextElement['fontSize']; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'extra-large', label: 'Extra large' },
];

function pickWeight(value: unknown): TextElement['fontWeight'] | null {
  return WEIGHT_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

function pickSize(value: unknown): TextElement['fontSize'] | null {
  return SIZE_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

// Mirrors validateZoneLabels' rules for a single zone element so the inline
// warning and the export gate agree on what a valid label is.
function zoneLabelIssue(
  zone: ZoneElement,
  zones: ZoneElement[],
): string | null {
  const label = (zone.zoneLabel ?? '').trim();
  if (label === '') {
    return 'Every zone needs a label; it becomes the assigned variable’s value.';
  }
  const duplicated = zones.some(
    (other) => other.id !== zone.id && (other.zoneLabel ?? '').trim() === label,
  );
  if (duplicated) {
    return 'Another zone already uses this label. Zone labels must be unique.';
  }
  return null;
}

// A rect/ellipse/polygon can be marked as a zone; enabling prefills the next
// free `zone-N` label, and the label is live-validated for empty/duplicate.
function ZoneMarkControls({
  element,
}: {
  element: RectElement | EllipseElement | PolygonElement;
}): ReactElement {
  const doc = useEditorStore((s) => s.doc);
  const updateElement = useEditorStore((s) => s.updateElement);
  const id = element.id;
  const marked = element.zoneLabel !== null;
  const issue = marked ? zoneLabelIssue(element, zonesOf(doc)) : null;

  return (
    <>
      <UnconnectedField
        label="Use as zone"
        name="use-as-zone"
        inline
        hint="Zones classify each node’s layout position; the label becomes the assigned variable’s value."
        component={ToggleField}
        value={marked}
        onChange={(value) =>
          updateElement(id, {
            zoneLabel: value === true ? nextZoneLabel(zonesOf(doc)) : null,
          })
        }
      />
      {marked && (
        <UnconnectedField
          label="Zone label"
          name="zone-label"
          component={InputField}
          value={element.zoneLabel ?? ''}
          errors={issue ? [issue] : undefined}
          showErrors={Boolean(issue)}
          onChange={(value) =>
            updateElement(
              id,
              { zoneLabel: value ?? '' },
              { coalesceKey: `zone-label:${id}` },
            )
          }
        />
      )}
    </>
  );
}

function FillControls({
  element,
}: {
  element: RectElement | EllipseElement | PolygonElement;
}): ReactElement {
  const updateElement = useEditorStore((s) => s.updateElement);
  const id = element.id;
  return (
    <>
      <ColorControl
        label="Fill"
        value={element.fill}
        onCommit={(value, continuous) => {
          if (value === null) return;
          updateElement(
            id,
            { fill: value },
            continuous ? { coalesceKey: `fill:${id}` } : undefined,
          );
        }}
      />
      <NumberField
        label="Fill opacity"
        name="fill-opacity"
        value={element.fillOpacity}
        min={0}
        max={1}
        step={0.05}
        onCommit={(value) => updateElement(id, { fillOpacity: value })}
      />
      <ColorControl
        label="Stroke"
        value={element.stroke}
        allowNone
        onCommit={(value, continuous) =>
          updateElement(
            id,
            { stroke: value },
            continuous ? { coalesceKey: `stroke:${id}` } : undefined,
          )
        }
      />
      <NumberField
        label="Stroke width"
        name="stroke-width"
        value={element.strokeWidth}
        min={0.25}
        max={20}
        step={0.25}
        onCommit={(value) => updateElement(id, { strokeWidth: value })}
      />
      <ZoneMarkControls element={element} />
    </>
  );
}

function LineControls({ element }: { element: LineElement }): ReactElement {
  const updateElement = useEditorStore((s) => s.updateElement);
  const id = element.id;
  return (
    <>
      <ColorControl
        label="Stroke"
        value={element.stroke}
        onCommit={(value, continuous) => {
          if (value === null) return;
          updateElement(
            id,
            { stroke: value },
            continuous ? { coalesceKey: `stroke:${id}` } : undefined,
          );
        }}
      />
      <NumberField
        label="Stroke width"
        name="stroke-width"
        value={element.strokeWidth}
        min={0.25}
        max={20}
        step={0.25}
        onCommit={(value) => updateElement(id, { strokeWidth: value })}
      />
      <UnconnectedField
        label="Start arrow"
        name="start-arrow"
        inline
        component={ToggleField}
        value={element.startArrow}
        onChange={(value) => updateElement(id, { startArrow: value === true })}
      />
      <UnconnectedField
        label="End arrow"
        name="end-arrow"
        inline
        component={ToggleField}
        value={element.endArrow}
        onChange={(value) => updateElement(id, { endArrow: value === true })}
      />
    </>
  );
}

// Text content itself is edited inline on the canvas (double-click / Enter),
// so the panel carries only presentation properties.
function TextControls({ element }: { element: TextElement }): ReactElement {
  const updateElement = useEditorStore((s) => s.updateElement);
  const id = element.id;
  return (
    <>
      <UnconnectedField
        label="Size"
        name="font-size"
        component={RadioGroupField}
        orientation="horizontal"
        size="sm"
        options={SIZE_OPTIONS}
        value={element.fontSize}
        onChange={(value) => {
          const fontSize = pickSize(value);
          if (fontSize !== null) updateElement(id, { fontSize });
        }}
      />
      <UnconnectedField
        label="Weight"
        name="font-weight"
        component={SelectField}
        options={WEIGHT_OPTIONS}
        value={element.fontWeight}
        onChange={(value) => {
          const weight = pickWeight(value);
          if (weight !== null) updateElement(id, { fontWeight: weight });
        }}
      />
      <ColorControl
        label="Colour"
        value={element.fill}
        onCommit={(value, continuous) => {
          if (value === null) return;
          updateElement(
            id,
            { fill: value },
            continuous ? { coalesceKey: `fill:${id}` } : undefined,
          );
        }}
      />
      <NumberField
        label="Opacity"
        name="text-opacity"
        value={element.opacity}
        min={0}
        max={1}
        step={0.05}
        onCommit={(value) => updateElement(id, { opacity: value })}
      />
    </>
  );
}

function ElementControls({ element }: { element: SvgElement }): ReactElement {
  switch (element.kind) {
    case 'rect':
    case 'ellipse':
    case 'polygon':
      return <FillControls element={element} />;
    case 'line':
      return <LineControls element={element} />;
    case 'text':
      return <TextControls element={element} />;
    default:
      return assertNever(element);
  }
}

export function PropertiesPanel(): ReactElement {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);
  const reorderSelected = useEditorStore((s) => s.reorderSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);

  const element = selection
    ? doc.elements.find((candidate) => candidate.id === selection.id)
    : undefined;

  if (!element) {
    return (
      <div className="w-64">
        <Paragraph intent="smallText" emphasis="muted" margin="none">
          Select an item to edit its properties.
        </Paragraph>
      </div>
    );
  }

  return (
    <div className="flex max-h-[min(70vh,34rem)] w-64 flex-col">
      {/* Only the element's identity is pinned above the fold; every control —
          z-order, sections, Delete — lives in the scroll area below. */}
      <div className="border-outline/40 -mx-8 mb-3 border-b px-8 pb-3">
        <span className="text-text block truncate text-sm font-semibold">
          {elementKindLabel(element)}
        </span>
      </div>
      {/* The negative margins stretch the scroll container to the popover's full
          width (Surface `spacing="md"` padding is px-8) so the scrollbar hugs
          the popover edge; the horizontal padding is re-applied INSIDE the
          scrolled content. */}
      {/* Vertical padding inside the clip box: the first/last controls'
          focus rings (outline-offset) would otherwise be cut off at the
          scroll container's edges. */}
      <div className="-mx-8 min-h-0 overflow-y-auto">
        <div className="px-8 py-2">
          <div className="flex items-center gap-1 not-last:mb-8">
            <IconButton
              variant="text"
              size="sm"
              aria-label="Send backward"
              icon={<SendToBack />}
              onClick={() => reorderSelected('backward')}
            />
            <IconButton
              variant="text"
              size="sm"
              aria-label="Bring forward"
              icon={<BringToFront />}
              onClick={() => reorderSelected('forward')}
            />
          </div>
          <ElementControls element={element} />
          <Button
            variant="outline"
            color="destructive"
            size="sm"
            icon={<Trash2 />}
            className="w-full"
            onClick={() => deleteSelected()}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
