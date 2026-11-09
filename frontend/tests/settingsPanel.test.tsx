import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as funnelsService from '@/services/funnels';
import { getFunnel, listCtas, type Funnel, type FunnelObjective } from '@/services/funnels';
import { BLOCKS } from '@/shared/blocks/catalog';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { block, seedFunnel, startDemo } from './helpers/demoApp';
import { montar } from './helpers/renderApp';

const retraso = vi.hoisted(() => ({ ms: 25 }));
vi.mock('@/features/editor/constants', () => ({
  get AUTOSAVE_DELAY_MS() {
    return retraso.ms;
  },
}));
vi.mock('@/services/funnels', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/funnels')>();
  return { ...original, saveContent: vi.fn(original.saveContent), updateFunnel: vi.fn(original.updateFunnel), saveTypeConfig: vi.fn(original.saveTypeConfig), updateCta: vi.fn(original.updateCta), listCtas: vi.fn(original.listCtas) };
});

let ctx: Awaited<ReturnType<typeof startDemo>>;
beforeEach(async () => {
  retraso.ms = 25;
  for (const fn of [funnelsService.saveContent, funnelsService.updateFunnel, funnelsService.saveTypeConfig, funnelsService.updateCta, funnelsService.listCtas]) vi.mocked(fn).mockReset();
  ctx = await startDemo();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const persistido = (f: Funnel) => getFunnel(ctx.token, f.id);
const lista = () => screen.getByRole('navigation', { name: /bloques de la página/i });
const ajustes = () => screen.getByRole('region', { name: 'Panel de ajustes' });
const seccion = (nombre: string) => within(ajustes()).getByRole('region', { name: nombre });

async function abrir(f: Funnel) {
  const vista = montar(`/funnels/${f.id}/editor`);
  await screen.findByRole('navigation', { name: /bloques de la página/i });
  return vista;
}
async function abrirAjustes(f: Funnel) {
  const vista = await abrir(f);
  await userEvent.click(screen.getByRole('tab', { name: /^Ajustes/ }));
  await within(ajustes()).findByRole('region', { name: 'Datos del funnel' });
  return vista;
}
async function conTipo(objective: FunnelObjective, extra: Parameters<typeof seedFunnel>[2] = {}) {
  const funnel = await seedFunnel(ctx.token, ctx.workspace, { name: `Funnel ${objective}`, objective, ...extra });
  // Lo que hizo el montaje de la prueba no cuenta: solo lo que haga la pantalla.
  for (const fn of [funnelsService.saveContent, funnelsService.updateFunnel, funnelsService.saveTypeConfig, funnelsService.updateCta, funnelsService.listCtas]) vi.mocked(fn).mockClear();
  return funnel;
}

describe('pestañas del panel derecho', () => {
  it('empieza en «Bloque»; «Ajustes» muestra los datos, los ajustes del tipo y los botones', async () => {
    const f = await conTipo('leads');
    await abrir(f);
    expect(screen.getByRole('tab', { name: 'Bloque' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Panel de ajustes' })).not.toBeInTheDocument(); // oculto
    await userEvent.click(screen.getByRole('tab', { name: /^Ajustes/ }));
    expect(screen.getByRole('tab', { name: /^Ajustes/ })).toHaveAttribute('aria-selected', 'true');
    for (const titulo of ['Datos del funnel', 'Ajustes del funnel', 'Botones y formularios']) expect(await within(ajustes()).findByRole('region', { name: titulo })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /^Propiedades/ })).not.toBeInTheDocument();
  });

  it('elegir un bloque vuelve a «Bloque»', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    await userEvent.click(within(lista()).getByRole('button', { name: /^Beneficios/ }));
    expect(screen.getByRole('tab', { name: 'Bloque' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Propiedades: Beneficios' })).toBeInTheDocument();
  });

  it('lo escrito en Ajustes no se pierde al pasar a «Bloque» y volver', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    await userEvent.type(within(seccion('Datos del funnel')).getByLabelText('Nombre del funnel'), ' extra');
    await userEvent.click(screen.getByRole('tab', { name: 'Bloque' }));
    await userEvent.click(screen.getByRole('tab', { name: /^Ajustes/ }));
    expect(within(seccion('Datos del funnel')).getByLabelText('Nombre del funnel')).toHaveValue('Funnel leads extra');
  });

  it('con cambios sin guardar la pestaña lo avisa con un punto', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    expect(within(screen.getByRole('tab', { name: /^Ajustes/ })).queryByRole('img', { name: /cambios sin guardar/i })).not.toBeInTheDocument();
    await userEvent.type(within(seccion('Datos del funnel')).getByLabelText('Nombre del funnel'), '!');
    expect(within(screen.getByRole('tab', { name: /^Ajustes/ })).getByRole('img', { name: /cambios sin guardar/i })).toBeInTheDocument();
  });
});

describe('datos del funnel', () => {
  it('muestra el nombre y la dirección; un funnel que no cobra no pide precio', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const datos = seccion('Datos del funnel');
    expect(within(datos).getByLabelText('Nombre del funnel')).toHaveValue('Funnel leads');
    expect(within(datos).getByLabelText('Dirección de la página')).toHaveValue(f.slug);
    expect(within(datos).queryByLabelText('Precio')).not.toBeInTheDocument();
    expect(within(datos).getByRole('button', { name: /guardar datos/i })).toBeDisabled();
  });

  it('un funnel de venta pide precio y divisa', async () => {
    const f = await conTipo('venta', { price: 1490 });
    await abrirAjustes(f);
    const datos = seccion('Datos del funnel');
    expect(within(datos).getByLabelText('Precio')).toHaveValue(1490);
    expect(within(datos).getByLabelText('Divisa')).toHaveValue('MXN');
  });

  it('cambiar el nombre lo guarda, lo muestra arriba y manda solo lo que cambió', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const datos = seccion('Datos del funnel');
    const u = userEvent.setup({ delay: null });
    await u.clear(within(datos).getByLabelText('Nombre del funnel'));
    await u.type(within(datos).getByLabelText('Nombre del funnel'), 'Curso nuevo');
    await u.click(within(datos).getByRole('button', { name: /guardar datos/i }));
    expect(await within(datos).findByText('Cambios guardados.')).toBeInTheDocument();
    expect(vi.mocked(funnelsService.updateFunnel).mock.calls[0]![2]).toEqual({ name: 'Curso nuevo' });
    expect(within(screen.getByRole('banner')).getByText('Curso nuevo')).toBeInTheDocument();
    expect((await persistido(f)).name).toBe('Curso nuevo');
    expect(within(datos).getByRole('button', { name: /guardar datos/i })).toBeDisabled();
  });

  it('el precio y la divisa de una venta se guardan', async () => {
    const f = await conTipo('venta');
    await abrirAjustes(f);
    const datos = seccion('Datos del funnel');
    fireEvent.change(within(datos).getByLabelText('Precio'), { target: { value: '2500' } });
    await userEvent.selectOptions(within(datos).getByLabelText('Divisa'), 'USD');
    await userEvent.click(within(datos).getByRole('button', { name: /guardar datos/i }));
    await within(datos).findByText('Cambios guardados.');
    expect(await persistido(f)).toMatchObject({ price: 2500, currency: 'USD' });
  });

  it('la dirección debe tener un formato válido y no se guarda si no lo tiene', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const datos = seccion('Datos del funnel');
    for (const [mala, mensaje] of [
      ['Mi Curso', /minúsculas, números y guiones/i],
      ['ab', /mínimo 3/i],
    ] as const) {
      fireEvent.change(within(datos).getByLabelText('Dirección de la página'), { target: { value: mala } });
      await userEvent.click(within(datos).getByRole('button', { name: /guardar datos/i }));
      expect(await within(datos).findByText(mensaje)).toBeInTheDocument();
    }
    expect(funnelsService.updateFunnel).not.toHaveBeenCalled();
  });

  it('una dirección que ya usa otro funnel se explica junto al campo', async () => {
    const otro = await conTipo('citas', { name: 'Otro' });
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const datos = seccion('Datos del funnel');
    fireEvent.change(within(datos).getByLabelText('Dirección de la página'), { target: { value: otro.slug } });
    await userEvent.click(within(datos).getByRole('button', { name: /guardar datos/i }));
    expect(await within(datos).findByText('Ese enlace ya lo usa otro funnel. Prueba con otro.')).toBeInTheDocument();
    expect(within(datos).getByLabelText('Dirección de la página')).toBeInvalid();
    expect((await persistido(f)).slug).toBe(f.slug);
  });

  it('cambiar solo la dirección manda solo la dirección (no el nombre)', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const datos = seccion('Datos del funnel');
    fireEvent.change(within(datos).getByLabelText('Dirección de la página'), { target: { value: 'mi-direccion-nueva' } });
    await userEvent.click(within(datos).getByRole('button', { name: /guardar datos/i }));
    await within(datos).findByText('Cambios guardados.');
    expect(vi.mocked(funnelsService.updateFunnel).mock.calls[0]![2]).toEqual({ slug: 'mi-direccion-nueva' });
    expect((await persistido(f)).slug).toBe('mi-direccion-nueva');
  });

  it('el nombre no puede quedar vacío', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const datos = seccion('Datos del funnel');
    await userEvent.clear(within(datos).getByLabelText('Nombre del funnel'));
    await userEvent.click(within(datos).getByRole('button', { name: /guardar datos/i }));
    expect(await within(datos).findByText('Este campo es obligatorio.')).toBeInTheDocument();
    expect(funnelsService.updateFunnel).not.toHaveBeenCalled();
  });

  it('si no se puede guardar avisa y conserva lo escrito', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    vi.mocked(funnelsService.updateFunnel).mockRejectedValueOnce(new Error('sin red'));
    const datos = seccion('Datos del funnel');
    await userEvent.type(within(datos).getByLabelText('Nombre del funnel'), '!');
    await userEvent.click(within(datos).getByRole('button', { name: /guardar datos/i }));
    expect(await within(datos).findByRole('alert')).toHaveTextContent(/no se pudo guardar/i);
    expect(within(datos).getByLabelText('Nombre del funnel')).toHaveValue('Funnel leads!');
  });
});

