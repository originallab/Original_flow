import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { BlockList } from '@/features/editor/components/BlockList';
import { EditorTopBar } from '@/features/editor/components/EditorTopBar';
import { PropertiesPanel } from '@/features/editor/components/PropertiesPanel';
import { PublishDialog, type SettingsSection } from '@/features/editor/components/PublishDialog';
import { SettingsPanel } from '@/features/editor/settings/SettingsPanel';
import { useFunnelEditor } from '@/features/editor/useFunnelEditor';
import { HistoryDialog } from '@/features/history/components/HistoryDialog';
import { templateOf } from '@/features/funnels/catalog';
import { PageRenderer } from '@/features/pageRenderer/PageRenderer';
import { useWorkspaces } from '@/features/workspaces/WorkspaceProvider';
import { Button, buttonStyles } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { cn } from '@/shared/utils/cn';
import { canPublishFunnels, canRestoreHistory } from '@/shared/utils/permissions';

/** Pantalla de espera o de error del editor: el logotipo siempre va arriba a la izquierda. */
function Gate({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-bg text-text">
      <header className="flex h-16 items-center border-b border-border bg-surface px-6">
        <Logo />
      </header>
      <main className="grid flex-1 place-items-center px-6 text-center">{children}</main>
    </div>
  );
}

const SECTION_IDS: Record<SettingsSection, string> = { details: 'ajustes-datos', type: 'ajustes-tipo', cta: 'ajustes-cta' };

/**
 * Editor de la página de un funnel: la lista de bloques a la izquierda, la página en el centro y, a
 * la derecha, las propiedades del bloque elegido o los ajustes del funnel. Guarda solo y desde aquí se
 * publica. La primera versión de la página la arma el generador del asistente (hoy con la plantilla,
 * luego con IA) y aquí se modifica.
 */
export function EditorPage() {
  const { id = '' } = useParams();
  const { token } = useAuth();
  const { workspaces } = useWorkspaces();
  const editor = useFunnelEditor(id);
  const [preview, setPreview] = useState(false);
  const [panel, setPanel] = useState<'block' | 'settings'>('block');
  const [publishing, setPublishing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);

  if (editor.load === 'loading') {
    return (
      <Gate>
        <p role="status" className="text-sm text-text-2">
          Abriendo tu página…
        </p>
      </Gate>
    );
  }
  if (editor.load === 'notfound' || editor.load === 'forbidden') {
    const forbidden = editor.load === 'forbidden';
    return (
      <Gate>
        <div>
          <h1 className="font-heading text-xl font-semibold">{forbidden ? 'No tienes permiso para editar este funnel' : 'No encontramos este funnel'}</h1>
          <p className="mt-2 text-sm text-text-2">{forbidden ? 'Pídele a quien administra el negocio que te dé acceso.' : 'Puede que lo hayan eliminado o que no sea de este negocio.'}</p>
          <Link to="/funnels" className={buttonStyles({ className: 'mt-5' })}>
            Volver a mis funnels
          </Link>
        </div>
      </Gate>
    );
  }
  if (editor.load === 'error' || !editor.funnel || !token) {
    return (
      <Gate>
        <div>
          <p role="alert">No se pudo abrir el funnel.</p>
          <Button className="mt-4" onClick={editor.retryLoad}>
            Reintentar
          </Button>
        </div>
      </Gate>
    );
  }

  const { funnel, blocks, selectedKey } = editor;
  const selected = blocks.find((block) => block.key === selectedKey) ?? null;
  const role = workspaces.find((workspace) => workspace.id === funnel.workspaceId)?.role;

  const goToSettings = (section: SettingsSection) => {
    setPreview(false);
    setPanel('settings');
    requestAnimationFrame(() => document.getElementById(SECTION_IDS[section])?.scrollIntoView?.({ block: 'start' }));
  };
  const select = (key: string) => {
    editor.select(key);
    setPanel('block');
  };

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <EditorTopBar
        name={funnel.name}
        templateName={templateOf(funnel.designSpec?.template ?? 'claridad').name}
        status={editor.status}
        preview={preview}
        onTogglePreview={() => setPreview((value) => !value)}
        onRetry={editor.retrySave}
        published={funnel.status === 'published'}
        canPublish={canPublishFunnels(role)}
        onPublish={() => setPublishing(true)}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      {/* En pantallas chicas los tres bloques se apilan y se desplaza toda la pantalla; en grandes, cada columna se desplaza sola. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-visible">
        {!preview && (
          <aside className="max-h-72 shrink-0 overflow-y-auto border-b border-border bg-surface lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r">
            <BlockList blocks={blocks} selectedKey={selectedKey} errors={editor.errors} onSelect={select} onAdd={editor.addBlock} onRemove={editor.removeBlock} onMove={editor.moveBlock} />
          </aside>
        )}

        <main className="max-h-[65vh] min-h-72 min-w-0 shrink-0 overflow-y-auto bg-canvas p-4 sm:p-8 lg:max-h-none lg:min-h-0 lg:flex-1 lg:shrink">
          <div className="mx-auto max-w-3xl overflow-hidden rounded-xl shadow-popover">
            <PageRenderer blocks={blocks} design={funnel.designSpec} currency={funnel.currency} mode={preview ? 'preview' : 'edit'} selectedKey={selectedKey} onSelect={select} />
          </div>
        </main>

        {!preview && (
          <aside className="shrink-0 border-t border-border bg-surface lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <div role="tablist" aria-label="Panel de la derecha" className="flex border-b border-border">
              {(['block', 'settings'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`tab-${tab}`}
                  aria-selected={panel === tab}
                  aria-controls={`panel-${tab}`}
                  onClick={() => setPanel(tab)}
                  className={cn('flex-1 px-4 py-3 text-sm font-medium transition', panel === tab ? 'border-b-2 border-violet text-violet-tint-text' : 'text-text-2 hover:text-text')}
                >
                  {tab === 'block' ? 'Bloque' : 'Ajustes'}
                  {tab === 'settings' && settingsDirty && <span role="img" aria-label="Tiene cambios sin guardar" className="ml-1.5 inline-block size-1.5 rounded-full bg-violet align-middle" />}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="panel-block" aria-labelledby="tab-block" hidden={panel !== 'block'}>
              <PropertiesPanel block={selected} errors={selected ? (editor.errors[selected.key] ?? {}) : {}} onChange={(content) => selected && editor.updateContent(selected.key, content)} />
            </div>
            <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={panel !== 'settings'}>
              <SettingsPanel funnel={funnel} token={token} blocks={blocks} contentVersion={editor.contentVersion} onFunnelChange={editor.applyFunnel} onDirtyChange={setSettingsDirty} />
            </div>
          </aside>
        )}
      </div>

      {historyOpen && (
        <HistoryDialog funnelId={funnel.id} token={token} canRestore={canRestoreHistory(role)} saveNow={editor.saveNow} onRestored={editor.replaceFunnel} onClose={() => setHistoryOpen(false)} />
      )}

      {publishing && (
        <PublishDialog
          funnel={funnel}
          token={token}
          blocks={blocks}
          settingsDirty={settingsDirty}
          saveNow={editor.saveNow}
          onFunnelChange={editor.applyFunnel}
          onGoToSettings={goToSettings}
          onAddBlock={(type) => editor.addBlock(type, selectedKey)}
          onClose={() => setPublishing(false)}
        />
      )}
    </div>
  );
}
