'use client';

import { type Dispatch, type SetStateAction } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Switch from '@codaco/fresco-ui/form/fields/ToggleField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { ExportOptions } from '@codaco/network-exporters/options';

const messages = defineMessages({
  exportGraphMLFiles: {
    id: 'fresco.interviews.ExportOptionsView.exportGraphMLFiles',
    defaultMessage: 'Export GraphML Files',
    description:
      'Researcher-facing interviews / ExportOptionsView: Export GraphML Files',
  },
  graphMLIsTheMainFileFormatUsed: {
    id: 'fresco.interviews.ExportOptionsView.graphMLIsTheMainFileFormatUsed',
    defaultMessage:
      'GraphML is the main file format used by the Network Canvas software. GraphML files can be used to manually import your data into Server, and can be opened by many other pieces of network analysis software.',
    description:
      'Researcher-facing interviews / ExportOptionsView: GraphML is the main file format used by the Network Canvas software. GraphML files can be used to manually import your d',
  },
  exportCSVFiles: {
    id: 'fresco.interviews.ExportOptionsView.exportCSVFiles',
    defaultMessage: 'Export CSV Files',
    description:
      'Researcher-facing interviews / ExportOptionsView: Export CSV Files',
  },
  cSVIsAWidelyUsedFormatFor: {
    id: 'fresco.interviews.ExportOptionsView.cSVIsAWidelyUsedFormatFor',
    defaultMessage:
      'CSV is a widely used format for storing network data, but this wider compatibility comes at the expense of robustness. If you enable this format, your networks will be exported as an <tag1>attribute list file</tag1> for each node type, an <tag2>edge list file</tag2> for each edge type, and an <tag3>ego attribute file</tag3> that also contains session data.',
    description:
      'Researcher-facing interviews / ExportOptionsView: CSV is a widely used format for storing network data, but this wider compatibility comes at the expense of robustness. I',
  },
  useScreenLayoutCoordinates: {
    id: 'fresco.interviews.ExportOptionsView.useScreenLayoutCoordinates',
    defaultMessage: 'Use Screen Layout Coordinates',
    description:
      'Researcher-facing interviews / ExportOptionsView: Use Screen Layout Coordinates',
  },
  byDefaultInterviewerExportsSociogramNodeCoordinates: {
    id: 'fresco.interviews.ExportOptionsView.byDefaultInterviewerExportsSociogramNodeCoordinates',
    defaultMessage:
      'By default Interviewer exports sociogram node coordinates as normalized X/Y values (a number between 0 and 1 for each axis, with the origin in the top left). Enabling this option will store coordinates as screen space pixel values, with the same origin.',
    description:
      'Researcher-facing interviews / ExportOptionsView: By default Interviewer exports sociogram node coordinates as normalized X/Y values (a number between 0 and 1 for each ax',
  },
});

const sectionClasses = cx(
  'flex gap-4 p-4',
  '[&_div]:basis-[fit-content]',
  '[&_div:nth-child(2)]:flex [&_div:nth-child(2)]:items-center [&_div:nth-child(2)]:justify-center [&_div:nth-child(2)]:p-4',
);

const ExportOptionsView = ({
  exportOptions,
  setExportOptions,
}: {
  exportOptions: ExportOptions;
  setExportOptions: Dispatch<SetStateAction<ExportOptions>>;
}) => {
  const intl = useAppIntl();

  const handleGraphMLSwitch = (value: boolean) => {
    // When turning off, if the other format is off, enable it
    if (exportOptions.exportGraphML && !exportOptions.exportCSV) {
      setExportOptions((prevState) => {
        const updatedOptions = {
          ...prevState,
          exportCSV: !exportOptions.exportCSV,
        };
        return updatedOptions;
      });
    }
    setExportOptions((prevState) => {
      const updatedOptions = {
        ...prevState,
        exportGraphML: value,
      };
      return updatedOptions;
    });
  };

  const handleCSVSwitch = (value: boolean) => {
    // When turning off, if the other format is off, enable it
    if (exportOptions.exportCSV && !exportOptions.exportGraphML) {
      setExportOptions((prevState) => {
        const updatedOptions = {
          ...prevState,
          exportGraphML: !exportOptions.exportGraphML,
        };
        return updatedOptions;
      });
    }
    setExportOptions((prevState) => {
      const updatedOptions = {
        ...prevState,
        exportCSV: value,
      };
      return updatedOptions;
    });
  };

  const handleScreenLayoutCoordinatesSwitch = (value: boolean) =>
    setExportOptions((prevState) => {
      const updatedOptions = {
        ...prevState,
        globalOptions: {
          ...prevState.globalOptions,
          useScreenLayoutCoordinates: value,
        },
      };
      return updatedOptions;
    });

  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      <div className={sectionClasses}>
        <div>
          <Heading level="h4" variant="all-caps">
            {intl.formatMessage(messages.exportGraphMLFiles)}
          </Heading>
          <Paragraph intent="smallText">
            {intl.formatMessage(messages.graphMLIsTheMainFileFormatUsed)}
          </Paragraph>
        </div>
        <div>
          <Switch
            aria-label={intl.formatMessage(messages.exportGraphMLFiles)}
            value={exportOptions.exportGraphML}
            onChange={(v) => handleGraphMLSwitch(v ?? false)}
          />
        </div>
      </div>
      <div className={sectionClasses}>
        <div>
          <Heading level="h4" variant="all-caps">
            {intl.formatMessage(messages.exportCSVFiles)}
          </Heading>
          <Paragraph intent="smallText">
            {intl.formatMessage(messages.cSVIsAWidelyUsedFormatFor, {
              tag1: (chunks) => <strong>{chunks}</strong>,
              tag2: (chunks) => <strong>{chunks}</strong>,
              tag3: (chunks) => <strong>{chunks}</strong>,
            })}
          </Paragraph>
        </div>
        <div>
          <Switch
            aria-label={intl.formatMessage(messages.exportCSVFiles)}
            value={exportOptions.exportCSV}
            onChange={(v) => handleCSVSwitch(v ?? false)}
          />
        </div>
      </div>
      <div className={sectionClasses}>
        <div>
          <Heading level="h4" variant="all-caps">
            {intl.formatMessage(messages.useScreenLayoutCoordinates)}
          </Heading>
          <Paragraph intent="smallText">
            {intl.formatMessage(
              messages.byDefaultInterviewerExportsSociogramNodeCoordinates,
            )}
          </Paragraph>
        </div>
        <div>
          <Switch
            aria-label={intl.formatMessage(messages.useScreenLayoutCoordinates)}
            value={exportOptions.globalOptions.useScreenLayoutCoordinates}
            onChange={(v) => handleScreenLayoutCoordinatesSwitch(v ?? false)}
          />
        </div>
      </div>
    </div>
  );
};

export default ExportOptionsView;
