import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface KanbanFilesDB extends DBSchema {
  files: {
    key: string;
    value: {
      id: string;
      name: string;
      type: string;
      file: Blob;
      createdAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<KanbanFilesDB>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<KanbanFilesDB>('kanban-files', 1, {
      upgrade(db) {
        db.createObjectStore('files', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
};

export const saveFile = async (fileData: { id: string; name: string; type: string; file: Blob; createdAt: number }) => {
  const db = await getDB();
  await db.put('files', fileData);
};

export const getFile = async (id: string) => {
  const db = await getDB();
  return db.get('files', id);
};

export const deleteFileLocal = async (id: string) => {
  const db = await getDB();
  await db.delete('files', id);
};
