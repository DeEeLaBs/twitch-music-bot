import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import './index.css';

const routePath = window.location.pathname;
if (routePath.startsWith('/overlay') && !routePath.startsWith('/overlay/editor')) {
  document.documentElement.classList.add('obs-overlay-page');
  document.body.classList.add('obs-overlay-page');
}
if (routePath.startsWith('/dock/player')) {
  document.documentElement.classList.add('obs-dock-page');
  document.body.classList.add('obs-dock-page');
}

window.addEventListener('keydown', event => {
  if (event.key === 'Tab') document.documentElement.classList.add('focus-keyboard');
}, true);
window.addEventListener('pointerdown', () => document.documentElement.classList.remove('focus-keyboard'), true);
window.addEventListener('blur', () => document.documentElement.classList.remove('focus-keyboard'));

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary><App /></AppErrorBoundary>,
);
