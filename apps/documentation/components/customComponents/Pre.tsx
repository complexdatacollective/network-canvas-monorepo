import CodeCopyButton from './CodeCopyButton';

type PreProps = React.HTMLAttributes<HTMLPreElement> & {
  children: React.ReactNode;
  raw?: string;
};

const Pre = ({ raw, children, ...props }: PreProps) => {
  return (
    <div className="relative my-5 overflow-hidden rounded-xl group">
      <pre {...props}>{children}</pre>
      {raw && <CodeCopyButton code={raw} />}
    </div>
  );
};

export default Pre;
