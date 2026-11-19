import { canRewriteWithAi } from '@/shared/aiBlocks';
import { BLOCKS } from '@/shared/blocks/catalog';
import type { Block } from '@/shared/blocks/types';
import { withKey } from '../fieldHelpers';
import { AiBlockAssistant } from './AiBlockAssistant';
import { FieldEditor } from './FieldEditor';

interface Props {
  block: Block | null;
  /** Mensajes de error de los campos de este bloque, por ruta. */
  errors: Record<string, string>;
  onChange: (content: Record<string, unknown>) => void;
  /** Lo que necesita «Reescribir con IA»; si falta, el botón no se ofrece. */
  ai?: { token: string; funnelId: string; saveNow: () => Promise<boolean>; resetKey?: number };
}

/** Panel de la derecha: los campos del bloque elegido. Se dibujan solos a partir del catálogo de bloques. */
export function PropertiesPanel({ block, errors, onChange, ai }: Props) {
  if (!block) {
    return (
      <div className="p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Propiedades</h2>
        <p className="mt-3 text-sm text-text-2">Elige un bloque de la lista o de la página para editarlo.</p>
      </div>
    );
  }

  const def = BLOCKS[block.type];
  return (
    <section aria-label={`Propiedades: ${def.label}`} className="p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Propiedades</h2>
      <p className="mt-2 font-heading text-lg font-semibold">{def.label}</p>
      <p className="mt-1 text-sm text-text-2">{def.description}</p>

      <div className="mt-5 space-y-5">
        {def.fields.length === 0 && <p className="text-sm text-text-2">Este bloque se podrá editar cuando se conecte el almacenamiento de archivos.</p>}
        {def.fields.map((field) => (
          <FieldEditor
            // La clave incluye el bloque para que, al cambiar de bloque, cada campo empiece de cero.
            key={`${block.key}:${field.key}`}
            def={field}
            value={block.content[field.key]}
            onChange={(next) => onChange(withKey(block.content, field.key, next))}
            errors={errors}
            path={field.key}
            parent={block.content}
          />
        ))}
      </div>

      {ai && canRewriteWithAi(block.type) && <AiBlockAssistant key={`${block.key}:${ai.resetKey ?? 0}`} block={block} token={ai.token} funnelId={ai.funnelId} saveNow={ai.saveNow} onApply={onChange} />}
    </section>
  );
}
