import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Tag from './Tag';
const messages = defineMessages({
  notInUse: {
    id: 'architect.codebook.usageColumn.notInUse',
    defaultMessage: 'not in use',
    description: 'Visible text in components / Codebook / UsageColumn.',
  },
});

type UsageItem = {
  id?: string;
  label: string;
};

type UsageColumnProps = {
  usage: UsageItem[];
  inUse: boolean;
};

const UsageColumn = ({ inUse, usage }: UsageColumnProps) => {
  const intl = useAppIntl();
  if (!inUse) {
    return (
      <Tag key="unused" notUsed>
        {intl.formatMessage(messages.notInUse)}
      </Tag>
    );
  }

  const stages = usage.map(({ id, label }, index) => {
    // If there is no id, don't create a link. This is the case for
    // variables that are only in use as validation options. Include the index
    // in the key since validation labels can repeat (e.g. "unknown").
    if (!id) {
      return <Tag key={`validation-option-${index}`}>{label}</Tag>;
    }

    const href = `/protocol/stage/${id}`;

    return (
      <Link key={id} href={href}>
        <Tag>{label}</Tag>
      </Link>
    );
  });

  return (
    <div className="flex flex-col items-start *:m-1" key="usage">
      {stages}
    </div>
  );
};

export default UsageColumn;
