import { useSyncExternalStore } from 'react';

import { user } from '@/data';

import { useQuery } from './useQuery';

// useQuery that also re-runs whenever user state changes (save, view, review),
// so e.g. saving on Detail refreshes Gallery and Search without a reload.
export function useUserQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const version = useSyncExternalStore(user.subscribe, user.version, user.version);
  return useQuery(fn, [...deps, version]);
}
