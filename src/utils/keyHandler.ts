import { KeyStorage } from '../types/stream';

const STORAGE_KEY = 'dolive_auth_session';
const TOKEN_KEY = 'dolive_auth_token';

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore storage quota errors
  }
}

export function clearAuthToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Fetch the server-authoritative daily key from backend
export async function fetchServerDailyKey(): Promise<{ key: string; date: string } | null> {
  try {
    const res = await fetch('/api/auth/daily-key');
    if (res.ok) {
      const data = await res.json();
      if (data.key) {
        return { key: data.key, date: data.date };
      }
    }
  } catch (err) {
    console.warn('Failed to fetch server daily key:', err);
  }
  return null;
}

// Server-authoritative login
export async function authenticateWithServer(
  keyInput: string
): Promise<{ success: boolean; messageKey: string; token?: string; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: keyInput.trim() }),
    });

    const data = await res.json();

    if (res.ok && data.success && data.token) {
      setAuthToken(data.token);
      const sessionData: KeyStorage = {
        ip: '127.0.0.1',
        key: keyInput.trim(),
        date: getTodayDateString(),
        authenticated: true,
        token: data.token,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
      } catch {
        // ignore
      }
      return { success: true, messageKey: 'loginSuccess', token: data.token };
    }

    if (res.status === 429) {
      return { success: false, messageKey: 'rateLimitError', error: data.message };
    }

    return { success: false, messageKey: 'invalidKeyError', error: data.message };
  } catch (err: any) {
    return { success: false, messageKey: 'networkError', error: err.message };
  }
}

// Check session validity with server
export async function verifyServerSession(): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      return Boolean(data.authenticated);
    }
  } catch {
    // network issue
  }
  return false;
}

// Synchronous check for initial render (verified immediately by async effect)
export function isUserAuthenticated(): boolean {
  return Boolean(getAuthToken());
}

export async function logoutUser(): Promise<void> {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore network errors on logout
    }
  }
  clearAuthToken();
}
