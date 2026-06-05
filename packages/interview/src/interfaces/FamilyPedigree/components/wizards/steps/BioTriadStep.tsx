'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import FieldGroup from '@codaco/fresco-ui/form/FieldGroup';
import FieldNamespace, {
  useFieldNamespace,
} from '@codaco/fresco-ui/form/FieldNamespace';
import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import PersonFields from '~/interfaces/FamilyPedigree/components/quickStartWizard/PersonFields';

import type { BioTriadOption } from './bioTriadOptions';

type NodeOption = BioTriadOption;

type BioTriadConfig = {
  existingNodes?: NodeOption[];
  preselection?: {
    eggSource?: string;
    spermSource?: string;
    carrier?: string;
  };
};

const BioTriadConfigContext = createContext<BioTriadConfig>({});

function BioTriadConfigProvider({
  value,
  children,
}: {
  value: BioTriadConfig;
  children: ReactNode;
}) {
  return (
    <BioTriadConfigContext.Provider value={value}>
      {children}
    </BioTriadConfigContext.Provider>
  );
}

function useBioTriadConfig() {
  return useContext(BioTriadConfigContext);
}

type ParentSectionProps = {
  roleKey: string;
  roleLabel: string;
  selectLabel: string;
  selectHint: string;
  donorFieldName: string;
  donorLabel: string;
  options: NodeOption[];
  /**
   * Field name of the other role. Choosing its currently-selected person here
   * clears it there, so one person can't be both the egg and sperm parent.
   */
  excludeSelectionFrom: string;
  initialValue?: string;
  carriedFieldName?: string;
  carriedLabel?: string;
  carriedHint?: string;
};

function ParentSection({
  roleKey,
  roleLabel,
  selectLabel,
  selectHint,
  donorFieldName,
  donorLabel,
  options,
  excludeSelectionFrom,
  initialValue,
  carriedFieldName,
  carriedLabel,
  carriedHint,
}: ParentSectionProps) {
  const ownValue = useFormValue([roleKey])[roleKey];
  const otherValue = useFormValue([excludeSelectionFrom])[excludeSelectionFrom];
  const namespace = useFieldNamespace();
  const setFieldValue = useFormStore((state) => state.setFieldValue);

  // When this role is set to the person already chosen for the other role,
  // clear the other role (rather than disabling the option, which would make a
  // short list unchangeable). Both roles are required, so the user must re-pick.
  const previousOwnValue = useRef(ownValue);
  useEffect(() => {
    const changed = ownValue !== previousOwnValue.current;
    previousOwnValue.current = ownValue;
    if (
      changed &&
      typeof ownValue === 'string' &&
      ownValue !== 'new' &&
      ownValue === otherValue
    ) {
      const resolvedOther = namespace
        ? `${namespace}.${excludeSelectionFrom}`
        : excludeSelectionFrom;
      setFieldValue(resolvedOther, undefined);
    }
  }, [ownValue, otherValue, namespace, excludeSelectionFrom, setFieldValue]);

  const onlyNewOption = options.length === 1 && options[0]?.value === 'new';

  return (
    <Surface level={1} spacing="sm" shadow="sm" noContainer>
      <Heading level="h4">{roleLabel}</Heading>
      {onlyNewOption ? (
        <div className="hidden">
          <Field
            name={roleKey}
            label={roleLabel}
            component={RadioGroupField}
            options={[{ value: 'new', label: 'new' }]}
            initialValue="new"
          />
        </div>
      ) : (
        <Field
          name={roleKey}
          label={selectLabel}
          hint={selectHint}
          component={RadioGroupField}
          options={options}
          initialValue={initialValue}
          required
        />
      )}
      <FieldGroup
        watch={[roleKey]}
        condition={(values) => values[roleKey] === 'new'}
      >
        <PersonFields namespace={`new-${roleKey}`} />
      </FieldGroup>
      {/* The donor and carrier questions stay visible regardless of the
          current selection, so resetting a colliding parent never hides them. */}
      <Field
        name={donorFieldName}
        label={donorLabel}
        component={BooleanField}
        initialValue={false}
        required
      />
      {carriedFieldName && carriedLabel && (
        <Field
          name={carriedFieldName}
          label={carriedLabel}
          hint={carriedHint}
          component={BooleanField}
          initialValue={true}
          required
        />
      )}
    </Surface>
  );
}

export default function BioTriadStep({ prefix }: { prefix?: string } = {}) {
  const { existingNodes, preselection } = useBioTriadConfig();
  const nodeOptions = useMemo(() => existingNodes ?? [], [existingNodes]);

  const parentOptions = useMemo(
    () => [...nodeOptions, { value: 'new', label: 'Create a new person' }],
    [nodeOptions],
  );

  const carrierOptions = useMemo(
    () => [...nodeOptions, { value: 'new', label: 'Create a new person' }],
    [nodeOptions],
  );

  const carrierOnlyNewOption =
    carrierOptions.length === 1 && carrierOptions[0]?.value === 'new';

  const content = (
    <div className="flex flex-col gap-6">
      <ParentSection
        roleKey="egg-source"
        roleLabel="Egg Parent"
        selectLabel="Who provided the egg?"
        selectHint="Select the person who contributed the egg. If this was an egg donor, you can indicate that below."
        donorFieldName="egg-source-is-donor"
        donorLabel="Was this person an egg donor?"
        options={parentOptions}
        excludeSelectionFrom="sperm-source"
        initialValue={preselection?.eggSource}
        carriedFieldName="egg-parent-carried"
        carriedLabel="Did this person carry the pregnancy?"
        carriedHint="If someone else carried the pregnancy (e.g. a gestational carrier or surrogate), select 'No'."
      />

      <FieldGroup
        watch={['egg-parent-carried']}
        condition={(values) => values['egg-parent-carried'] === false}
      >
        <Surface level={1} spacing="sm" shadow="sm" noContainer>
          <Heading level="h4">Gestational Carrier</Heading>
          {carrierOnlyNewOption ? (
            <div className="hidden">
              <Field
                name="carrier-source"
                label="Gestational Carrier"
                component={RadioGroupField}
                options={[{ value: 'new', label: 'new' }]}
                initialValue="new"
              />
            </div>
          ) : (
            <Field
              name="carrier-source"
              label="Who carried the pregnancy?"
              hint="Select the person who carried the pregnancy, or create a new person."
              component={RadioGroupField}
              options={carrierOptions}
              initialValue={preselection?.carrier}
              required
            />
          )}
          <FieldGroup
            watch={['carrier-source']}
            condition={(values) => values['carrier-source'] === 'new'}
          >
            <PersonFields namespace="new-carrier" />
          </FieldGroup>
        </Surface>
      </FieldGroup>

      <ParentSection
        roleKey="sperm-source"
        roleLabel="Sperm Parent"
        selectLabel="Who provided the sperm?"
        selectHint="Select the person who contributed the sperm. If this was a sperm donor, you can indicate that below."
        donorFieldName="sperm-source-is-donor"
        donorLabel="Was this person a sperm donor?"
        options={parentOptions}
        excludeSelectionFrom="egg-source"
        initialValue={preselection?.spermSource}
      />
    </div>
  );

  return prefix ? (
    <FieldNamespace prefix={prefix}>{content}</FieldNamespace>
  ) : (
    content
  );
}

export type { BioTriadConfig };
export { BioTriadConfigContext, BioTriadConfigProvider };
