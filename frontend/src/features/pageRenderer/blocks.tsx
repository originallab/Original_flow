import { CalendarDays, Check, Image as ImageIcon, Play } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { Block } from '@/shared/blocks/types';
import { variantOf } from '@/shared/design';
import { safeHttpUrl } from '@/shared/utils/safeUrl';
import { buttonStyle, CtaButton, LiveCountdown, PublicButtonLink, PublicForm, type PublicContext } from './public';
import { readableOn, type PageTheme } from './theme';

/**
 * Cómo se dibuja cada tipo de bloque dentro de la página. Usan solo los colores y el estilo de la
 * página (`theme`), nunca los de la plataforma. Sin `publicCtx` es solo el dibujo (editor y vista
 * previa); con él, los bloques que pueden hacer algo (formulario, botones, cuenta regresiva, enlaces)
 * funcionan: es la página publicada.
 */

interface ViewProps {
  block: Block;
  theme: PageTheme;
  currency: string;
  publicCtx?: PublicContext;
}

type Obj = Record<string, unknown>;
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const list = (value: unknown): Obj[] => (Array.isArray(value) ? value.filter((item): item is Obj => typeof item === 'object' && item !== null) : []);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** Una banda de color que, en la página publicada, ocupa todo el ancho de la pantalla aunque el contenido esté centrado. */
const bleed = (color: string): CSSProperties => ({ background: color, boxShadow: `0 0 0 100vmax ${color}`, clipPath: 'inset(0 -100vmax)' });

/** `pad`: el relleno vertical base en rem (2.5 por defecto); se ajusta con el aire que eligió la página. */
function Section({ theme, children, style, pad = 2.5 }: { theme: PageTheme; children: ReactNode; style?: CSSProperties; pad?: number }) {
  return (
    <section className="px-8" style={{ textAlign: theme.look.align, paddingBlock: `${(pad * theme.look.spacing).toFixed(2)}rem`, ...style }}>
      {children}
    </section>
  );
}

function Heading({ theme, children, size = 'text-2xl' }: { theme: PageTheme; children: ReactNode; size?: string }) {
  return (
    <h2 className={`${size} font-heading leading-tight`} style={{ fontWeight: theme.look.headingWeight, textTransform: theme.look.headingTransform }}>
      {children}
    </h2>
  );
}

function PrimaryButton({ theme, children, variant }: { theme: PageTheme; children: ReactNode; variant?: string }) {
  return (
    <span className="inline-block px-6 py-3 text-sm font-semibold" style={buttonStyle(theme, variant)}>
      {children}
    </span>
  );
}

const cardRadius = (theme: PageTheme) => (theme.look.radius === '999px' ? '24px' : theme.look.radius);
const card = (theme: PageTheme): CSSProperties => ({ borderRadius: cardRadius(theme), border: `1px solid ${theme.surface.border}`, background: theme.surface.background });

function Countdown({ endsAt }: { endsAt: string }) {
  const remaining = Math.max(0, Date.parse(endsAt) - Date.now());
  const parts: [number, string][] = [
    [Math.floor(remaining / 86_400_000), 'días'],
    [Math.floor(remaining / 3_600_000) % 24, 'horas'],
    [Math.floor(remaining / 60_000) % 60, 'min'],
    [Math.floor(remaining / 1000) % 60, 'seg'],
  ];
  return (
    <div className="mt-3 flex justify-center gap-3">
      {parts.map(([value, unit]) => (
        <div key={unit} className="min-w-16 rounded-lg px-3 py-2" style={{ background: '#00000012' }}>
          <p className="text-2xl font-bold tabular-nums">{String(value).padStart(2, '0')}</p>
          <p className="text-xs opacity-70">{unit}</p>
        </div>
      ))}
    </div>
  );
}