describe('ajustes del tipo de funnel', () => {
  it('leads: muestra el mensaje de agradecimiento que dejó el asistente, y se edita y se guarda', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    const mensaje = within(tipo).getByLabelText('Mensaje de agradecimiento');
    expect(mensaje).toHaveValue((FUNNEL_TYPES.leads.initial().thankYou as { message: string }).message);
    expect(within(tipo).queryByText(/todavía no guardas/i)).not.toBeInTheDocument();
    const u = userEvent.setup({ delay: null });
    await u.clear(mensaje);
    await u.type(mensaje, '¡Nos vemos pronto!');
    await u.type(within(tipo).getByLabelText(/enlace al que enviar después/i), 'https://gracias.test');
    await u.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    expect(await within(tipo).findByText('Ajustes guardados.')).toBeInTheDocument();
    expect((await persistido(f)).typeConfig).toEqual({ thankYou: { message: '¡Nos vemos pronto!', redirectUrl: 'https://gracias.test' } });
  });

  it('un campo obligatorio vacío (dentro de un grupo) se marca y no se guarda', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    await userEvent.clear(within(tipo).getByLabelText('Mensaje de agradecimiento'));
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    expect(await within(tipo).findByText('Este campo es obligatorio.')).toBeInTheDocument();
    expect(within(tipo).getByRole('alert')).toHaveTextContent(/completa los campos marcados/i);
    expect(funnelsService.saveTypeConfig).not.toHaveBeenCalled();
  });

  it('un enlace inválido se marca', async () => {
    const f = await conTipo('leads');
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    await userEvent.type(within(tipo).getByLabelText(/enlace al que enviar después/i), 'no es un enlace');
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    expect(await within(tipo).findByText(/dirección válida/i)).toBeInTheDocument();
  });

  it('citas: sin ajustes guardados empieza con valores sugeridos y pide lo que falta (el enlace del calendario)', async () => {
    const f = await conTipo('citas');
    expect((await persistido(f)).typeConfig).toBeNull();
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    expect(within(tipo).getByText(/todavía no guardas estos ajustes/i)).toBeInTheDocument();
    expect(within(tipo).getByLabelText('Duración de la cita (minutos)')).toHaveValue(30);
    expect(within(tipo).getByRole('button', { name: /guardar ajustes/i })).toBeEnabled();
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    expect(await within(tipo).findByText('Este campo es obligatorio.')).toBeInTheDocument();
    fireEvent.change(within(tipo).getByLabelText('Enlace de tu calendario'), { target: { value: 'https://cal.test/ana' } });
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    expect(await within(tipo).findByText('Ajustes guardados.')).toBeInTheDocument();
    expect((await persistido(f)).typeConfig).toMatchObject({ calendarUrl: 'https://cal.test/ana', durationMin: 30 });
    expect(within(tipo).queryByText(/todavía no guardas estos ajustes/i)).not.toBeInTheDocument();
  });

  it('citas: la duración debe ser un entero de 5 a 480', async () => {
    const f = await conTipo('citas');
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    fireEvent.change(within(tipo).getByLabelText('Enlace de tu calendario'), { target: { value: 'https://cal.test/ana' } });
    fireEvent.change(within(tipo).getByLabelText('Duración de la cita (minutos)'), { target: { value: '3' } });
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    expect(await within(tipo).findByText('Debe ser un número entero, entre 5 y 480.')).toBeInTheDocument();
  });

  it('venta: formas de pago (lista de textos) y mensaje; se agregan y se guardan', async () => {
    const f = await conTipo('venta');
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    expect(within(tipo).getByLabelText('Forma de pago 1')).toHaveValue('Tarjeta de crédito o débito');
    await userEvent.click(within(tipo).getByRole('button', { name: /agregar forma de pago/i }));
    const nueva = within(tipo).getByLabelText('Forma de pago 2');
    await userEvent.clear(nueva);
    await userEvent.type(nueva, 'Transferencia');
    fireEvent.change(within(tipo).getByLabelText('Precio antes del descuento (opcional)'), { target: { value: '1999' } });
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    await within(tipo).findByText('Ajustes guardados.');
    expect((await persistido(f)).typeConfig).toMatchObject({ paymentMethods: ['Tarjeta de crédito o débito', 'Transferencia'], offer: { compareAtPrice: 1999 } });
  });

  it('webinar: fecha, zona horaria, enlace y agenda', async () => {
    const f = await conTipo('webinar');
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    expect(within(tipo).getByLabelText('Zona horaria')).not.toHaveValue('');
    fireEvent.change(within(tipo).getByLabelText('Enlace para entrar al evento'), { target: { value: 'https://meet.test/x' } });
    await userEvent.click(within(tipo).getByRole('button', { name: /agregar tema/i }));
    fireEvent.change(within(within(tipo).getByRole('group', { name: 'Tema 1' })).getByLabelText('Tema'), { target: { value: 'Bienvenida' } });
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    await within(tipo).findByText('Ajustes guardados.');
    const guardado = (await persistido(f)).typeConfig as { joinUrl: string; agenda: { title: string }[] };
    expect(guardado.joinUrl).toBe('https://meet.test/x');
    expect(guardado.agenda).toEqual([{ title: 'Bienvenida' }]);
  });

  it('aplicación: las preguntas se editan y las opciones solo aparecen si el tipo es lista', async () => {
    const f = await conTipo('aplicacion');
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    const pregunta = within(tipo).getByRole('group', { name: 'Pregunta 1' });
    expect(within(pregunta).queryByRole('button', { name: /agregar opción/i })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(pregunta).getByLabelText('Tipo de respuesta'), 'select');
    await userEvent.click(within(pregunta).getByRole('button', { name: /agregar opción/i }));
    expect(within(pregunta).getByLabelText('Opción 1')).toHaveValue('Nueva opción');
    await userEvent.click(within(tipo).getByRole('button', { name: /agregar pregunta/i }));
    expect(within(tipo).getAllByRole('group', { name: /^Pregunta \d$/ })).toHaveLength(2);
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    await within(tipo).findByText('Ajustes guardados.');
    const guardado = (await persistido(f)).typeConfig as { questions: { type: string; options?: string[] }[] };
    expect(guardado.questions).toHaveLength(2);
    expect(guardado.questions[0]).toMatchObject({ type: 'select', options: ['Nueva opción'] });
  });

  it('aplicación: dos preguntas con el mismo identificador se marcan', async () => {
    const f = await conTipo('aplicacion');
    await abrirAjustes(f);
    const tipo = seccion('Ajustes del funnel');
    await userEvent.click(within(tipo).getByRole('button', { name: /agregar pregunta/i }));
    fireEvent.change(within(within(tipo).getByRole('group', { name: 'Pregunta 2' })).getByLabelText('Identificador interno'), { target: { value: 'motivo' } });
    await userEvent.click(within(tipo).getByRole('button', { name: /guardar ajustes/i }));
    expect(await within(tipo).findByText(/no se pueden repetir/i)).toBeInTheDocument();
  });

  it('un tipo sin ajustes propios no muestra esa sección (ninguno de los disponibles es así)', async () => {
    for (const tipo of ['leads', 'venta', 'citas', 'magnet', 'webinar', 'aplicacion'] as const) expect(FUNNEL_TYPES[tipo].fields.length, tipo).toBeGreaterThan(0);
  });
});

