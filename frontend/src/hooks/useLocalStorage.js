import { useState, useEffect, useCallback } from "react";

/**
 * Persisted state backed by localStorage. Behaves like useState but survives
 * reloads and syncs across tabs. Used to make the app "ready to use" without a backend.
 */
export function useLocalStorage(key, initialValue) {
  const readValue = useCallback(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item != null ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  }, [key, initialValue]);

  const [stored, setStored] = useState(readValue);

  const setValue = useCallback(
    (value) => {
      setStored((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore quota / privacy-mode errors */
        }
        return next;
      });
    },
    [key]
  );

  // Keep multiple tabs / mounts in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === key) setStored(readValue());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, readValue]);

  return [stored, setValue];
}
