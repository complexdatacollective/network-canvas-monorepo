import CodeCopyButton from './CodeCopyButton';

type PreProps = React.HTMLAttributes<HTMLPreElement> & {
  children: React.ReactNode;
  raw?: string;
};

const Pre = ({ raw, children, ...props }: PreProps) => {
  return (
    <div className="group bg-rich-black relative my-5 overflow-hidden rounded-xl last:mb-0">
      <pre {...props} className="[&_code]:bg-transparent">
        {children}
      </pre>
      {raw && <CodeCopyButton code={raw} />}
    </div>
  );
};

export default Pre;
