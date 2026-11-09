import type { ReactNode } from 'react';
import { TextAreaField } from '@/shared/ui/TextAreaField';
import { TextField } from '@/shared/ui/TextField';
import { cn } from '@/shared/utils/cn';
import { TONES, type Brief } from '../catalog';

interface Props {
  value: Brief;
  onChange: (value: Brief) => void;
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-text-2">{hint}</p>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

/**
 * Formulario con las instrucciones que usará la IA para armar la página: producto, público y tono.
 * CÁSCARA: lo escrito solo se guarda en la pantalla del asistente; todavía no se envía a Original AI Engine.
 */
export function BriefForm({ value, onChange }: Props) {
  const set = (key: keyof Brief) => (next: string) => onChange({ ...value, [key]: next });

  return (
    <form onSubmit={(event) => event.preventDefault()} noValidate className="max-w-3xl space-y-6" aria-label="Instrucciones para la IA">
      <Section title="Tu producto" hint="Qué vendes y qué gana la persona que lo compra.">
        <TextField label="Nombre del funnel" value={value.name} onChange={(e) => set('name')(e.target.value)} placeholder="Ej. Curso de Excel · Inscripción" maxLength={120} />
        <TextAreaField label="¿Qué ofreces?" value={value.offer} onChange={(e) => set('offer')(e.target.value)} placeholder="Describe tu producto o servicio en pocas líneas." />
        <TextAreaField
          label="¿Qué resultado obtiene tu cliente?"
          value={value.result}
          onChange={(e) => set('result')(e.target.value)}
          placeholder="Tu promesa principal: qué logra o cómo cambia su situación."
        />
        <TextField
          label="Precio u oferta (opcional)"
          value={value.price}
          onChange={(e) => set('price')(e.target.value)}
          placeholder="Ej. $1,490 MXN, o «Primera sesión gratis»"
          maxLength={120}
        />
      </Section>

      <Section title="Tu público" hint="Con quién hablará tu página.">
        <TextAreaField label="¿A quién va dirigido?" value={value.audience} onChange={(e) => set('audience')(e.target.value)} placeholder="Tu cliente ideal: quién es y qué problema tiene." />
        <TextAreaField
          label="¿Qué dudas u objeciones suele tener? (opcional)"
          value={value.objections}
          onChange={(e) => set('objections')(e.target.value)}
          placeholder="Ej. «No tengo tiempo», «es muy caro», «no sé si funciona para mí»."
        />
      </Section>

      <Section title="Cómo debe sonar tu página" hint="El estilo de los textos y el llamado a la acción.">
        <fieldset>
          <legend className="text-sm text-text-2">Tono</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TONES.map((tone) => {
              const selected = value.tone === tone.id;
              return (
                <label
                  key={tone.id}
                  className={cn(
                    'cursor-pointer rounded-full border px-4 py-1.5 text-sm transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-violet',
                    selected ? 'border-violet bg-violet-tint font-medium text-violet-tint-text' : 'border-border-strong bg-surface-2 text-text-2 hover:text-text',
                  )}
                >
                  <input type="radio" name="tono" value={tone.id} checked={selected} onChange={() => set('tone')(tone.id)} className="sr-only" />
                  {tone.name}
                </label>
              );
            })}
          </div>
        </fieldset>
        <TextField label="Texto del botón principal" value={value.cta} onChange={(e) => set('cta')(e.target.value)} placeholder="Ej. Reservar mi lugar" maxLength={60} />
        <TextAreaField
          label="Instrucciones adicionales para la IA (opcional)"
          value={value.extra}
          onChange={(e) => set('extra')(e.target.value)}
          rows={4}
          hint="Cualquier cosa que quieras que tenga en cuenta: palabras a evitar, ejemplos, detalles de tu marca…"
        />
      </Section>
    </form>
  );
}
