"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Key = "canvas" | "avatar-portraits" | "genjutsu-favs" | "frameflow-styles" | "characters" | "character-videos" | "character-settings";

const cacheKey = (key: Key) => `hubd.state.${key}`;

function readCache<T>(key: Key, legacyKey?: string): T | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(key)) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Estado de tela guardado no servidor, com cópia no navegador para abrir na hora.
 * O valor do servidor vence; se o servidor ainda não tem nada, o valor local é enviado para ele.
 * `legacyKey` lê a chave antiga do localStorage, para não perder o que já existia.
 */
export function useSyncedState<T>(key: Key, initial: T, legacyKey?: string): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const serverOk = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const local = readCache<T>(key, legacyKey);
    if (local !== undefined) setValue(local);
    let cancelled = false;
    api<{ storage: string | null; value: T | null }>(`/api/state/${key}`)
      .then(({ storage, value: remote }) => {
        if (cancelled || !storage) return;
        serverOk.current = true;
        if (remote !== null) {
          setValue(remote);
          writeLocal(key, remote);
        } else if (local !== undefined) {
          push(key, local);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [key, legacyKey]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeLocal(key, v);
        if (serverOk.current) {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => push(key, v), 600);
        }
        return v;
      });
    },
    [key],
  );

  return [value, update, loaded];
}

function writeLocal(key: Key, value: unknown) {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify(value));
  } catch {
    // storage cheio ou bloqueado
  }
}

function push(key: Key, value: unknown) {
  api(`/api/state/${key}`, { method: "PUT", body: JSON.stringify({ value }) }).catch(() => {});
}
