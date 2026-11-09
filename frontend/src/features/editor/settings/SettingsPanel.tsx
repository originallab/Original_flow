import { useCallback, useRef } from 'react';
import type { Funnel } from '@/services/funnels';
import type { Block } from '@/shared/blocks/types';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { CtaSettings } from './CtaSettings';
import { DetailsForm } from './DetailsForm';
import { TypeSettingsForm } from './TypeSettingsForm';

interface Props {
  funnel: Funnel;
  token: string;
  blocks: Block[];
  /** Cambia cada vez que se guarda el contenido de la página. */
  contentVersion: number;
  onFunnelChange: (funnel: Funnel) => void;
  /** Avisa si algún formulario de ajustes tiene cambios sin guardar. */
  onDirtyChange: (dirty: boolean) => void;
}

/** Panel de ajustes del funnel: sus datos, los ajustes de su tipo y a dónde lleva cada botón. Cada parte se guarda con su botón. */
export function SettingsPanel({ funnel, token, blocks, contentVersion, onFunnelChange, onDirtyChange }: Props) {
  const dirty = useRef({ details: false, type: false });
  const report = useCallback(
    (part: 'details' | 'type') => (value: boolean) => {
      dirty.current[part] = value;
      onDirtyChange(dirty.current.details || dirty.current.type);
    },
    [onDirtyChange],
  );
  const reportDetails = useCallback((value: boolean) => report('details')(value), [report]);
  const reportType = useCallback((value: boolean) => report('type')(value), [report]);
  const hasTypeSettings = FUNNEL_TYPES[funnel.objective].fields.length > 0;

  return (
    <div className="space-y-8 p-5" aria-label="Panel de ajustes" role="region">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Ajustes</h2>
      <DetailsForm funnel={funnel} token={token} onSaved={onFunnelChange} onDirtyChange={reportDetails} />
      {hasTypeSettings && <TypeSettingsForm funnel={funnel} token={token} onSaved={onFunnelChange} onDirtyChange={reportType} />}
      <CtaSettings funnel={funnel} token={token} blocks={blocks} refreshKey={contentVersion} onChanged={() => undefined} />
    </div>
  );
}
