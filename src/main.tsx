import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App';
import { AuthProvider } from './auth';
import { firebaseConfigured } from './lib/firebase';

function Unconfigured() {
  return (
    <div className="page narrow">
      <h1>Glass Collection</h1>
      <p>Firebase is not configured yet. Copy <code>.env.example</code> to <code>.env.local</code> and fill in the
        <code> VITE_FIREBASE_*</code> values (see README), then restart.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {firebaseConfigured ? (
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    ) : (
      <Unconfigured />
    )}
  </React.StrictMode>,
);
