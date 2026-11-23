import {
  Award, BookOpen, Brain, Calendar, Camera, ChartLine, CircleCheck, Clock, Code, Coffee, Crown, Dumbbell, Flame, Gamepad2, Gem, Gift, Globe, Handshake, Headphones, Heart, Leaf, Lightbulb, Lock,
  MapPin, Music, Palette, Rocket, ShieldCheck, Smile, Sparkles, Star, Sun, Swords, Target, Trophy, Truck, Users, Wallet, Wrench, Zap, type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@/shared/design';
import { ICONS } from '@/shared/design';

/** Los íconos que puede llevar un beneficio: del nombre guardado al componente. */
const COMPONENTS: Record<IconName, LucideIcon> = {
  zap: Zap, 'shield-check': ShieldCheck, star: Star, heart: Heart, rocket: Rocket, trophy: Trophy, target: Target, users: Users, clock: Clock, 'circle-check': CircleCheck, sparkles: Sparkles, globe: Globe,
  lock: Lock, gift: Gift, flame: Flame, gem: Gem, lightbulb: Lightbulb, 'chart-line': ChartLine, award: Award, headphones: Headphones, 'gamepad-2': Gamepad2, 'map-pin': MapPin, calendar: Calendar, 'book-open': BookOpen,
  camera: Camera, music: Music, leaf: Leaf, coffee: Coffee, dumbbell: Dumbbell, wallet: Wallet, smile: Smile, handshake: Handshake, truck: Truck, wrench: Wrench, sun: Sun, brain: Brain, swords: Swords, crown: Crown, palette: Palette, code: Code,
};

/** El ícono de un nombre del catálogo (`undefined` si no es uno). */
export function iconOf(name: unknown): LucideIcon | undefined {
  return typeof name === 'string' && (ICONS as readonly string[]).includes(name) ? COMPONENTS[name as IconName] : undefined;
}

/** Cómo se llaman los íconos en el editor. */
export const ICON_LABELS: Record<IconName, string> = {
  zap: 'Rayo', 'shield-check': 'Escudo', star: 'Estrella', heart: 'Corazón', rocket: 'Cohete', trophy: 'Trofeo', target: 'Objetivo', users: 'Personas', clock: 'Reloj', 'circle-check': 'Palomita', sparkles: 'Destellos', globe: 'Mundo',
  lock: 'Candado', gift: 'Regalo', flame: 'Fuego', gem: 'Gema', lightbulb: 'Idea', 'chart-line': 'Gráfica', award: 'Premio', headphones: 'Audífonos', 'gamepad-2': 'Control', 'map-pin': 'Ubicación', calendar: 'Calendario', 'book-open': 'Libro',
  camera: 'Cámara', music: 'Música', leaf: 'Hoja', coffee: 'Café', dumbbell: 'Pesas', wallet: 'Cartera', smile: 'Sonrisa', handshake: 'Trato', truck: 'Envío', wrench: 'Herramienta', sun: 'Sol', brain: 'Mente', swords: 'Espadas', crown: 'Corona', palette: 'Paleta', code: 'Código',
};
