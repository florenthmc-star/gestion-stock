/**********************************************************************
 *  Outils de l'admin : reprise des données de l'ancienne appli,
 *  recopie des utilisateurs de l'appli HMC, export des archives.
 **********************************************************************/
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, auth, googleProvider, configHMC, URL_ANCIENNE_APPLI } from './firebase.js';
import { articles, lireConfig, lireArchives } from './donnees.js';
import {
  ficheDepuisLigne, archiveDepuisLigne, objetsDepuisTableau, configDepuisAncienne,
  seuilsDepuisAncienne, controle, ecarts, ficheUtilisateur, separerDoublons, numeroterArchives,
} from './metier/import.js';
import { COLS } from './metier/actions.js';

/* Appel à l'ancien serveur Apps Script (POST, puis JSONP si besoin, comme l'ancienne appli) */
async function appelAncien(p) {
  try {
    const res = await fetch(URL_ANCIENNE_APPLI, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(p), redirect: 'follow',
    });
    return await res.json();
  } catch (e) {
    return new Promise(resolve => {
      const cb = 'cb' + Date.now();
      const s = document.createElement('script');
      window[cb] = data => { delete window[cb]; s.remove(); resolve(data || {}); };
      s.src = `${URL_ANCIENNE_APPLI}?${new URLSearchParams({ ...p, callback: cb })}`;
      s.onerror = () => { delete window[cb]; s.remove(); resolve({ error: 'Ancienne appli injoignable' }); };
      document.body.appendChild(s);
    });
  }
}

/** 1) Lecture de l'ancienne appli, sans rien écrire : renvoie ce qui sera importé */
export async function lireAncienneAppli() {
  if (!URL_ANCIENNE_APPLI) throw new Error('Adresse de l\'ancienne appli non configurée');
  const [a, p] = await Promise.all([appelAncien({ action: 'getArticles', t: Date.now() }), appelAncien({ action: 'getParams' })]);
  if (a.error) throw new Error(a.error);
  if (p.error) throw new Error(p.error);
  const lignes = (a.articles || []).filter(l => l.ID !== null && l.ID !== undefined && String(l.ID).trim());
  const { uniques, doublons } = separerDoublons(lignes.map(ficheDepuisLigne));
  return {
    fiches: uniques,
    doublons,
    lignesSheet: lignes.length,
    config: configDepuisAncienne(p, lireConfig().magasins),
    seuils: seuilsDepuisAncienne(p),
    controle: controle(uniques),
  };
}

/** 2) Écriture dans Firestore (admin). On peut relancer : chaque fiche est remplacée, sans doublon. */
export async function ecrireImport(lu, progression = () => {}) {
  const moiEmail = auth.currentUser.email.toLowerCase();
  const signature = { majLe: serverTimestamp(), majPar: moiEmail };
  const tous = lu.fiches;
  for (let i = 0; i < tous.length; i += 400) {
    const lot = writeBatch(db);
    for (const f of tous.slice(i, i + 400)) {
      const fiche = { ...f };
      if (lu.seuils[f.ID] !== undefined) fiche.SeuilAlerte = parseInt(lu.seuils[f.ID], 10) || 0;
      lot.set(doc(db, 'articles', f.ID), { ...fiche, ...signature });
    }
    await lot.commit();
    progression(Math.min(i + 400, tous.length), tous.length);
  }
  const lot = writeBatch(db);
  lot.set(doc(db, 'config', 'parametres'), lu.config, { merge: true });
  // Lignes en double du Sheet : rangées dans les archives, rien n'est perdu
  const maintenant = new Date().toISOString();
  for (const d of lu.doublons) lot.set(doc(db, 'archives', d.ID), { ...d, DateArchivage: maintenant });
  await lot.commit();
}

/** 3) Contrôle après import : la nouvelle base comparée à l'ancienne appli */
export function verifierImport(lu) {
  const ids = new Set(lu.fiches.map(f => f.ID));
  const nouvelles = articles().filter(f => ids.has(f.ID));
  return { apres: controle(nouvelles), ecarts: ecarts(lu.controle, controle(nouvelles)) };
}

/** Archives de l'ancienne appli : onglet « Archives » du Google Sheet téléchargé en .xlsx */
export async function importerArchivesXlsx(fichier) {
  const classeur = XLSX.read(await fichier.arrayBuffer(), { cellDates: true });
  const feuille = classeur.Sheets.Archives;
  if (!feuille) throw new Error('Onglet « Archives » introuvable dans ce fichier');
  const lignes = objetsDepuisTableau(XLSX.utils.sheet_to_json(feuille, { header: 1, raw: true, defval: null }));
  const archives = numeroterArchives(lignes.map(archiveDepuisLigne));
  for (let i = 0; i < archives.length; i += 400) {
    const lot = writeBatch(db);
    for (const a of archives.slice(i, i + 400)) lot.set(doc(db, 'archives', a.ID), a);
    await lot.commit();
  }
  return { lues: archives.length, distinctes: new Set(archives.map(a => a.IDOrigine || a.ID)).size };
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
