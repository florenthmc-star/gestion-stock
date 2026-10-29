/**********************************************************************
 *  Outils de l'admin : liste des administrateurs, recopie des
 *  utilisateurs de l'appli HMC, export des archives.
 **********************************************************************/
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, writeBatch, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, googleProvider, configHMC } from './firebase.js';
import { lireConfig, lireArchives } from './donnees.js';
import { ficheUtilisateur } from './metier/import.js';
import { COLS } from './metier/actions.js';

/** Noms des administrateurs actifs (les seuls à voir les paramètres) */
export async function listerAdmins() {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'ADMIN')));
  return snap.docs.map(s => s.data()).filter(u => u.actif === true).map(u => u.nom || u.email).sort();
}

/** Téléchargement des archives en Excel */
export async function telechargerArchives() {
  const archives = await lireArchives();
  const titres = [...COLS, 'DateArchivage', 'RaisonArchivage', 'IDOrigine'];
  const feuille = XLSX.utils.aoa_to_sheet([titres, ...archives.map(a => titres.map(t => a[t] ?? ''))]);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Archives');
  XLSX.writeFile(classeur, `HMC Stock - archives ${new Date().toISOString().slice(0, 10)}.xlsx`);
  return archives.length;
}

/**
 * Recopie des utilisateurs de l'appli HMC (lecture seule là-bas).
 * L'admin se connecte une seconde fois, au projet de l'appli HMC, avec le même compte Google.
 * Les personnes qui ne sont plus dans l'appli HMC sont désactivées ici.
 */
export async function recopierUtilisateurs(moi) {
  if (!configHMC.apiKey) throw new Error('Configuration de l\'appli HMC manquante');
  const appHMC = getApps().find(a => a.name === 'hmc') || initializeApp(configHMC, 'hmc');
  const authHMC = getAuth(appHMC);
  await signInWithPopup(authHMC, googleProvider);
  try {
    const dbHMC = getFirestore(appHMC, configHMC.baseId);
    const [hmc, ici] = await Promise.all([getDocs(collection(dbHMC, 'users')), getDocs(collection(db, 'users'))]);
    const magasins = lireConfig().magasins;
    const lot = writeBatch(db);
    const vus = new Set();
    let actifs = 0;
    hmc.forEach(s => {
      const f = ficheUtilisateur(s.id, s.data(), magasins);
      // Jamais se retirer soi-même ses droits d'admin
      if (f.email === moi.email) { f.role = 'ADMIN'; f.actif = true; }
      vus.add(f.email);
      if (f.actif) actifs++;
      lot.set(doc(db, 'users', f.email), f);
    });
    let desactives = 0;
    ici.forEach(s => {
      if (!vus.has(s.id) && s.id !== moi.email && s.data().actif) { lot.update(s.ref, { actif: false }); desactives++; }
    });
    await lot.commit();
    return { total: hmc.size, actifs, desactives };
  } finally {
    await signOut(authHMC);
  }
}
