import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { listWorkspaces, type Workspace } from '@/services/workspaces';

export type WorkspacesStatus = 'idle' | 'loading' | 'ready' | 'error';

interface WorkspaceContextValue {
  status: WorkspacesStatus;
  workspaces: Workspace[];
  /** El negocio con el que se está trabajando (null si todavía no tiene ninguno). */
  active: Workspace | null;
  setActive: (id: string) => void;
  /** Agrega o reemplaza un negocio; con `activate` pasa a ser el activo. */
  upsert: (workspace: Workspace, options?: { activate?: boolean }) => void;
  retry: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** El negocio elegido se recuerda en este navegador (es una preferencia, no un dato sensible). */
const STORAGE_KEY = 'of-workspace';

function storedActive(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, token } = useAuth();
  const [state, setState] = useState<{ status: WorkspacesStatus; workspaces: Workspace[] }>({ status: 'idle', workspaces: [] });
  const [activeId, setActiveId] = useState<string | null>(storedActive);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !token) {
      setState({ status: 'idle', workspaces: [] });
      return;
    }
    let cancelled = false;
    setState((previous) => ({ ...previous, status: 'loading' }));
    listWorkspaces(token)
      .then((workspaces) => {
        if (!cancelled) setState({ status: 'ready', workspaces });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', workspaces: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, token, attempt]);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sin almacenamiento disponible: la elección dura lo que dure esta carga de la página.
    }
  }, []);

  const upsert = useCallback(
    (workspace: Workspace, options?: { activate?: boolean }) => {
      setState((previous) => {
        const exists = previous.workspaces.some((w) => w.id === workspace.id);
        const workspaces = exists ? previous.workspaces.map((w) => (w.id === workspace.id ? workspace : w)) : [...previous.workspaces, workspace];
        return { status: 'ready', workspaces };
      });
      if (options?.activate) setActive(workspace.id);
    },
    [setActive],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<WorkspaceContextValue>(() => {
    const active = state.workspaces.find((w) => w.id === activeId) ?? state.workspaces[0] ?? null;
    return { status: state.status, workspaces: state.workspaces, active, setActive, upsert, retry };
  }, [state, activeId, setActive, upsert, retry]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaces(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspaces debe usarse dentro de <WorkspaceProvider>');
  return context;
}
