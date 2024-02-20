import { Card, CardContent } from '@/components/ui/card';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Clock } from 'lucide-react';
import CustomAnchor from './CustomAnchor';
import { options } from '@/lib/mdxOptions';

type SummaryCardProps = {
  data: {
    summary: string;
    prerequisites: string;
    completion_time: string;
  };
};

const SummaryCard = ({ data }: SummaryCardProps) => {
  return (
    <Card className="bg-slate-200 text-black dark:bg-slate-600 dark:text-white">
      <CardContent className="p-4">
        <div className="text-sm">
          <span className="font-bold">SUMMARY:</span>
          <MDXRemote
            options={options}
            components={{ a: CustomAnchor }}
            source={data.summary}
          />
        </div>
        <div className="text-sm">
          <span className="font-bold">PREREQUISITES:</span>
          <MDXRemote
            options={options}
            components={{ a: CustomAnchor }}
            source={data.prerequisites}
          />
        </div>
        <div className="text-sm">
          <span className="block font-bold">DURATION:</span>
          <div className="flex gap-1">
            <Clock size={'20px'} />
            {data.completion_time}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SummaryCard;
