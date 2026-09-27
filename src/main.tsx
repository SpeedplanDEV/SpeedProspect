import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { recarregarUmaVez } from './components/ErroTela';
import './base.css';

// Arquivo de uma versão anterior (aba aberta durante uma atualização): recarrega para pegar a versão nova
window.addEventListener('vite:preloadError', (e) => {
  if (recarregarUmaVez()) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
