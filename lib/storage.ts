  import { openDB, type DBSchema, type IDBPDatabase } from "idb";
  import type { Project } from "@/lib/types";

  interface AppDB extends DBSchema {
    projects: {
      key: string;
      value: Project;
    };
  }

  const DB_NAME = "ai-video-cutter";
  const DB_VERSION = 1;
  const STORE = "projects";
  const CURRENT_KEY = "current";

  let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

  function getDB(): Promise<IDBPDatabase<AppDB>> {
    if (dbPromise === null) {
      dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        },
      });
    }
    return dbPromise;
  }

  export async function saveProject(project: Project): Promise<void> {
    const db = await getDB();
    await db.put(STORE, project, CURRENT_KEY);
  }

  export async function loadProject(): Promise<Project | undefined> {
    const db = await getDB();
    return db.get(STORE, CURRENT_KEY);
  }

  export async function hasProject(): Promise<boolean> {
    const project = await loadProject();
    return project !== undefined;
  }

  export async function clearProject(): Promise<void> {
    const db = await getDB();
    await db.delete(STORE, CURRENT_KEY);
  }

