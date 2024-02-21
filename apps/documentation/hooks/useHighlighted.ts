'use client';

import { useEffect, useRef, useState } from 'react';

const useHighlighted = (
  id: string,
): [boolean, React.Dispatch<React.SetStateAction<string>>] => {
  const observer = useRef<IntersectionObserver | null>(null);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const handleObserver = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveId(entry.target.id);
        }
      });
    };

    observer.current = new IntersectionObserver(handleObserver, {
      rootMargin: '0% 0% -75% 0px',
    });

    const elements = document.querySelectorAll('h2, h3, h4, h5, h6');
    elements.forEach((elem) => observer.current?.observe(elem));

    return () => observer.current?.disconnect();
  }, []);

  return [activeId === id, setActiveId];
};

export default useHighlighted;