describe('botones y formularios (CTA)', () => {
  it('lista un CTA por cada botón y formulario, y el formulario no deja cambiar su acción', async () => {
    const f = await conTipo('leads', { blocks: [block('encabezado', 'encabezado', BLOCKS.encabezado.create()), block('boton', 'boton', { label: 'Empezar' }, 2), block('formulario', 'formulario', BLOCKS.formulario.create(), 3)] });
    await abrirAjustes(f);
    const cta = seccion('Botones y formularios');
    const boton = await within(cta).findByRole('group', { name: 'Botón: Empezar' });
    expect(within(boton).getByLabelText('¿Qué hace?')).toHaveValue('scroll_to');
    const formulario = within(cta).getByRole('group', { name: 'Formulario: Enviar' });
    expect(within(formulario).queryByLabelText('¿Qué hace?')).not.toBeInTheDocument();
    expect(within(formulario).getByText(/enviar los datos del formulario/i)).toBeInTheDocument();
  });

  it('sin botones ni formularios lo dice', async () => {
    const f = await conTipo('leads', { blocks: [block('encabezado', 'encabezado', BLOCKS.encabezado.create())] });
    await abrirAjustes(f);
    expect(await within(seccion('Botones y formularios')).findByText(/no tiene botones ni formularios/i)).toBeInTheDocument();
  });

  it('con «Abrir un enlace»: un destino inválido se marca; uno válido se guarda con su seguimiento', async () => {
    const f = await conTipo('leads', { blocks: [block('boton', 'boton', { label: 'Ir' })] });
    await abrirAjustes(f);
    const boton = await within(seccion('Botones y formularios')).findByRole('group', { name: 'Botón: Ir' });
    await userEvent.selectOptions(within(boton).getByLabelText('¿Qué hace?'), 'url');
    fireEvent.change(within(boton).getByLabelText('Enlace'), { target: { value: 'ftp://x.test' } });
    await userEvent.click(within(boton).getByRole('button', { name: /^guardar$/i }));
    expect(await within(boton).findByText(/empiece con http/i)).toBeInTheDocument();
    expect(funnelsService.updateCta).not.toHaveBeenCalled();

    fireEvent.change(within(boton).getByLabelText('Enlace'), { target: { value: 'https://mi-sitio.test/oferta' } });
    await userEvent.type(within(boton).getByLabelText(/identificador de seguimiento/i), 'camp-1');
    await userEvent.click(within(boton).getByRole('button', { name: /^guardar$/i }));
    expect(await within(boton).findByText('Guardado.')).toBeInTheDocument();
    expect((await listCtas(ctx.token, f.id))[0]).toMatchObject({ actionType: 'url', destination: 'https://mi-sitio.test/oferta', trackingId: 'camp-1' });
  });

  it('un botón con enlace y sin destino avisa que no se podrá publicar', async () => {
    const f = await conTipo('leads', { blocks: [block('boton', 'boton', { label: 'Ir' })] });
    await funnelsService.updateCta(ctx.token, f.id, 'boton', { actionType: 'url' });
    vi.mocked(funnelsService.updateCta).mockClear();
    await abrirAjustes(f);
    const boton = await within(seccion('Botones y formularios')).findByRole('group', { name: 'Botón: Ir' });
    expect(within(boton).getByText(/falta el enlace: sin él no se puede publicar/i)).toBeInTheDocument();
  });

  it('el botón de pago solo se ofrece en un funnel que cobra', async () => {
    const venta = await conTipo('venta', { blocks: [block('boton', 'boton', { label: 'Comprar' })] });
    await abrirAjustes(venta);
    const boton = await within(seccion('Botones y formularios')).findByRole('group', { name: 'Botón: Comprar' });
    expect(within(boton).getByLabelText('¿Qué hace?')).toHaveValue('checkout');
    expect(within(within(boton).getByLabelText('¿Qué hace?')).getByRole('option', { name: /cobrar con original pay/i })).toBeInTheDocument();
  });

  it('en un funnel que no cobra no existe «Cobrar con Original Pay»', async () => {
    const f = await conTipo('leads', { blocks: [block('boton', 'boton', { label: 'Ir' })] });
    await abrirAjustes(f);
    const boton = await within(seccion('Botones y formularios')).findByRole('group', { name: 'Botón: Ir' });
    expect(within(within(boton).getByLabelText('¿Qué hace?')).queryByRole('option', { name: /cobrar/i })).not.toBeInTheDocument();
  });

  it('al agregar un botón en la página, aparece en la lista cuando se guarda', async () => {
    const f = await conTipo('leads', { blocks: [block('encabezado', 'encabezado', BLOCKS.encabezado.create())] });
    await abrirAjustes(f);
    await within(seccion('Botones y formularios')).findByText(/no tiene botones ni formularios/i);
    await userEvent.click(screen.getByRole('button', { name: /agregar bloque/i }));
    await userEvent.click(within(screen.getByRole('list', { name: /bloques disponibles/i })).getByRole('button', { name: /^Botón/ }));
    expect(await within(seccion('Botones y formularios')).findByRole('group', { name: 'Botón: Quiero empezar' })).toBeInTheDocument();
  });

  it('si no se pueden cargar avisa y deja reintentar', async () => {
    const f = await conTipo('leads');
    vi.mocked(funnelsService.listCtas).mockRejectedValueOnce(new Error('sin red'));
    await abrirAjustes(f);
    const cta = seccion('Botones y formularios');
    expect(await within(cta).findByRole('alert')).toHaveTextContent(/no se pudieron cargar los botones/i);
    await userEvent.click(within(cta).getByRole('button', { name: /reintentar/i }));
    expect(await within(cta).findByRole('group', { name: /Formulario/ })).toBeInTheDocument();
  });

  it('si no se puede guardar un CTA avisa', async () => {
    const f = await conTipo('leads', { blocks: [block('boton', 'boton', { label: 'Ir' })] });
    await abrirAjustes(f);
    const boton = await within(seccion('Botones y formularios')).findByRole('group', { name: 'Botón: Ir' });
    vi.mocked(funnelsService.updateCta).mockRejectedValueOnce(new Error('sin red'));
    await userEvent.type(within(boton).getByLabelText(/identificador de seguimiento/i), 'x');
    await userEvent.click(within(boton).getByRole('button', { name: /^guardar$/i }));
    expect(await within(boton).findByRole('alert')).toHaveTextContent(/no se pudo guardar/i);
    await waitFor(() => expect(within(boton).getByLabelText(/identificador de seguimiento/i)).toHaveValue('x'));
  });
});
