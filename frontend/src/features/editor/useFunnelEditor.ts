import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiError } from '@/services/api';
import { getFunnel, saveContent, type Funnel } from '@/services/funnels';
import { BLOCKS } from '@/shared/blocks/catalog';
import { MAX_BLOCKS, type Block, type BlockType, type Issue } from '@/shared/blocks/types';
import { fieldMessages, validateBlockContent, validateBlocks } from '@/shared/blocks/validate';
import { moveItem } from './fieldHelpers';
import { AUTOSAVE_DELAY_MS } from './constants';

/**
 * - saved: todo está guardado.
 * - dirty: hay cambios que se guardarán en un momento (autoguardado).
 * - saving: guardando.
 * - invalid: hay campos con errores; NO se guarda hasta corregirlos.
 * - error: no se pudo guardar (por ejemplo, sin conexión); se puede reintentar.
 */
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'invalid' | 'error';
export type LoadStatus = 'loading' | 'ready' | 'error' | 'notfound';

/** Mensajes de error por bloque y por campo: `{ 'encabezado': { title: '…' } }`. */
export type BlockErrors = Record<string, Record<string, string>>;

const renumber = (blocks: Block[]): Block[] => blocks.map((block, index) => ({ ...block, order: index + 1 }));

/** Una clave libre para un bloque nuevo: el nombre del tipo, o ese nombre con un número si ya está usado. */
export function uniqueKey(type: BlockType, blocks: Block[]): string {
  const used = new Set(blocks.map((b) => b.key));
  if (!used.has(type)) return type;
  let n = 2;
  while (used.has(`${type}-${n}`)) n += 1;
  return `${type}-${n}`;
}

/** Los errores de cada bloque: los que detecta el editor y los que haya devuelto el servidor. */
export function collectErrors(blocks: Block[], serverIssues: Issue[]): BlockErrors {
  const errors: BlockErrors = {};
  blocks.forEach((block, index) => {
    const local = validateBlockContent(block.type, block.content);
    const server = serverIssues
      .filter((issue) => issue.path[0] === 'blocks' && issue.path[1] === index && issue.path[2] === 'content')
      .map((issue) => ({ path: issue.path.slice(3), message: issue.message }));
    const messages = fieldMessages([...local, ...server]);
    if (Object.keys(messages).length > 0) errors[block.key] = messages;
  });
  return errors;
}

/** Pasa los errores del servidor (`blocks.1.content.title`) a problemas con ruta. */
function issuesFromApiError(err: ApiError): Issue[] {
  return Object.entries(err.fieldErrors()).map(([path, message]) => ({ path: path.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)), message }));
}

/**
 * Todo el estado del editor de una página: carga el funnel, lleva los bloques y la selección,
 * y guarda solo (autoguardado con debounce, de a una petición a la vez). Si hay campos con
 * errores NO guarda y lo avisa; si no hay conexión, lo avisa y se puede reintentar.
 */
export function useFunnelEditor(funnelId: string) {
  const { token } = useAuth();
  const [load, setLoad] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [status, setStatusState] = useState<SaveStatus>('saved');
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);

  const latest = useRef<Block[]>([]);
  const statusRef = useRef<SaveStatus>('saved');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const alive = useRef(true);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const setStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    if (alive.current) setStatusState(next);
  }, []);

  // --- carga ---
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoad('loading');
    getFunnel(token, funnelId)
      .then((loaded) => {
        if (cancelled) return;
        const sorted = renumber([...loaded.content.blocks].sort((a, b) => a.order - b.order));
        latest.current = sorted;
        setFunnel(loaded);
        setBlocks(sorted);
        setSelectedKey(sorted[0]?.key ?? null);
        setServerIssues([]);
        setStatus('saved');
        setLoad('ready');
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad(err instanceof ApiError && err.status === 404 ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [token, funnelId, attempt, setStatus]);

  // --- guardado ---
  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    const current = latest.current;
    const currentToken = tokenRef.current;
    if (!currentToken) return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    if (validateBlocks(current).length > 0) {
      setStatus('invalid');
      return;
    }
    inFlight.current = true;
    setStatus('saving');
    try {
      await saveContent(currentToken, funnelId, current);
    } catch (err) {
      inFlight.current = false;
      queued.current = false;
      if (err instanceof ApiError && err.status === 422) {
        if (alive.current) setServerIssues(issuesFromApiError(err));
        setStatus('invalid');
      } else {
        setStatus('error');
      }
      return;
    }
    inFlight.current = false;
    if (queued.current || latest.current !== current) {
      queued.current = false;
      await flush();
    } else {
      setStatus('saved');
    }
  }, [funnelId, setStatus]);

  const commit = useCallback(
    (next: Block[]) => {
      const numbered = renumber(next);
      latest.current = numbered;
      setBlocks(numbered);
      setServerIssues([]);
      setStatus(validateBlocks(numbered).length > 0 ? 'invalid' : 'dirty');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
      return numbered;
    },
    [flush, setStatus],
  );

  // Al salir de la pantalla se guarda lo pendiente (si es válido).
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (statusRef.current === 'dirty') void flush();
    },
    [flush],
  );

  // Cerrar la pestaña con cambios sin guardar o con errores: el navegador pide confirmar.
  const unsaved = status === 'dirty' || status === 'saving' || status === 'invalid' || status === 'error';
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // Salir a otra pantalla con cambios que NO se pudieron guardar: se pregunta antes de perderlos.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (statusRef.current === 'invalid' || statusRef.current === 'error') && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Tienes cambios que no se guardaron. Si sales ahora se perderán. ¿Salir de todos modos?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  // --- acciones ---
  const updateContent = useCallback((key: string, content: Record<string, unknown>) => commit(latest.current.map((block) => (block.key === key ? { ...block, content } : block))), [commit]);

  const addBlock = useCallback(
    (type: BlockType, afterKey?: string | null) => {
      const current = latest.current;
      if (current.length >= MAX_BLOCKS) return;
      const block: Block = { key: uniqueKey(type, current), type, order: 0, content: BLOCKS[type].create(), style: {} };
      const at = afterKey ? current.findIndex((b) => b.key === afterKey) + 1 : current.length;
      commit([...current.slice(0, at), block, ...current.slice(at)]);
      setSelectedKey(block.key);
    },
    [commit],
  );

  const removeBlock = useCallback(
    (key: string) => {
      const current = latest.current;
      const index = current.findIndex((b) => b.key === key);
      if (index < 0) return;
      const next = commit(current.filter((b) => b.key !== key));
      setSelectedKey((selected) => (selected === key ? (next[Math.min(index, next.length - 1)]?.key ?? null) : selected));
    },
    [commit],
  );

  const moveBlock = useCallback(
    (key: string, delta: number) => {
      const current = latest.current;
      const index = current.findIndex((b) => b.key === key);
      if (index >= 0) commit(moveItem(current, index, delta));
    },
    [commit],
  );

  const errors = useMemo(() => collectErrors(blocks, serverIssues), [blocks, serverIssues]);

  return {
    load,
    retryLoad: () => setAttempt((n) => n + 1),
    funnel,
    blocks,
    selectedKey,
    select: setSelectedKey,
    status,
    errors,
    updateContent,
    addBlock,
    removeBlock,
    moveBlock,
    retrySave: () => void flush(),
  };
}
