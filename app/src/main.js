/**********************************************************************
 *  HMC Stock — point d'entrée.
 *  Connexion Google → fiche users/{email} → écrans de l'appli.
 **********************************************************************/
import { onAuthStateChanged, signInWithPopup, signInWithCredential, signOut, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, connectFirestoreEmulator } from 'firebase/firestore';
import { auth, db, googleProvider, configOk } from './firebase.js';
import { peutOuvrir } from './metier/droits.js';
import { demarrer, appel, articles } from './donnees.js';
import { demarrerEcrans, surDonnees } from './ecrans.js';
import { surveillerVersion } from './version.js';

// Essais en local sur les émulateurs Firebase (VITE_EMULATEURS=1), sans toucher aux vraies données
if (configOk && import.meta.env.DEV && import.meta.env.VITE_EMULATEURS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  // Connexion d'essai sans fenêtre Google (émulateur seulement)
  window.__connexionEssai = email => signInWithCredential(auth,
    GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
  window.__essai = { appel, articles };
}

const ecran = document.getElementById('ecranConnexion');
const message = document.getElementById('connexionMessage');
const actions = document.getElementById('connexionActions');
let demarre = false;

function afficherEcran(texte, ...boutons) {
  message.textContent = texte;
  actions.replaceChildren(...boutons);
  ecran.classList.remove('cache');
}

function bouton(libelle, classe, action) {
  const b = document.createElement('button');
  b.className = 'btn ' + classe;
  b.type = 'button';
  b.textContent = libelle;
  b.addEventListener('click', action);
  return b;
}

const boutonConnexion = () => bouton('Se connecter avec Google', 'btn-primary', async () => {
  try { await signInWithPopup(auth, googleProvider); }
  catch (e) { if (e.code !== 'auth/popup-closed-by-user') alert('Connexion impossible : ' + e.message); }
});
const boutonDeconnexion = () => bouton('Changer de compte', 'btn-outline', () => signOut(auth));

window.seDeconnecter = async () => {
  if (!confirm('Se déconnecter de HMC Stock ?')) return;
  await signOut(auth);
  location.reload();   // repart d'une page propre, sans les données de la personne précédente
};

if (!configOk) {
  afficherEcran('Configuration Firebase manquante (fichier .env).');
} else {
  surveillerVersion();
  onAuthStateChanged(auth, async user => {
    if (!user) {
      if (demarre) { location.reload(); return; }
      afficherEcran('Connectez-vous avec le même compte Google que pour l\'appli HMC.', boutonConnexion());
      return;
    }
    const email = user.email.toLowerCase();
    let fiche = null;
    try {
      const s = await getDoc(doc(db, 'users', email));
      if (s.exists()) fiche = { email, ...s.data() };
    } catch (e) {
      // Hors ligne : on essaie quand même la fiche gardée sur le téléphone
      try { fiche = JSON.parse(localStorage.getItem('hmc_moi') || 'null'); } catch (e2) { fiche = null; }
      if (fiche && fiche.email !== email) fiche = null;
    }
    if (!fiche) {
      afficherEcran(`Le compte ${email} n'a pas accès à HMC Stock. Demandez à Flo de vous ajouter dans l'appli HMC.`, boutonDeconnexion());
      return;
    }
    if (!peutOuvrir(fiche)) {
      afficherEcran(`Le compte ${email} n'a pas accès à HMC Stock (compte inactif ou rôle sans accès).`, boutonDeconnexion());
      return;
    }
    localStorage.setItem('hmc_moi', JSON.stringify(fiche));
    if (demarre) return;
    demarre = true;
    ecran.classList.add('cache');
    demarrerEcrans(fiche);
    await demarrer(fiche, surDonnees);
  });
}
