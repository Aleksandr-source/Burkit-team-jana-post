import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import HRApp from './hr/App';
import './index.css';
import './hr/styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode><HRApp /></StrictMode>);
