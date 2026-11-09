import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { WorkspaceProvider } from '@/features/workspaces/WorkspaceProvider';
import { routes } from '@/router';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

/** Monta toda la aplicación (con sus proveedores y rutas reales) en la ruta indicada. */
export function montar(ruta: string, estado?: unknown) {
  const router = createMemoryRouter(routes, { initialEntries: [estado === undefined ? ruta : { pathname: ruta, state: estado }] });
  const view = render(
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <RouterProvider router={router} />
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
  return { router, ...view };
}
