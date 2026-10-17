// Only the newest snapshot may replace the workspace. Invalidate on mutations
// and authentication changes so a slow response cannot restore an old account.
export function createWorkspaceSync<T>(load: () => Promise<T>, apply: (value: T) => void, failed: (error: unknown) => void) {
  let version = 0;
  return {
    invalidate() { version++; },
    async refresh(): Promise<void> {
      const requestVersion = ++version;
      try {
        const value = await load();
        if (requestVersion === version) apply(value);
      } catch (error) {
        if (requestVersion !== version) return;
        failed(error);
        throw error;
      }
    },
  };
}

// A failed read after a successful write must never turn that write into an
// apparent failure and encourage the user to repeat it.
export async function commitAndRefresh<T>(commit: () => Promise<T>, saved: (value: T) => void, refresh: () => Promise<void>, refreshFailed: () => void): Promise<T> {
  const value = await commit();
  saved(value);
  try { await refresh(); } catch { refreshFailed(); }
  return value;
}
