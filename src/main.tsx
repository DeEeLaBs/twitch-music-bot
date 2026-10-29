import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import './index.css';

const routePath = window.location.pathname;
if (routePath.startsWith('/overlay')) {
  document.documentElement.classList.add('obs-overlay-page');
  document.body.classList.add('obs-overlay-page');
}
if (routePath.startsWith('/dock/player')) {
  document.documentElement.classList.add('obs-dock-page');
  document.body.classList.add('obs-dock-page');
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary><App /></AppErrorBoundary>,
);
