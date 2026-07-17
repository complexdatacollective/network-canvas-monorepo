import { BringToFront, SendToBack, Trash2 } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button, IconButton } from '@codaco/fresco-ui/Button';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type {
  EllipseElement,
  LineElement,
  PolygonElement,
  RectElement,
  SvgElement,
  TextElement,
  Zone,
} from '~/model/types';
import { assertNever } from '~/state/assertNever';
import { useEditorStore } from '~/state/editorStore';
import { elementKindLabel } from '~/state/labels';

import { ColorControl } from './ColorControl';
import { NumberField } from './NumberField';
import { linesToText, textToLines } from './textLines';

const WEIGHT_OPTIONS: { value: TextElement['fontWeight']; label: string }[] = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
];

const ANCHOR_OPTIONS: { value: TextElement['anchor']; label: string }[] = [
  { value: 'start', label: 'Start (left)' },
  { value: 'middle', label: 'Middle (centre)' },
  { value: 'end', label: 'End (right)' },
];

function pickWeight(value: unknown): TextElement['fontWeight'] | null {
  return WEIGHT_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

function pickAnchor(value: unknown): TextElement['anchor'] | null {
  return ANCHOR_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

// Mirrors validateZoneLabels' rules for a single zone so the inline warning and
// the export gate agree on what a valid label is.
function zoneLabelIssue(zone: Zone, zones: Zone[]): string | null {
  const label = zone.label.trim();
  if (label === '') {
    return 'Every zone needs a label; it becomes the assigned variable’s value.';
  }
  const duplicated = zones.some(
    (other) => other.id !== zone.id && other.label.trim() === label,
  );
  if (duplicated) {
    return 'Another zone already uses this label. Zone labels must be unique.';
  }
  return null;
}

function shapeSummary(zone: Zone): string {
  switch (zone.shape) {
    case 'rect':
      return 'Rectangle zone';
    case 'circle':
      return 'Circle zone';
    case 'polygon':
      return `Polygon zone (${zone.points.length} points)`;
    default:
      return assertNever(zone);
  }
}

// Vertical rhythm: fresco fields self-space via `not-last:mb-8`; non-field
// blocks (colour controls) get a matching margin so the stack reads evenly.
function Block({ children }: { children: ReactNode }): ReactElement {
  return <div className="not-last:mb-8">{children}</div>;
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
      <Block>
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
      </Block>
      <NumberField
        label="Fill opacity"
        name="fill-opacity"
        value={element.fillOpacity}
        min={0}
        max={1}
        step={0.05}
        onCommit={(value) => updateElement(id, { fillOpacity: value })}
      />
      <Block>
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
      </Block>
      <NumberField
        label="Stroke width"
        name="stroke-width"
        value={element.strokeWidth}
        min={0.25}
        max={20}
        step={0.25}
        onCommit={(value) => updateElement(id, { strokeWidth: value })}
      />
    </>
  );
}

function LineControls({ element }: { element: LineElement }): ReactElement {
  const updateElement = useEditorStore((s) => s.updateElement);
  const id = element.id;
  return (
    <>
      <Block>
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
      </Block>
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

function TextControls({ element }: { element: TextElement }): ReactElement {
  const updateElement = useEditorStore((s) => s.updateElement);
  const id = element.id;
  return (
    <>
      <UnconnectedField
        label="Text"
        name="text-lines"
        hint="Each line becomes its own line of the label."
        component={TextAreaField}
        rows={2}
        value={linesToText(element.lines)}
        onChange={(value) =>
          updateElement(
            id,
            { lines: textToLines(value ?? '') },
            { coalesceKey: `text:${id}` },
          )
        }
      />
      <NumberField
        label="Font min (px)"
        name="font-min"
        value={element.fontMinPx}
        min={8}
        max={96}
        step={1}
        onCommit={(value) => updateElement(id, { fontMinPx: value })}
      />
      <NumberField
        label="Font scale (vmin)"
        name="font-vmin"
        value={element.fontVmin}
        min={0.5}
        max={10}
        step={0.1}
        onCommit={(value) => updateElement(id, { fontVmin: value })}
      />
      <NumberField
        label="Font max (px)"
        name="font-max"
        value={element.fontMaxPx}
        min={8}
        max={96}
        step={1}
        onCommit={(value) => updateElement(id, { fontMaxPx: value })}
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
      <UnconnectedField
        label="Alignment"
        name="text-anchor"
        component={SelectField}
        options={ANCHOR_OPTIONS}
        value={element.anchor}
        onChange={(value) => {
          const anchor = pickAnchor(value);
          if (anchor !== null) updateElement(id, { anchor });
        }}
      />
      <Block>
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
      </Block>
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

function ZoneControls({
  zone,
  zones,
}: {
  zone: Zone;
  zones: Zone[];
}): ReactElement {
  const updateZone = useEditorStore((s) => s.updateZone);
  const issue = zoneLabelIssue(zone, zones);
  return (
    <>
      <UnconnectedField
        label="Label"
        name="zone-label"
        component={InputField}
        value={zone.label}
        errors={issue ? [issue] : undefined}
        showErrors={Boolean(issue)}
        onChange={(value) =>
          updateZone(
            zone.id,
            { label: value ?? '' },
            { coalesceKey: `zone-label:${zone.id}` },
          )
        }
      />
      <Block>
        <Paragraph intent="smallText" emphasis="muted" margin="none">
          {shapeSummary(zone)}
        </Paragraph>
      </Block>
    </>
  );
}

export function PropertiesPanel(): ReactElement {
  const selection = useEditorStore((s) => s.selection);
  const doc = useEditorStore((s) => s.doc);
  const reorderSelected = useEditorStore((s) => s.reorderSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);

  const element =
    selection?.type === 'element'
      ? doc.elements.find((candidate) => candidate.id === selection.id)
      : undefined;
  const zone =
    selection?.type === 'zone'
      ? doc.zones.find((candidate) => candidate.id === selection.id)
      : undefined;

  if (!element && !zone) {
    return (
      <div className="w-64">
        <Paragraph intent="smallText" emphasis="muted" margin="none">
          Select an item to edit its properties.
        </Paragraph>
      </div>
    );
  }

  const itemLabel = element
    ? elementKindLabel(element)
    : zone
      ? `Zone “${zone.label.trim() === '' ? 'unlabelled' : zone.label}”`
      : '';

  return (
    <div className="flex max-h-[min(70vh,34rem)] w-64 flex-col">
      {/* Compact action row pinned above the scroll area so the item's identity,
          z-order, and Delete stay in view for any selection — previously these
          sat below the fold at the bottom of the scrollable fields. */}
      <div className="border-outline/40 mb-3 flex items-center gap-1 border-b pb-3">
        <span className="text-text min-w-0 flex-1 truncate text-sm font-semibold">
          {itemLabel}
        </span>
        {element && (
          <>
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
          </>
        )}
        <Button
          variant="text"
          color="destructive"
          size="sm"
          icon={<Trash2 />}
          onClick={() => deleteSelected()}
        >
          Delete
        </Button>
      </div>
      {/* Capped, scrollable field area: a text element exposes many fields, more
          than fit a popover on a short viewport. */}
      <div className="flex min-h-0 flex-col overflow-y-auto pr-1">
        {element && <ElementControls element={element} />}
        {zone && <ZoneControls zone={zone} zones={doc.zones} />}
      </div>
    </div>
  );
}
