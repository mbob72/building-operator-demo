import { useEffect, useRef, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

export const useElementSize = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
};
