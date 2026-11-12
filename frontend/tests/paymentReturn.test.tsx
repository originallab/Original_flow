import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentReturnPage } from '@/pages/PaymentReturnPage';
import { ApiError } from '@/services/api';
import * as publicService from '@/services/publicPages';

vi.mock('@/services/publicPages', async (importOriginal) => ({ ...(await importOriginal<typeof publicService>()), getOrder: vi.fn() }));

const TOKEN = '3f2b8c1e-1a2b-4c3d-8e4f-0123456789ab';

function Lugar() {
  return <p data-testid="lugar">{useLocation().pathname}</p>;
}

function montar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/pago/:resultado" element={<PaymentReturnPage />} />
        <Route path="/p/:slug/orden/:token" element={<Lugar />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(publicService.getOrder).mockReset();
});
afterEach(() => sessionStorage.clear());

describe('ruta fija de retorno de Original Pay', () => {
  it('con el token en la dirección lleva a la orden de su página', async () => {
    vi.mocked(publicService.getOrder).mockResolvedValue({ publicToken: TOKEN, slug: 'mi-curso', status: 'pending' });
    montar(`/pago/retorno?order_token=${TOKEN}`);
    await waitFor(() => expect(screen.getByTestId('lugar')).toHaveTextContent(`/p/mi-curso/orden/${TOKEN}`));
    expect(vi.mocked(publicService.getOrder).mock.calls[0]![0]).toBe(TOKEN);
  });

  it('sin token en la dirección usa el que se recordó al salir a pagar', async () => {
    sessionStorage.setItem('of:lastOrder', TOKEN);
    vi.mocked(publicService.getOrder).mockResolvedValue({ publicToken: TOKEN, slug: 'mi-curso', status: 'paid' });
    montar('/pago/exito');
    await waitFor(() => expect(screen.getByTestId('lugar')).toHaveTextContent(`/p/mi-curso/orden/${TOKEN}`));
  });

  it('/pago/error hace lo mismo: el estado real lo decide el servidor', async () => {
    vi.mocked(publicService.getOrder).mockResolvedValue({ publicToken: TOKEN, slug: 'mi-curso', status: 'cancelled' });
    montar(`/pago/error?token=${TOKEN}`);
    await waitFor(() => expect(screen.getByTestId('lugar')).toHaveTextContent(`/p/mi-curso/orden/${TOKEN}`));
  });

  it('un token que no es un identificador válido no se consulta', async () => {
    montar('/pago/retorno?order_token=../../etc');
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos tu compra');
    expect(publicService.getOrder).not.toHaveBeenCalled();
  });

  it('sin token en ninguna parte avisa y no consulta', async () => {
    montar('/pago/retorno');
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos tu compra');
    expect(publicService.getOrder).not.toHaveBeenCalled();
  });

  it('una orden que no existe (404) avisa que no se encontró', async () => {
    vi.mocked(publicService.getOrder).mockRejectedValue(new ApiError(404, 'ORDER_NOT_FOUND', 'No existe'));
    montar(`/pago/retorno?order_token=${TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos tu compra');
  });

  it('si el servidor no responde ofrece reintentar', async () => {
    vi.mocked(publicService.getOrder).mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'caído'));
    vi.mocked(publicService.getOrder).mockResolvedValueOnce({ publicToken: TOKEN, slug: 'mi-curso', status: 'pending' });
    montar(`/pago/retorno?order_token=${TOKEN}`);
    (await screen.findByRole('button', { name: 'Reintentar' })).click();
    await waitFor(() => expect(screen.getByTestId('lugar')).toHaveTextContent(`/p/mi-curso/orden/${TOKEN}`));
  });
});
