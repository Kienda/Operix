import React from 'react';
import { createRoot } from 'react-dom/client';
import './pilot.css';
import PilotApp from './PilotApp.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PilotApp />
  </React.StrictMode>,
);