export function BlockView({ block, theme, currency, publicCtx }: ViewProps) {
  const c = block.content;
  const { palette } = theme;

  switch (block.type) {
    case 'encabezado': {
      const variant = variantOf('encabezado', block.style);
      const align = variant === 'centrado' ? 'center' : variant === 'izquierda' ? 'left' : theme.look.align;
      const title = (
        <h1
          className={`${variant === 'grande' ? 'text-5xl sm:text-7xl' : 'text-4xl'} font-heading leading-tight`}
          style={{ fontWeight: theme.look.headingWeight, textTransform: theme.look.headingTransform }}
        >
          {str(c.title)}
        </h1>
      );
      if (variant === 'dividido') {
        return (
          <Section theme={theme} pad={3.5} style={{ textAlign: 'left' }}>
            <div className="grid items-end gap-6 sm:grid-cols-2 sm:gap-10">
              <div className="border-l-4 pl-5" style={{ borderColor: palette.primary }}>
                {title}
              </div>
              {str(c.subtitle) && <p className="text-lg opacity-80">{str(c.subtitle)}</p>}
            </div>
          </Section>
        );
      }
      return (
        <Section theme={theme} pad={variant === 'grande' ? 5 : 3.5} style={{ textAlign: align }}>
          {title}
          {str(c.subtitle) && <p className={`mt-4 max-w-2xl ${variant === 'grande' ? 'text-xl' : 'text-lg'} opacity-80`} style={{ marginInline: align === 'center' ? 'auto' : undefined }}>{str(c.subtitle)}</p>}
        </Section>
      );
    }

    case 'texto':
      if (variantOf('texto', block.style) === 'destacado') {
        return (
          <Section theme={theme} pad={3}>
            <div className="mx-auto max-w-2xl border-l-4 pl-6 text-left" style={{ borderColor: palette.primary }}>
              {str(c.title) && <Heading theme={theme}>{str(c.title)}</Heading>}
              <p className="mt-3 whitespace-pre-line text-xl leading-relaxed">{str(c.body)}</p>
            </div>
          </Section>
        );
      }
      return (
        <Section theme={theme}>
          {str(c.title) && <Heading theme={theme}>{str(c.title)}</Heading>}
          <p className="mt-3 whitespace-pre-line text-base leading-relaxed opacity-90">{str(c.body)}</p>
        </Section>
      );

    case 'imagen':
      return (
        <Section theme={theme}>
          {str(c.url) ? (
            <img src={str(c.url)} alt={str(c.alt)} className="mx-auto max-h-96 w-full object-cover" style={{ borderRadius: theme.look.radius === '999px' ? '24px' : theme.look.radius }} />
          ) : (
            <div className="grid h-56 place-items-center rounded-xl" style={{ background: '#00000012' }}>
              <ImageIcon size={32} aria-hidden />
            </div>
          )}
        </Section>
      );

    case 'video':
      return (
        <Section theme={theme}>
          <div className="mx-auto grid aspect-video max-w-xl place-items-center" style={{ background: palette.secondary, borderRadius: theme.look.radius === '999px' ? '24px' : theme.look.radius }}>
            <span className="grid size-14 place-items-center rounded-full" style={{ background: palette.accent, color: readableOn(palette.accent, palette) }}>
              <Play size={22} aria-hidden />
            </span>
          </div>
          {str(c.title) && <p className="mt-3 text-sm opacity-80">{str(c.title)}</p>}
          {publicCtx && safeHttpUrl(c.url) && (
            <div className="mt-4">
              <PublicButtonLink theme={theme} href={safeHttpUrl(c.url)!}>
                Ver el video
              </PublicButtonLink>
            </div>
          )}
        </Section>
      );

    case 'formulario':
      if (publicCtx) {
        return (
          <Section theme={theme} style={bleed(`${palette.primary}12`)}>
            <PublicForm block={block} theme={theme} ctx={publicCtx} />
          </Section>
        );
      }
      return (
        <Section theme={theme} style={{ background: `${palette.primary}12` }}>
          <div className="mx-auto max-w-md text-left">
            {str(c.title) && <Heading theme={theme}>{str(c.title)}</Heading>}
            <div className="mt-5 space-y-3">
              {list(c.fields).map((field, index) => (
                <label key={`${str(field.name)}-${index}`} className="block text-sm">
                  <span className="opacity-80">
                    {str(field.label)}
                    {field.required === true ? ' *' : ''}
                  </span>
                  {field.type === 'textarea' ? (
                    <textarea readOnly tabIndex={-1} rows={3} className="mt-1 w-full border bg-white px-3 py-2" style={{ borderRadius: '8px', borderColor: `${palette.secondary}44` }} />
                  ) : field.type === 'select' ? (
                    <select disabled tabIndex={-1} className="mt-1 w-full border bg-white px-3 py-2" style={{ borderRadius: '8px', borderColor: `${palette.secondary}44` }}>
                      <option>{strings(field.options)[0] ?? 'Elige una opción'}</option>
                    </select>
                  ) : (
                    <input readOnly tabIndex={-1} type="text" className="mt-1 w-full border bg-white px-3 py-2" style={{ borderRadius: '8px', borderColor: `${palette.secondary}44` }} />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-5 text-center">
              <PrimaryButton theme={theme}>{str(c.submitLabel)}</PrimaryButton>
            </div>
          </div>
        </Section>
      );

    case 'boton': {
      const variant = variantOf('boton', block.style);
      // «Banda»: el botón va sobre una franja del color de la marca que ocupa todo el ancho.
      const strip = variant === 'banda' ? (publicCtx ? bleed(palette.primary) : { background: palette.primary }) : undefined;
      return (
        <Section theme={theme} pad={variant === 'banda' ? 3 : 2.5} style={{ textAlign: 'center', ...strip }}>
          {publicCtx ? <CtaButton block={block} theme={theme} ctx={publicCtx} /> : <PrimaryButton theme={theme} variant={variant}>{str(c.label)}</PrimaryButton>}
        </Section>
      );
    }

    case 'contador':
      return (
        <Section theme={theme} style={{ textAlign: 'center' }}>
          {str(c.label) && <p className="text-sm font-medium opacity-80">{str(c.label)}</p>}
          {publicCtx ? <LiveCountdown endsAt={str(c.endsAt)} /> : <Countdown endsAt={str(c.endsAt)} />}
        </Section>
      );

    case 'precios': {
      const money = (price: unknown) => (typeof price === 'number' ? new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 }).format(price) : '');
      if (variantOf('precios', block.style) === 'simple') {
        return (
          <Section theme={theme}>
            <div className="mx-auto max-w-2xl divide-y text-left" style={{ borderColor: theme.surface.border }}>
              {list(c.plans).map((plan, index) => (
                <div key={`${str(plan.name)}-${index}`} className="py-5" style={{ borderColor: theme.surface.border }}>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-lg font-semibold font-heading">{str(plan.name)}</p>
                    <p className="text-2xl font-bold" style={{ color: palette.primary }}>{money(plan.price)}</p>
                  </div>
                  <p className="mt-2 text-sm opacity-80">{strings(plan.features).join(' · ')}</p>
                </div>
              ))}
            </div>
          </Section>
        );
      }
      return (
        <Section theme={theme}>
          <div className="mx-auto grid max-w-3xl gap-4 text-left" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(list(c.plans).length, 1), 3)}, minmax(0, 1fr))` }}>
            {list(c.plans).map((plan, index) => (
              <div key={`${str(plan.name)}-${index}`} className="p-6" style={card(theme)}>
                <p className="text-sm font-semibold uppercase tracking-wide opacity-70">{str(plan.name)}</p>
                <p className="mt-2 text-3xl font-bold" style={{ color: palette.primary }}>
                  {money(plan.price)}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {strings(plan.features).map((feature, i) => (
                    <li key={`${feature}-${i}`} className="flex items-start gap-2">
                      <Check size={16} className="mt-0.5 shrink-0" style={{ color: palette.primary }} aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case 'testimonios':
      return (
        <Section theme={theme}>
          <div className="mx-auto grid max-w-3xl gap-4 text-left sm:grid-cols-2">
            {list(c.items).map((item, index) => (
              <figure key={`${str(item.name)}-${index}`} className="p-5" style={card(theme)}>
                <blockquote className="text-sm leading-relaxed">“{str(item.quote)}”</blockquote>
                <figcaption className="mt-3 text-sm font-semibold">
                  {str(item.name)}
                  {str(item.role) && <span className="block text-xs font-normal opacity-70">{str(item.role)}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>
      );

    case 'faq': {
      const variant = variantOf('faq', block.style) ?? 'abierto';
      const asCard = variant === 'tarjetas';
      const dense = variant === 'compacto';
      const itemStyle: CSSProperties | undefined = asCard ? card(theme) : undefined;
      return (
        <Section theme={theme}>
          <div className="mx-auto max-w-2xl text-left">
            <Heading theme={theme}>Preguntas frecuentes</Heading>
            {publicCtx ? (
              <div className={asCard ? 'mt-4 space-y-3' : 'mt-4 divide-y'} style={{ borderColor: theme.surface.border }}>
                {list(c.items).map((item, index) => (
                  <details key={`${str(item.question)}-${index}`} className={`group ${asCard ? 'p-4' : dense ? 'py-2' : 'py-3'}`} style={itemStyle}>
                    <summary className={`cursor-pointer list-none font-semibold marker:content-none ${dense ? 'text-sm' : ''}`}>{str(item.question)}</summary>
                    <p className="mt-2 text-sm opacity-80">{str(item.answer)}</p>
                  </details>
                ))}
              </div>
            ) : (
              <dl className={asCard ? 'mt-4 space-y-3' : dense ? 'mt-3 space-y-2' : 'mt-4 space-y-4'}>
                {list(c.items).map((item, index) => (
                  <div key={`${str(item.question)}-${index}`} className={asCard ? 'p-4' : undefined} style={itemStyle}>
                    <dt className={`font-semibold ${dense ? 'text-sm' : ''}`}>{str(item.question)}</dt>
                    <dd className="mt-1 text-sm opacity-80">{str(item.answer)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </Section>
      );
    }

    case 'logos':
      return (
        <Section theme={theme}>
          <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-3">
            {(strings(c.fileIds).length > 0 ? strings(c.fileIds) : ['1', '2', '3']).map((id) => (
              <span key={id} className="grid h-10 w-24 place-items-center rounded text-xs opacity-60" style={{ background: '#00000012' }}>
                Logo
              </span>
            ))}
          </div>
        </Section>
      );

    case 'beneficios': {
      const variant = variantOf('beneficios', block.style) ?? 'tarjetas';
      const items = list(c.items);
      if (variant === 'lista' || variant === 'numerados') {
        return (
          <Section theme={theme}>
            {str(c.title) && <Heading theme={theme}>{str(c.title)}</Heading>}
            <ul className="mx-auto mt-6 max-w-2xl divide-y text-left" style={{ borderColor: theme.surface.border }}>
              {items.map((item, index) => (
                <li key={`${str(item.title)}-${index}`} className="flex gap-4 py-4" style={{ borderColor: theme.surface.border }}>
                  {variant === 'numerados' ? (
                    <span className="w-12 shrink-0 text-3xl font-bold font-heading leading-none" style={{ color: palette.primary }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  ) : (
                    <Check size={20} className="mt-0.5 shrink-0" style={{ color: palette.primary }} aria-hidden />
                  )}
                  <span>
                    <span className="block font-semibold">{str(item.title)}</span>
                    {str(item.description) && <span className="mt-1 block text-sm opacity-80">{str(item.description)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        );
      }
      if (variant === 'columnas') {
        return (
          <Section theme={theme}>
            {str(c.title) && <Heading theme={theme}>{str(c.title)}</Heading>}
            <div className="mx-auto mt-8 grid max-w-4xl gap-8 text-left sm:grid-cols-3">
              {items.map((item, index) => (
                <div key={`${str(item.title)}-${index}`} className="border-t-4 pt-4" style={{ borderColor: palette.primary }}>
                  <p className="font-semibold font-heading">{str(item.title)}</p>
                  {str(item.description) && <p className="mt-2 text-sm opacity-80">{str(item.description)}</p>}
                </div>
              ))}
            </div>
          </Section>
        );
      }
      return (
        <Section theme={theme}>
          {str(c.title) && <Heading theme={theme}>{str(c.title)}</Heading>}
          <div className="mx-auto mt-6 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
            {list(c.items).map((item, index) => (
              <div key={`${str(item.title)}-${index}`} className="p-5" style={card(theme)}>
                <span className="mb-3 grid size-8 place-items-center rounded-full text-sm font-bold" style={{ background: palette.accent, color: readableOn(palette.accent, palette) }}>
                  {index + 1}
                </span>
                <p className="font-semibold">{str(item.title)}</p>
                {str(item.description) && <p className="mt-1 text-sm opacity-80">{str(item.description)}</p>}
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case 'calendario':
      return (
        <Section theme={theme}>
          <div className="mx-auto max-w-md p-6 text-center" style={card(theme)}>
            <CalendarDays size={28} className="mx-auto" style={{ color: palette.primary }} aria-hidden />
            <p className="mt-2 font-semibold">{str(c.title) || 'Reserva tu cita'}</p>
            {publicCtx && safeHttpUrl(c.url) ? (
              <div className="mt-4">
                <PublicButtonLink theme={theme} href={safeHttpUrl(c.url)!}>
                  Elegir mi horario
                </PublicButtonLink>
              </div>
            ) : (
              <p className="mt-1 text-sm opacity-70">{str(c.url) ? 'Aquí se abrirá tu calendario.' : 'Aquí aparecerá tu calendario.'}</p>
            )}
          </div>
        </Section>
      );

    case 'agenda':
      return (
        <Section theme={theme}>
          <div className="mx-auto max-w-2xl text-left">
            <Heading theme={theme}>Agenda</Heading>
            <ol className="mt-4 space-y-3">
              {list(c.items).map((item, index) => (
                <li key={`${str(item.title)}-${index}`} className="flex gap-4">
                  <span className="w-16 shrink-0 text-sm font-semibold" style={{ color: palette.primary }}>
                    {str(item.time)}
                  </span>
                  <span>
                    {str(item.title)}
                    {str(item.speaker) && <span className="block text-sm opacity-70">{str(item.speaker)}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Section>
      );

    case 'requisitos':
      return (
        <Section theme={theme}>
          <div className="mx-auto max-w-2xl text-left">
            <Heading theme={theme}>Requisitos</Heading>
            <ul className="mt-4 space-y-2">
              {strings(c.items).map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2">
                  <Check size={18} className="mt-0.5 shrink-0" style={{ color: palette.primary }} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      );
  }
}
