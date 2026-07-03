import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import Grid from '../../Grid';
import ItemEditor from './ItemEditor';
import ItemPreview from './ItemPreview';
import { denormalizeType, normalizeType } from './itemTypes';
import { capacity } from './options';

const ContentGrid = ({ form, ...restProps }: StageEditorSectionProps) => (
  <Grid
    previewComponent={
      ItemPreview as unknown as React.ComponentType<Record<string, unknown>>
    }
    editComponent={
      ItemEditor as unknown as React.ComponentType<Record<string, unknown>>
    }
    normalize={
      normalizeType as unknown as (
        item: Record<string, unknown>,
      ) => Record<string, unknown>
    }
    itemSelector={
      denormalizeType as (state: unknown, props: unknown) => unknown
    }
    title="Edit Items"
    capacity={capacity}
    form={form}
    disabled={false}
    {...restProps}
  />
);

export default ContentGrid;
