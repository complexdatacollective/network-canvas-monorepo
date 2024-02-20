import { CheckSquare, XOctagon } from 'lucide-react';
import { MDXRemote } from 'next-mdx-remote/rsc';
import CustomParagraph from './CustomParagraph';
import CustomAnchor from './CustomAnchor';
import { options } from '@/lib/mdxOptions';

type BestPracticesProps = {
  data: {
    good: string[];
    bad: string[];
  };
};

const BestPractices = ({ data }: BestPracticesProps) => {
  return (
    <div>
      <div>
        <p className="text-sm font-bold uppercase">Best Practices</p>
        <ul className="list-none">
          {data.good.map((item) => (
            <li className="flex items-start gap-3" key={item}>
              <span>
                <CheckSquare size={'19px'} className="mt-1.5 text-green-500" />
              </span>
              <MDXRemote
                options={options}
                components={{ p: CustomParagraph, a: CustomAnchor }}
                source={item}
              />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-sm font-bold uppercase">Try To Avoid</p>
        <ul className="list-none">
          {data.bad.map((item) => (
            <li className="flex items-start gap-3" key={item}>
              <span>
                <XOctagon size={'19px'} className="mt-1.5 text-red-500" />
              </span>
              <MDXRemote
                options={options}
                components={{ p: CustomParagraph, a: CustomAnchor }}
                source={item}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default BestPractices;
