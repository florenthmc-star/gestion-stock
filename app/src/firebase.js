/* Connexion au projet Firebase de HMC Stock. Les identifiants viennent du
   fichier .env (voir .env.example) : ce ne sont pas des secrets, la sécurité
   est assurée par firestore.rules et par la connexion Google. */
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const config = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

export const configOk = !!(config.apiKey && config.projectId);
export const app = configOk ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;

// Cache sur le téléphone : l'appli s'affiche tout de suite à la réouverture,
// puis ne télécharge que ce qui a changé (voir src/donnees.js).
export const db = app ? initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
}, import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)') : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Projet de l'appli HMC : lu une fois par l'admin pour recopier les utilisateurs
// (lecture seule, rien n'est jamais écrit là-bas).
export const configHMC = {
  apiKey:     import.meta.env.VITE_HMC_API_KEY,
  authDomain: import.meta.env.VITE_HMC_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_HMC_PROJECT_ID,
  appId:      import.meta.env.VITE_HMC_APP_ID,
  baseId:     import.meta.env.VITE_HMC_DATABASE_ID || '(default)',
};
