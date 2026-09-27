import { createContext, useContext } from 'react';
import type { NichoLP } from '../types';

/** Nicho da página (usado nas ilustrações quando faltam fotos) */
export const ContextoNicho = createContext<NichoLP>('servicos');
export const useNicho = () => useContext(ContextoNicho);
