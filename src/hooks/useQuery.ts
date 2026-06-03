import { useEffect, useState } from 'react';

// Minimal async data hook. Works for the mock today and for async SQLite later.
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]): {
  data: T | undefined;
  loading: boolean;
} {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((res) => {
      if (alive) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading };
}
