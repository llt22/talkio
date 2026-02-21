import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";
import * as schema from "./schema";

export const DATABASE_NAME = "talkio.db";

let _expoDb: SQLite.SQLiteDatabase | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getExpoDb(): SQLite.SQLiteDatabase {
  if (!_expoDb) {
    _expoDb = SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
    _expoDb.execSync("PRAGMA journal_mode = WAL");
    _expoDb.execSync("PRAGMA foreign_keys = ON");
  }
  return _expoDb;
}

export const expoDb = new Proxy({} as SQLite.SQLiteDatabase, {
  get(_target, prop) {
    return (getExpoDb() as any)[prop];
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    if (!_db) {
      _db = drizzle(getExpoDb(), { schema });
    }
    return (_db as any)[prop];
  },
});
