import test from 'node:test';
import assert from 'node:assert/strict';
import { readStored, storageKeys } from '../src/config/storage.ts';

function memoryStorage(entries: [string, string][] = []) {
  const data = new Map(entries);
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

test('fresh profiles do not create empty migration records', () => {
  const storage = memoryStorage();
  assert.equal(readStored(storage, 'settings'), null);
  assert.equal(readStored(storage, 'scenes'), null);
  assert.equal(storage.data.size, 0);
});

test('legacy settings and scenes are copied byte-for-byte and retained as backups', () => {
  for (const kind of ['settings', 'scenes'] as const) {
    const legacyKey = `chill-the-hill.${kind}.v1`;
    const value =
      kind === 'settings'
        ? '{"car":"astra-sedan","paint":{"astra-sedan":"#123456"}}'
        : '[{"name":"My coast","settings":{"landscape":"coast"}}]';
    const storage = memoryStorage([[legacyKey, value]]);
    assert.equal(readStored(storage, kind), value);
    assert.equal(storage.data.get(storageKeys[kind]), value);
    assert.equal(storage.data.get(legacyKey), value);
  }
});

test('new saves take precedence and an emptied scene shelf does not restore deleted copies', () => {
  for (const kind of ['settings', 'scenes'] as const) {
    const current = kind === 'settings' ? '{"car":"wagon"}' : '[]';
    const legacyKey = `chill-the-hill.${kind}.v1`;
    const storage = memoryStorage([
      [legacyKey, '{"old":true}'],
      [storageKeys[kind], current],
    ]);
    assert.equal(readStored(storage, kind), current);
    assert.equal(storage.data.get(legacyKey), '{"old":true}');
    assert.equal(storage.data.size, 2);
  }
});

test('legacy saves still load when migration writes are blocked', () => {
  const storage = memoryStorage([['chill-the-hill.settings.v1', '{"car":"wagon"}']]);
  storage.setItem = () => {
    throw new Error('Storage quota');
  };
  assert.equal(readStored(storage, 'settings'), '{"car":"wagon"}');
  assert.equal(storage.data.has(storageKeys.settings), false);
});
