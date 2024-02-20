// This component might be useful when we want to display documents client-side
// We can delete it before production release in case we don't use it.
// This component is not being used now

'use client';

import { MDXRemote, type MDXRemoteSerializeResult } from 'next-mdx-remote';
import { serialize } from 'next-mdx-remote/serialize';
import React, { useEffect, useState } from 'react';
import { env } from '@/env.mjs';

const ShowMDX = ({ content }: { content: string }) => {
  const [mdxSource, setMdxSource] = useState<MDXRemoteSerializeResult | null>(
    null,
  );

  useEffect(() => {
    async function getSerializedContent() {
      const result = await serialize(content, {
        mdxOptions: {
          development: env.NODE_ENV === 'development',
        },
      });
      setMdxSource(result);
    }

    void getSerializedContent();
  }, [content]);

  return (
    <article className="w-[500px] overflow-hidden overflow-ellipsis whitespace-nowrap">
      {mdxSource && <MDXRemote {...mdxSource} />}
    </article>
  );
};

export default ShowMDX;
