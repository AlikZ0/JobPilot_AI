import React from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup';
import '../sidepanel/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

createRoot(container).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
