import { KeyStorage } from '../types/stream';

const STORAGE_KEY = 'dolive_key_data';

// Generate 12-character alphanumeric key (A-Z, a-z, 0-9)
export function generateRandomKey(length: number = 12): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadKeyFromStorage(): KeyStorage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as KeyStorage;
  } catch {
    return null;
  }
}

export function saveKeyToStorage(key: string, authenticated: boolean = false): KeyStorage {
  const today = getTodayDateString();
  const data: KeyStorage = {
    ip: '127.0.0.1',
    key,
    date: today,
    authenticated,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save key in storage:', err);
  }
  return data;
}

export function getOrGenerateDailyKey(): string {
  const today = getTodayDateString();
  const saved = loadKeyFromStorage();

  if (saved && saved.date === today && saved.key) {
    return saved.key;
  }

  // Generate a new key for today
  const newKey = generateRandomKey(12);
  saveKeyToStorage(newKey, false);
  return newKey;
}

export function isKeyValidForToday(date: string): boolean {
  return date === getTodayDateString();
}

export function checkKey(inputKey: string): { valid: boolean; msgKey: string } {
  const currentDailyKey = getOrGenerateDailyKey();

  if (inputKey.trim() === currentDailyKey.trim()) {
    saveKeyToStorage(currentDailyKey, true);
    return { valid: true, msgKey: 'loginSuccess' };
  }

  return { valid: false, msgKey: 'invalidKeyError' };
}

export function isUserAuthenticated(): boolean {
  const saved = loadKeyFromStorage();
  if (!saved) return false;
  return Boolean(saved.authenticated && isKeyValidForToday(saved.date));
}

export function quickDemoLogin(): { key: string; valid: boolean } {
  const currentDailyKey = getOrGenerateDailyKey();
  saveKeyToStorage(currentDailyKey, true);
  return { key: currentDailyKey, valid: true };
}

export function logoutUser(): void {
  const currentKey = getOrGenerateDailyKey();
  saveKeyToStorage(currentKey, false);
}
