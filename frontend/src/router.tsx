import { createBrowserRouter } from 'react-router-dom';
import { BasePage } from '@/pages/BasePage';

/** Rutas de la aplicación. Cada pieza del front registra aquí sus pantallas. */
export const router = createBrowserRouter([{ path: '/', element: <BasePage /> }]);
