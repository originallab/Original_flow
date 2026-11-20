import type { FunnelObjective } from '@/services/funnels';
import { TONES, type Brief } from './catalog';

/** Para pruebas: unas cuantas opciones por sección; se arma un formulario eligiendo una al azar de cada una. */
const NAMES = ['Curso de Excel', 'Mentoría de ventas', 'Taller de fotografía', 'Asesoría fiscal', 'Clases de inglés', 'Plan de entrenamiento'];
const OFFERS = [
  'Un programa en línea con clases en vivo y material descargable.',
  'Sesiones personalizadas uno a uno con seguimiento semanal.',
  'Un taller práctico de cuatro semanas con ejercicios reales.',
  'Un servicio completo de principio a fin, sin complicaciones.',
];
const RESULTS = ['Ahorra 5 horas a la semana en tus reportes', 'Consigue tus primeros 10 clientes en 30 días', 'Domina lo básico en un mes, sin experiencia previa', 'Ten tus finanzas en orden desde el primer mes'];
const PRICES = ['$1,490 MXN', '$990 MXN', 'USD 49', '$2,500 MXN'];
const AUDIENCES = ['Emprendedores que apenas empiezan', 'Profesionistas con poco tiempo', 'Estudiantes que quieren cambiar de carrera', 'Dueños de pequeños negocios'];
const OBJECTIONS = ['No tengo tiempo', 'Es muy caro para mí', 'No sé si me va a funcionar', 'Ya intenté algo parecido y no funcionó'];
const CTAS = ['Quiero empezar', 'Reservar mi lugar', 'Quiero más información', 'Comenzar ahora'];
const EXTRAS = ['Menciona que hay clases grabadas.', 'Resalta que hay garantía de satisfacción.', 'Usa un lenguaje sencillo, sin tecnicismos.', ''];

const pick = <T,>(items: readonly T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** Un brief de prueba con una opción al azar por sección. El precio solo se llena en los funnels de venta. `random` se puede inyectar. */
export function randomBrief(objective: FunnelObjective, random: () => number = Math.random): Brief {
  return {
    name: pick(NAMES, random),
    offer: pick(OFFERS, random),
    result: pick(RESULTS, random),
    price: objective === 'venta' ? pick(PRICES, random) : '',
    audience: pick(AUDIENCES, random),
    objections: pick(OBJECTIONS, random),
    tone: pick(TONES, random).id,
    cta: pick(CTAS, random),
    extra: pick(EXTRAS, random),
  };
}
