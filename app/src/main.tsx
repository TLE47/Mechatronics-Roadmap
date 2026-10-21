import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted, so the UI does not depend on a CDN or on the machine having Inter installed; the
// `@font-face` rules arrive with these imports and src/index.css names the two families. Weight-axis
// variable woff2 with `font-display: swap`, one file per subset, and Latin is the only one a
// Latin-script visit downloads (48 KB sans, 40 KB mono).
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
