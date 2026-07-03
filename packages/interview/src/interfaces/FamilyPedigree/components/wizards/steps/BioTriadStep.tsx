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
import { FRAMING_TERMS } from '@codaco/shared-consts';
import PersonFields from '~/interfaces/FamilyPedigree/components/quickStartWizard/PersonFields';
import { useFramedTerms } from '~/interfaces/FamilyPedigree/hooks/useFramedTerms';
import type { GameteRole } from '~/interfaces/FamilyPedigree/store';

import type { BioTriadOption } from './bioTriadOptions';

type NodeOption = BioTriadOption;

type BioTriadConfig = {
  existingNodes?: NodeOption[];
  /**
   * The gamete role each existing node is already nominated for elsewhere. A
   * known egg parent is dropped from the sperm list and vice versa.
   */
  gameteRoles?: Map<string, GameteRole>;
  preselection?: {
    eggSource?: string;
    spermSource?: string;
    carrier?: string;
    /** Whether the egg parent carried the pregnancy themselves. Defaults true. */
    eggParentCarried?: boolean;
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
  carriedInitialValue?: boolean;
  /**
   * Whether to ask for biological sex when creating a new person in this role.
   * False for egg/sperm sources — their sex derives from gameteRole.
   */
  askBiologicalSex?: boolean;
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
  carriedInitialValue = true,
  askBiologicalSex = false,
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
    <Surface spacing="sm" shadow="sm" noContainer>
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
        <PersonFields
          namespace={`new-${roleKey}`}
          askBiologicalSex={askBiologicalSex}
        />
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
          initialValue={carriedInitialValue}
          required
        />
      )}
    </Surface>
  );
}

export default function BioTriadStep({ prefix }: { prefix?: string } = {}) {
  const { existingNodes, preselection, gameteRoles } = useBioTriadConfig();
  const nodeOptions = useMemo(() => existingNodes ?? [], [existingNodes]);
  const terms = useFramedTerms() ?? FRAMING_TERMS.gamete;

  // A node already nominated as an egg parent elsewhere can't be a sperm parent
  // here, and vice versa. The carrier can be anyone, so it stays unfiltered.
  const eggOptions = useMemo(
    () => [
      ...nodeOptions.filter((o) => gameteRoles?.get(o.value) !== 'sperm'),
      { value: 'new', label: 'Create a new person' },
    ],
    [nodeOptions, gameteRoles],
  );

  const spermOptions = useMemo(
    () => [
      ...nodeOptions.filter((o) => gameteRoles?.get(o.value) !== 'egg'),
      { value: 'new', label: 'Create a new person' },
    ],
    [nodeOptions, gameteRoles],
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
        roleLabel={terms.eggParent}
        selectLabel={terms.eggProviderQuestion}
        selectHint={terms.eggProviderHint}
        donorFieldName="egg-source-is-donor"
        donorLabel={terms.eggDonorQuestion}
        options={eggOptions}
        excludeSelectionFrom="sperm-source"
        initialValue={preselection?.eggSource}
        carriedInitialValue={preselection?.eggParentCarried ?? true}
        carriedFieldName="egg-parent-carried"
        carriedLabel="Did this person carry the pregnancy?"
        carriedHint="If someone else carried the pregnancy (e.g. a gestational carrier or surrogate), select 'No'."
        askBiologicalSex={false}
      />

      <FieldGroup
        watch={['egg-parent-carried']}
        condition={(values) => values['egg-parent-carried'] === false}
      >
        <Surface spacing="sm" shadow="sm" noContainer>
          <Heading level="h4">{terms.gestationalCarrier}</Heading>
          {carrierOnlyNewOption ? (
            <div className="hidden">
              <Field
                name="carrier-source"
                label={terms.gestationalCarrier}
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
        roleLabel={terms.spermParent}
        selectLabel={terms.spermProviderQuestion}
        selectHint={terms.spermProviderHint}
        donorFieldName="sperm-source-is-donor"
        donorLabel={terms.spermDonorQuestion}
        options={spermOptions}
        excludeSelectionFrom="egg-source"
        initialValue={preselection?.spermSource}
        askBiologicalSex={false}
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
