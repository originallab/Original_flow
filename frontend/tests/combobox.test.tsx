import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { COUNTRY_OPTIONS } from '@/features/workspaces/countries';
import { Combobox, type ComboOption } from '@/shared/ui/Combobox';
import { createFakeBackend, stubMockEnv, workspaceFixture, type FakeBackend } from './helpers/fakeBackend';
import { montar } from './helpers/renderApp';

const OPCIONES: ComboOption[] = ['Bolivia', 'Colombia', 'Costa Rica', 'México', 'Perú', 'Chile', 'Macedonia del Norte', 'Malasia', 'Panamá'].map((n) => ({ value: n, label: n }));

function Harness({ initial = '', onChange = () => undefined, options = OPCIONES, disabled = false }: { initial?: string; onChange?: (v: string) => void; options?: ComboOption[]; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <Combobox
      label="País"
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      disabled={disabled}
    />
  );
}

const campo = () => screen.getByRole('combobox', { name: 'País' });
const nombres = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('Combobox', () => {
  it('empieza cerrado y se abre al hacer clic, con todas las opciones', async () => {
    render(<Harness />);
    expect(campo()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.click(campo());
    expect(campo()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox', { name: 'País' })).toBeInTheDocument();
    expect(nombres()).toHaveLength(OPCIONES.length);
  });

  it('escribir filtra la lista', async () => {
    render(<Harness />);
    await userEvent.type(campo(), 'costa');
    expect(nombres()).toEqual(['Costa Rica']);
  });

  it('el filtro ignora mayúsculas y acentos («mexico» encuentra «México», «PERU» a «Perú»)', async () => {
    render(<Harness />);
    await userEvent.type(campo(), 'mexico');
    expect(nombres()).toEqual(['México']);
    await userEvent.clear(campo());
    await userEvent.type(campo(), 'PERU');
    expect(nombres()).toEqual(['Perú']);
  });

  it('las que empiezan con lo escrito van antes que las que solo lo contienen', async () => {
    render(<Harness />);
    await userEvent.type(campo(), 'ma');
    // «Macedonia» y «Malasia» empiezan con «ma»; «Panamá» solo lo contiene.
    const lista = nombres();
    expect(lista.slice(0, 2)).toEqual(['Macedonia del Norte', 'Malasia']);
    expect(lista).toContain('Panamá');
    expect(lista.indexOf('Panamá')).toBeGreaterThan(1);
  });

  it('sin coincidencias dice «Sin resultados»', async () => {
    render(<Harness />);
    await userEvent.type(campo(), 'zzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });

  it('elegir una opción con el ratón la selecciona, muestra su nombre y cierra la lista', async () => {
    const alCambiar = vi.fn();
    render(<Harness onChange={alCambiar} />);
    await userEvent.click(campo());
    await userEvent.click(screen.getByRole('option', { name: 'Chile' }));
    expect(alCambiar).toHaveBeenLastCalledWith('Chile');
    expect(campo()).toHaveValue('Chile');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('al volver a abrirlo con una opción elegida muestra todas y marca la elegida', async () => {
    render(<Harness initial="Perú" />);
    await userEvent.click(campo());
    expect(nombres()).toHaveLength(OPCIONES.length);
    expect(screen.getByRole('option', { name: 'Perú' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Chile' })).toHaveAttribute('aria-selected', 'false');
  });

  it('con el teclado: flecha abajo abre, flechas mueven la opción activa y Enter elige', async () => {
    const alCambiar = vi.fn();
    render(<Harness onChange={alCambiar} />);
    await userEvent.tab();
    expect(campo()).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(campo()).toHaveAttribute('aria-expanded', 'true');
    // La primera ya está activa; una flecha más baja a la segunda.
    expect(campo()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]!.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(campo()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id);
    await userEvent.keyboard('{ArrowUp}{ArrowDown}{ArrowDown}{Enter}');
    expect(alCambiar).toHaveBeenLastCalledWith(OPCIONES[2]!.value);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Enter con la lista cerrada no elige nada', async () => {
    const alCambiar = vi.fn();
    render(<Harness onChange={alCambiar} />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('elegir con Enter no envía el formulario que lo contiene', async () => {
    const alEnviar = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={alEnviar}>
        <Harness />
      </form>,
    );
    await userEvent.type(campo(), 'chi{Enter}');
    expect(campo()).toHaveValue('Chile');
    expect(alEnviar).not.toHaveBeenCalled();
  });

  it('Escape cierra la lista y descarta lo escrito', async () => {
    render(<Harness initial="Chile" />);
    await userEvent.click(campo());
    await userEvent.clear(campo());
    await userEvent.type(campo(), 'bol');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(campo()).toHaveValue('Chile');
  });

  it('al salir del campo con un texto que no coincide con nada, vuelve a lo elegido', async () => {
    const alCambiar = vi.fn();
    render(<Harness initial="Chile" onChange={alCambiar} />);
    await userEvent.click(campo());
    await userEvent.clear(campo());
    await userEvent.type(campo(), 'Narnia');
    await userEvent.tab();
    expect(campo()).toHaveValue('Chile');
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('al salir del campo con el nombre completo (sin acentos ni mayúsculas) lo elige', async () => {
    const alCambiar = vi.fn();
    render(<Harness onChange={alCambiar} />);
    await userEvent.type(campo(), 'MEXICO');
    expect(alCambiar).toHaveBeenLastCalledWith('México');
    await userEvent.tab();
    expect(campo()).toHaveValue('México');
  });

  it('vaciar el campo y salir deja la selección en blanco', async () => {
    const alCambiar = vi.fn();
    render(<Harness initial="Chile" onChange={alCambiar} />);
    await userEvent.clear(campo());
    await userEvent.tab();
    expect(alCambiar).toHaveBeenLastCalledWith('');
    expect(campo()).toHaveValue('');
  });

  it('un valor que no está en la lista (un dato antiguo) se muestra tal cual', () => {
    render(<Harness initial="Mexico DF" />);
    expect(campo()).toHaveValue('Mexico DF');
  });

  it('deshabilitado no se abre ni se puede editar', async () => {
    render(<Harness disabled />);
    expect(campo()).toBeDisabled();
    await userEvent.click(campo());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

describe('lista de países', () => {
  const nombresPais = COUNTRY_OPTIONS.map((o) => o.label);

  it('trae los países de Latinoamérica, España y los más usados', () => {
    for (const pais of ['México', 'Colombia', 'Argentina', 'Chile', 'Perú', 'Ecuador', 'Venezuela', 'Uruguay', 'Paraguay', 'Bolivia', 'Costa Rica', 'Panamá', 'Guatemala', 'República Dominicana', 'España', 'Estados Unidos', 'Brasil', 'Canadá']) {
      expect(nombresPais, pais).toContain(pais);
    }
  });

  it('no repite ningún país, no trae vacíos y son más de 190', () => {
    expect(new Set(nombresPais).size).toBe(nombresPais.length);
    expect(nombresPais.every((n) => n.trim() !== '' && n === n.trim())).toBe(true);
    expect(nombresPais.length).toBeGreaterThan(190);
  });

  it('está ordenada alfabéticamente según el español', () => {
    const ordenada = [...nombresPais].sort((a, b) => a.localeCompare(b, 'es'));
    expect(nombresPais).toEqual(ordenada);
    expect(nombresPais.indexOf('España')).toBeLessThan(nombresPais.indexOf('Estados Unidos'));
  });
});

describe('País en los datos del negocio', () => {
  let backend: FakeBackend;
  beforeEach(() => {
    stubMockEnv();
    backend = createFakeBackend();
    sessionStore.set(backend.seedSession('ana@correo.com', 'Ana'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    sessionStorage.clear();
  });
  const patches = () => backend.calls.filter((c) => c.method === 'PATCH');

  it('es un combobox con los países, y se puede cambiar de país en «Mi negocio»', async () => {
    backend.state.workspaces = [workspaceFixture({ id: 'wa', country: 'México' })];
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    const pais = screen.getByRole('combobox', { name: 'País' });
    expect(pais).toHaveValue('México');
    await userEvent.click(pais);
    await userEvent.click(within(screen.getByRole('listbox', { name: 'País' })).getByRole('option', { name: 'Colombia' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await screen.findByRole('status');
    expect(patches()[0]?.body).toEqual({ country: 'Colombia' });
  });

  it('vaciar el país lo borra (se manda null)', async () => {
    backend.state.workspaces = [workspaceFixture({ id: 'wa', country: 'México' })];
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    await userEvent.clear(screen.getByRole('combobox', { name: 'País' }));
    await userEvent.tab();
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await screen.findByRole('status');
    expect(patches()[0]?.body).toEqual({ country: null });
  });

  it('un país antiguo que no está en la lista se conserva si no se toca', async () => {
    backend.state.workspaces = [workspaceFixture({ id: 'wa', name: 'Antiguo', country: 'Mexico DF' })];
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    expect(screen.getByRole('combobox', { name: 'País' })).toHaveValue('Mexico DF');
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await screen.findByRole('status');
    expect(patches()).toHaveLength(0);
  });

  it('quien no administra el negocio lo ve deshabilitado', async () => {
    backend.state.workspaces = [workspaceFixture({ id: 'wa', role: 'vendedor' })];
    montar('/negocio');
    await screen.findByRole('heading', { name: 'Mi negocio' });
    expect(screen.getByRole('combobox', { name: 'País' })).toBeDisabled();
  });

  it('en el alta del negocio se elige el país de la lista y viaja con su nombre', async () => {
    backend.state.workspaces = [];
    montar('/bienvenida');
    await userEvent.click(await screen.findByRole('button', { name: /empezar/i }));
    await userEvent.type(screen.getByLabelText(/nombre del negocio/i), 'Nimbral');
    await userEvent.type(screen.getByRole('combobox', { name: 'País' }), 'arg');
    await userEvent.click(screen.getByRole('option', { name: 'Argentina' }));
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await screen.findByRole('heading', { name: /configura tu marca/i });
    expect(backend.calls.find((c) => c.method === 'POST' && c.path === '/workspaces')?.body).toEqual({ name: 'Nimbral', country: 'Argentina' });
  });
});
