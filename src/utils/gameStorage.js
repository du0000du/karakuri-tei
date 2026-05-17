/**
 * gameStorage.js — window.storage 互換 API（Claude Artifacts 形式に完全準拠）
 *
 * Claude Artifacts の window.storage API に合わせる:
 *   get(key)       → Promise<{value: string} | null>
 *   set(key, str)  → Promise<void>
 *   delete(key)    → Promise<void>
 *   list()         → Promise<string[]>
 *
 * ログイン済み: Firestore /user_progress/{uid} に保存
 * 未ログイン:   localStorage にフォールバック
 */
import { auth, db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION = 'user_progress';
const LOCAL_PREFIX = 'karakuri:storage:';

async function loadDoc() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const ref = doc(db, COLLECTION, uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : {};
}

async function saveDoc(data) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const ref = doc(db, COLLECTION, uid);
  await setDoc(ref, data, { merge: false });
}

export const gameStorage = {
  async get(key) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      const raw = localStorage.getItem(LOCAL_PREFIX + key);
      return raw !== null ? { value: raw } : null;
    }
    const data = await loadDoc();
    const val = data?.[key];
    return val !== undefined ? { value: val } : null;
  },

  async set(key, value) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      localStorage.setItem(LOCAL_PREFIX + key, value);
      return;
    }
    const data = (await loadDoc()) || {};
    data[key] = value;
    await saveDoc(data);
  },

  async delete(key) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      localStorage.removeItem(LOCAL_PREFIX + key);
      return;
    }
    const data = (await loadDoc()) || {};
    delete data[key];
    await saveDoc(data);
  },

  async list() {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      return Object.keys(localStorage)
        .filter(k => k.startsWith(LOCAL_PREFIX))
        .map(k => k.slice(LOCAL_PREFIX.length));
    }
    const data = (await loadDoc()) || {};
    return Object.keys(data);
  },
};

// window.storage として公開（KarakuriTei.jsx が参照）
if (typeof window !== 'undefined') {
  window.storage = gameStorage;
}
