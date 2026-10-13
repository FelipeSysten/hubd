"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { useJobs } from "@/components/JobsProvider";
import { useSyncedState } from "@/components/useSyncedState";
import { post } from "@/lib/client";
import {
  DEFAULT_SETTINGS,
  EXTRA_VIEWS,
  cardRequest,
  viewPrompt,
  type BaseVideo,
  type Character,
  type CharacterImage,
  type CharacterLibrary,
  type CharacterSettings,
} from "@/lib/character";
import { TERMINAL } from "@/lib/models";

type Ctx = {
  library: CharacterLibrary;
  loaded: boolean;
  videos: BaseVideo[];
  settings: CharacterSettings;
  setSettings: (s: CharacterSettings) => void;
  addCharacter: (c: Character) => void;
  updateCharacter: (id: string, patch: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
  addFolder: (name: string) => void;
  removeFolder: (name: string) => void;
  addVideo: (v: BaseVideo) => void;
  removeVideo: (id: string) => void;
  /** Copia a imagem para o armazenamento permanente (Blob/local); se não houver, mantém a original. */
  persist: (url: string) => Promise<{ url: string; durable: boolean }>;
  /** Pede as vistas extras (frente, perfil, 3/4) a partir do card. */
  requestViews: (c: Character, yellow: boolean) => Promise<void>;
};

const CharacterContext = createContext<Ctx | null>(null);
const EMPTY: CharacterLibrary = { characters: [], folders: [] };

export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const { jobs, submit } = useJobs();
  const [library, setLibrary, loaded] = useSyncedState<CharacterLibrary>("characters", EMPTY);
  const [videos, setVideos] = useSyncedState<BaseVideo[]>("character-videos", []);
  const [settings, setSettingsState] = useSyncedState<CharacterSettings>("character-settings", DEFAULT_SETTINGS);
  const attaching = useRef(new Set<string>());

  const updateCharacter = useCallback(
    (id: string, patch: Partial<Character>) =>
      setLibrary((lib) => ({ ...lib, characters: lib.characters.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
    [setLibrary],
  );

  const persist = useCallback(async (url: string) => {
    try {
      return await post<{ url: string; durable: boolean }>("/api/media/persist", { url });
    } catch {
      return { url, durable: false };
    }
  }, []);

  const requestViews = useCallback(
    async (c: Character, yellow: boolean) => {
      const card = c.images.find((i) => i.view === "card") ?? c.images[0];
      if (!card) return;
      const refs = await publicRefs([card.url]);
      const pending: Record<string, CharacterImage["view"]> = {};
      for (const v of EXTRA_VIEWS) {
        const { endpoint, input } = cardRequest(settings.viewsModel, viewPrompt(v.prompt, yellow), refs);
        try {
          const job = await submit({ module: "character", endpoint, input, label: `Vista ${v.view} · ${c.name}`, prompt: c.name });
          pending[job.id] = v.view;
        } catch {
          // segue com as outras vistas
        }
      }
      if (Object.keys(pending).length) updateCharacter(c.id, { pendingViews: { ...(c.pendingViews ?? {}), ...pending } });
    },
    [settings.viewsModel, submit, updateCharacter],
  );

  // Quando uma vista termina, guarda a imagem e anexa ao personagem (funciona mesmo depois de recarregar).
  useEffect(() => {
    if (!loaded) return;
    for (const c of library.characters) {
      for (const [jobId, view] of Object.entries(c.pendingViews ?? {})) {
        const job = jobs.find((j) => j.id === jobId);
        if (!job || !TERMINAL.includes(job.status) || attaching.current.has(jobId)) continue;
        attaching.current.add(jobId);
        (async () => {
          const url = job.status === "completed" ? job.images?.[0] : undefined;
          const saved = url ? await persist(url) : null;
          setLibrary((lib) => ({
            ...lib,
            characters: lib.characters.map((x) => {
              if (x.id !== c.id) return x;
              const { [jobId]: _, ...rest } = x.pendingViews ?? {};
              return {
                ...x,
                pendingViews: rest,
                images: saved ? [...x.images, { url: saved.url, view }] : x.images,
                temporary: x.temporary || (saved ? !saved.durable : false),
              };
            }),
          }));
        })();
      }
    }
  }, [jobs, library.characters, loaded, persist, setLibrary]);

  const value: Ctx = {
    library,
    loaded,
    videos,
    settings,
    setSettings: setSettingsState,
    addCharacter: (c) => setLibrary((lib) => ({ ...lib, characters: [c, ...lib.characters] })),
    updateCharacter,
    removeCharacter: (id) => setLibrary((lib) => ({ ...lib, characters: lib.characters.filter((c) => c.id !== id) })),
    addFolder: (name) => setLibrary((lib) => (lib.folders.includes(name) ? lib : { ...lib, folders: [...lib.folders, name] })),
    removeFolder: (name) =>
      setLibrary((lib) => ({
        folders: lib.folders.filter((f) => f !== name),
        characters: lib.characters.map((c) => (c.folder === name ? { ...c, folder: null } : c)),
      })),
    addVideo: (v) => setVideos((list) => [v, ...list].slice(0, 60)),
    removeVideo: (id) => setVideos((list) => list.filter((v) => v.id !== id)),
    persist,
    requestViews,
  };

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>;
}

export function useCharacters() {
  const ctx = useContext(CharacterContext);
  if (!ctx) throw new Error("useCharacters fora de CharacterProvider");
  return ctx;
}

/** URLs que a API consegue baixar (imagens guardadas localmente são publicadas na hora). */
export async function publicRefs(urls: string[]): Promise<string[]> {
  if (urls.every((u) => /^https:\/\//.test(u))) return urls;
  const { urls: out } = await post<{ urls: string[] }>("/api/media/public", { urls });
  return out;
}
