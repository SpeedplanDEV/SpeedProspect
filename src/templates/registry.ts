// Mapeia nicho → template (carregado sob demanda para manter a página pública leve)
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { NichoLP, PropsTemplate } from './types';

export const TEMPLATES: Record<NichoLP, LazyExoticComponent<ComponentType<PropsTemplate>>> = {
  saude: lazy(() => import('./saude')),
  alimentacao: lazy(() => import('./alimentacao')),
  automotivo: lazy(() => import('./automotivo')),
  beleza: lazy(() => import('./beleza')),
  servicos: lazy(() => import('./servicos')),
};

export const templateDoNicho = (nicho: string) => TEMPLATES[(nicho in TEMPLATES ? nicho : 'servicos') as NichoLP];
