import { openDB } from 'idb'

export interface ProgressPhoto {
  id: string
  takenAt: string
  dataUrl: string
  note?: string
}

const DB_NAME = 'gem3'
const STORE = 'photos'

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'id' })
    },
  })
}

export async function savePhoto(photo: ProgressPhoto): Promise<void> {
  const db = await getDb()
  await db.put(STORE, photo)
}

export async function loadAllPhotos(): Promise<ProgressPhoto[]> {
  const db = await getDb()
  const all = (await db.getAll(STORE)) as ProgressPhoto[]
  return all.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE, id)
}
