import type { ReactElement } from 'react';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import { type PreviewAspect, useEditorStore } from '~/state/editorStore';

const ASPECT_OPTIONS: { value: PreviewAspect; label: string }[] = [
  { value: 'fill', label: 'Fill' },
  { value: '16:10', label: '16:10' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
];

// Narrows the radio group's `string | number | undefined` back to the document
// union by matching an option value (no assertion needed — `find` returns the
// literal-typed option value).
function asAspect(value: unknown): PreviewAspect | null {
  return ASPECT_OPTIONS.find((o) => o.value === value)?.value ?? null;
}

// The aspect ratio only changes how the editor previews the background; it is
// not stored in the document, so no history step is recorded.
export function PreviewPanel(): ReactElement {
  const previewAspect = useEditorStore((s) => s.previewAspect);
  const setPreviewAspect = useEditorStore((s) => s.setPreviewAspect);

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
    </div>
  );
}
