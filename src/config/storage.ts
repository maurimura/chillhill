export const storageKeys = {
  settings: 'chillhill.settings.v1',
  scenes: 'chillhill.scenes.v1',
} as const;

// Compatibility only: keep earlier saves as a backup, never write to these keys.
const legacyKeys = {
  settings: 'chill-the-hill.settings.v1',
  scenes: 'chill-the-hill.scenes.v1',
} as const;

interface StorageAccess {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStored(storage: StorageAccess, kind: keyof typeof storageKeys) {
  const current = storage.getItem(storageKeys[kind]);
  if (current !== null) return current;
  const legacy = storage.getItem(legacyKeys[kind]);
  if (legacy !== null) {
    try {
      storage.setItem(storageKeys[kind], legacy);
    } catch {
      // Quota/read-only storage must not prevent using an existing save.
    }
  }
  return legacy;
}
