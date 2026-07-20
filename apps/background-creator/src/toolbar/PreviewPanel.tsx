import type { ReactElement } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import {
  type PreviewAspect,
  type PreviewSurface,
  useEditorStore,
} from '~/state/editorStore';

const ASPECT_OPTIONS: { value: PreviewAspect; label: string }[] = [
  { value: 'fill', label: 'Fill' },
  { value: '16:10', label: '16:10' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
];

const SURFACE_OPTIONS: { value: PreviewSurface; label: string }[] = [
  { value: 'interview', label: 'Interview (dark)' },
  { value: 'light', label: 'Light' },
  { value: 'checker', label: 'Checkerboard' },
];

// Narrows the radio group's `string | number | undefined` back to the document
// union by matching an option value (no assertion needed — `find` returns the
// literal-typed option value).
function asAspect(value: unknown): PreviewAspect | null {
  return ASPECT_OPTIONS.find((o) => o.value === value)?.value ?? null;
}

function asSurface(value: unknown): PreviewSurface | null {
  return SURFACE_OPTIONS.find((o) => o.value === value)?.value ?? null;
}

// Aspect and surface only change how the editor previews the background; they
// are not stored in the document, so no history step is recorded.
export function PreviewPanel(): ReactElement {
  const previewAspect = useEditorStore((s) => s.previewAspect);
  const previewSurface = useEditorStore((s) => s.previewSurface);
  const setPreviewAspect = useEditorStore((s) => s.setPreviewAspect);
  const setPreviewSurface = useEditorStore((s) => s.setPreviewSurface);

  return (
    <div className="@container w-64">
      <UnconnectedField
        label="Aspect ratio"
        name="preview-aspect"
        component={RadioGroupField}
        orientation="horizontal"
        useColumns
        size="sm"
        options={ASPECT_OPTIONS}
        value={previewAspect}
        onChange={(value) => {
          const next = asAspect(value);
          if (next) setPreviewAspect(next);
        }}
      />
      <UnconnectedField
        label="Surface"
        name="preview-surface"
        component={RadioGroupField}
        size="sm"
        options={SURFACE_OPTIONS}
        value={previewSurface}
        onChange={(value) => {
          const next = asSurface(value);
          if (next) setPreviewSurface(next);
        }}
      />
    </div>
  );
}
