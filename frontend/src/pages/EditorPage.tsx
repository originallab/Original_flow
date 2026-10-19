import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { templateOf } from '@/features/funnels/catalog';
import { BlockList } from '@/features/editor/components/BlockList';
import { EditorTopBar } from '@/features/editor/components/EditorTopBar';
import { PropertiesPanel } from '@/features/editor/components/PropertiesPanel';
import { useFunnelEditor } from '@/features/editor/useFunnelEditor';
import { PageRenderer } from '@/features/pageRenderer/PageRenderer';
import { Button, buttonStyles } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';

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

/**
 * Editor de la página de un funnel: la lista de bloques a la izquierda, la página en el centro y las
 * propiedades del bloque elegido a la derecha. Guarda solo. La primera versión de la página la arma el
 * generador del asistente (hoy con la plantilla, luego con IA) y aquí se modifica.
 */
export function EditorPage() {
  const { id = '' } = useParams();
  const editor = useFunnelEditor(id);
  const [preview, setPreview] = useState(false);

  if (editor.load === 'loading') {
    return (
      <Gate>
        <p role="status" className="text-sm text-text-2">
          Abriendo tu página…
        </p>
      </Gate>
    );
  }
  if (editor.load === 'notfound') {
    return (
      <Gate>
        <div>
          <h1 className="font-heading text-xl font-semibold">No encontramos este funnel</h1>
          <p className="mt-2 text-sm text-text-2">Puede que lo hayan eliminado o que no sea de este negocio.</p>
          <Link to="/funnels" className={buttonStyles({ className: 'mt-5' })}>
            Volver a mis funnels
          </Link>
        </div>
      </Gate>
    );
  }
  if (editor.load === 'error' || !editor.funnel) {
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

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <EditorTopBar
        name={funnel.name}
        templateName={templateOf(funnel.designSpec?.template ?? 'claridad').name}
        status={editor.status}
        preview={preview}
        onTogglePreview={() => setPreview((value) => !value)}
        onRetry={editor.retrySave}
      />

      {/* En pantallas chicas los tres bloques se apilan y se desplaza toda la pantalla; en grandes, cada columna se desplaza sola. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-visible">
        {!preview && (
          <aside className="max-h-72 shrink-0 overflow-y-auto border-b border-border bg-surface lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r">
            <BlockList
              blocks={blocks}
              selectedKey={selectedKey}
              errors={editor.errors}
              onSelect={editor.select}
              onAdd={editor.addBlock}
              onRemove={editor.removeBlock}
              onMove={editor.moveBlock}
            />
          </aside>
        )}

        <main className="min-h-[28rem] min-w-0 bg-canvas p-4 sm:p-8 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <div className="mx-auto max-w-3xl overflow-hidden rounded-xl shadow-popover">
            <PageRenderer blocks={blocks} design={funnel.designSpec} currency={funnel.currency} mode={preview ? 'preview' : 'edit'} selectedKey={selectedKey} onSelect={editor.select} />
          </div>
        </main>

        {!preview && (
          <aside className="shrink-0 border-t border-border bg-surface lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <PropertiesPanel block={selected} errors={selected ? (editor.errors[selected.key] ?? {}) : {}} onChange={(content) => selected && editor.updateContent(selected.key, content)} />
          </aside>
        )}
      </div>
    </div>
  );
}
