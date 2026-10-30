/**********************************************************************
 *  Lecture et écriture des données dans Firestore.
 *
 *  Remplace l'ancien serveur Apps Script : appel({ action, … }) accepte
 *  exactement les mêmes demandes et renvoie les mêmes réponses, pour que
 *  les écrans de l'ancienne appli fonctionnent sans changement.
 *
 *  Pour rester gratuit (quota de 50 000 lectures par jour) :
 *  - les articles sont gardés dans le cache du téléphone ;
 *  - chaque écriture porte sa date (majLe) ; à l'ouverture, l'appli ne
 *    demande au serveur que les articles modifiés depuis la plus récente
 *    date connue, puis reçoit les changements en direct ;
 *  - un article archivé n'est pas effacé mais remplacé par une petite
 *    trace (supprime: true), pour que tous les téléphones le retirent.
 **********************************************************************/
import {
  collection, doc, getDocs, getDocsFromCache, onSnapshot, query, where, orderBy,
  runTransaction, setDoc, updateDoc, writeBatch, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase.js';
import {
  nouvelleFiche, champsModifies, ajouterHisto, ligneHisto, ajusterQuantite, preter,
  retourPret, modifierDateRetour, ficheArchive, traceArchive,
} from './metier/actions.js';
import { MAGASINS_DEPART } from './metier/import.js';

const fiches = new Map();         // ID → fiche telle qu'en base (y compris les traces d'archivage)
let config = { params: {}, seuilsMAD: {}, seuilsSAV: {}, magasins: MAGASINS_DEPART };
let moi = null;
let surChangement = () => {};
let etat = { pret: false, horsLigne: false };

export function articles() {
  return [...fiches.values()].filter(f => !f.supprime);
}
export function lireConfig() { return config; }
export function etatConnexion() { return etat; }

function millis(t) {
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}

/**
 * Démarre la synchronisation. surChangementFn est appelé à chaque fois que
 * des articles ou les paramètres changent (ici ou dans un autre magasin).
 */
export async function demarrer(utilisateur, surChangementFn) {
  moi = utilisateur;
  surChangement = surChangementFn;
  const col = collection(db, 'articles');

  // 1) Ce que le téléphone a déjà : affichage immédiat, aucune lecture facturée
  let depuis = 0;
  try {
    const cache = await getDocsFromCache(col);
    cache.forEach(s => {
      const f = s.data({ serverTimestamps: 'estimate' });
      fiches.set(s.id, f);
      depuis = Math.max(depuis, millis(f.majLe));
    });
  } catch (e) { /* pas de cache (première ouverture) : tout sera chargé */ }
  if (fiches.size) surChangement();

  // 2) Seulement ce qui a changé depuis, puis les changements en direct
  onSnapshot(query(col, where('majLe', '>', Timestamp.fromMillis(depuis)), orderBy('majLe')), { includeMetadataChanges: true }, snap => {
    for (const ch of snap.docChanges()) {
      // « removed » : une écriture locale pas encore datée par le serveur sort
      // un instant de la requête ; la fiche reste connue, rien à faire.
      if (ch.type === 'removed') continue;
      fiches.set(ch.doc.id, ch.doc.data({ serverTimestamps: 'estimate' }));
    }
    etat = { pret: etat.pret || !snap.metadata.fromCache, horsLigne: snap.metadata.fromCache };
    surChangement();
  }, err => {
    console.error(err);
    etat = { ...etat, horsLigne: true };
    surChangement();
  });

  onSnapshot(doc(db, 'config', 'parametres'), s => {
    if (s.exists()) config = { ...config, ...s.data() };
    if (!config.magasins || !config.magasins.length) config.magasins = MAGASINS_DEPART;
    surChangement();
  }, err => console.error(err));
}

/* Date et auteur de chaque écriture (exigés par les règles de sécurité) */
function signature() {
  return { majLe: serverTimestamp(), majPar: moi.email };
}

/* Mise à jour locale immédiate après une écriture confirmée */
function appliquer(id, champs, remplacer = false) {
  const avant = remplacer ? {} : (fiches.get(id) || {});
  fiches.set(id, { ...avant, ...champs, majLe: Timestamp.now() });
}

function messageErreur(e) {
  if (e && e.message && !e.code) return e.message;
  if (e && e.code === 'permission-denied') return 'Action non autorisée : vous ne pouvez modifier que les articles de votre magasin';
  if (e && (e.code === 'unavailable' || e.code === 'deadline-exceeded')) return 'Réseau indisponible, réessayez dans un instant';
  return 'Erreur : ' + (e && (e.code || e.message) || e);
}

class ErreurMetier extends Error {}

/* Lit la fiche dans une transaction : si quelqu'un l'a changée entre-temps,
   Firestore recommence tout seul avec la version à jour (comme l'ancien verrou). */
async function avecFiche(id, calcul) {
  try {
    return await runTransaction(db, async tx => {
      const ref = doc(db, 'articles', String(id));
      const s = await tx.get(ref);
      if (!s.exists() || s.data().supprime) throw new ErreurMetier('Article non trouvé');
      const fiche = s.data();
      const r = calcul(fiche);
      if (r.error) throw new ErreurMetier(r.error);
      tx.update(ref, { ...r.champs, ...signature() });
      return { r, fiche };
    }).then(({ r, fiche }) => {
      appliquer(id, { ...fiche, ...r.champs });
      surChangement();
      const { champs, ...reponse } = r;
      return { success: true, ...reponse };
    });
  } catch (e) {
    return { error: messageErreur(e) };
  }
}

/* ─── Les actions de l'ancien serveur ─────────────────────────────── */

async function addArticle(p) {
  if (!p.ID) return { error: 'ID manquant' };
  const ref = doc(db, 'articles', String(p.ID));
  const fiche = nouvelleFiche(p);
  if (p.SeuilAlerte !== undefined) fiche.SeuilAlerte = p.SeuilAlerte;
  try {
    await runTransaction(db, async tx => {
      const s = await tx.get(ref);
      // Anti-doublon (double clic, double scan)
      if (s.exists() && !s.data().supprime) throw new ErreurMetier('Article déjà existant (ID en double)');
      tx.set(ref, { ...fiche, ...signature() });
    });
  } catch (e) {
    return { error: messageErreur(e) };
  }
  appliquer(p.ID, fiche, true);
  surChangement();
  return { success: true };
}

async function updateArticle(p) {
  const champs = champsModifies(p);
  try {
    await updateDoc(doc(db, 'articles', String(p.ID)), { ...champs, ...signature() });
  } catch (e) {
    return { error: e.code === 'not-found' ? 'Article non trouvé' : messageErreur(e) };
  }
  appliquer(p.ID, champs);
  surChangement();
  return { success: true };
}

function appendHisto(p) {
  return avecFiche(p.ID, f => ({ champs: { Historique: ajouterHisto(f.Historique, ligneHisto(p.user, p.actionLabel || 'Action', p.details || '')) } }));
}

async function deleteArticle(p) {
  const ref = doc(db, 'articles', String(p.ID));
  try {
    const fiche = await runTransaction(db, async tx => {
      const s = await tx.get(ref);
      if (!s.exists() || s.data().supprime) throw new ErreurMetier('Article non trouvé');
      const f = s.data();
      tx.set(doc(db, 'archives', String(p.ID)), ficheArchive(f, { user: p.user || '?', raison: p.raison || 'Suppression' }));
      tx.set(ref, { ...traceArchive(f), ...signature() });
      return f;
    });
    appliquer(p.ID, traceArchive(fiche), true);
    surChangement();
    return { success: true, archived: true };
  } catch (e) {
    return { error: messageErreur(e) };
  }
}

/* Nettoyage en masse (admin) : les articles choisis partent dans les archives */
async function archiveArticles(p) {
  let ids;
  try { ids = JSON.parse(p.ids || '[]'); } catch (e) { ids = []; }
  if (!Array.isArray(ids) || !ids.length) return { error: 'Aucun ID à archiver' };
  const choisis = ids.map(id => fiches.get(id)).filter(f => f && !f.supprime);
  try {
    // 200 articles par envoi (2 écritures chacun, la limite est 500)
    for (let i = 0; i < choisis.length; i += 200) {
      const lot = writeBatch(db);
      for (const f of choisis.slice(i, i + 200)) {
        lot.set(doc(db, 'archives', f.ID), ficheArchive(f, { user: moi.nom || moi.email, raison: 'Nettoyage', avecLigne: false }));
        lot.set(doc(db, 'articles', f.ID), { ...traceArchive(f), ...signature() });
      }
      await lot.commit();
      for (const f of choisis.slice(i, i + 200)) appliquer(f.ID, traceArchive(f), true);
    }
  } catch (e) {
    return { error: messageErreur(e) };
  }
  surChangement();
  return { success: true, archived: choisis.length, deleted: choisis.length };
}

async function saveParams(p) {
  let params;
  try { params = JSON.parse(p.params || '{}'); } catch (e) { return { error: 'Paramètres illisibles' }; }
  try {
    await setDoc(doc(db, 'config', 'parametres'), { params }, { merge: true });
  } catch (e) {
    return { error: messageErreur(e) };
  }
  config = { ...config, params };
  return { success: true };
}

/* Seuil d'alerte d'un article : rangé dans la fiche elle-même (avant : une liste globale) */
async function setSeuil(p) {
  const valeur = parseInt(p.seuil, 10) || 0;
  try {
    await updateDoc(doc(db, 'articles', String(p.ID)), { SeuilAlerte: valeur, ...signature() });
  } catch (e) {
    return { error: messageErreur(e) };
  }
  appliquer(p.ID, { SeuilAlerte: valeur });
  surChangement();
  return { success: true };
}

async function saveMagasins(p) {
  const magasins = (p.magasins || []).map(m => String(m).trim()).filter(Boolean);
  if (!magasins.length) return { error: 'Il faut au moins un magasin' };
  try {
    await setDoc(doc(db, 'config', 'parametres'), { magasins }, { merge: true });
  } catch (e) {
    return { error: messageErreur(e) };
  }
  config = { ...config, magasins };
  surChangement();
  return { success: true };
}

/* Point d'entrée unique, comme handleAction_ dans l'ancien script */
export async function appel(p) {
  switch (p.action) {
    case 'addArticle':         return addArticle(p);
    case 'updateArticle':      return updateArticle(p);
    case 'deleteArticle':      return deleteArticle(p);
    case 'adjustQuantity':     return avecFiche(p.ID, f => ajusterQuantite(f, p));
    case 'preter':             return avecFiche(p.ID, f => preter(f, p));
    case 'retourPret':         return avecFiche(p.ID, f => retourPret(f, p));
    case 'modifierDateRetour': return avecFiche(p.ID, f => modifierDateRetour(f, p));
    case 'appendHisto':        return appendHisto(p);
    case 'archiveArticles':    return archiveArticles(p);
    case 'saveParams':         return saveParams(p);
    case 'setSeuil':           return setSeuil(p);
    case 'saveMagasins':       return saveMagasins(p);
    default:                   return { error: 'Action inconnue: ' + p.action };
  }
}

/* Archives complètes (admin), lues seulement à la demande */
/* magasin = '' : toutes les archives (admin, direction, ADV) ;
   sinon seulement ce magasin (un directeur : les règles n'acceptent que ce filtre) */
export async function lireArchives(magasin = '') {
  const ref = collection(db, 'archives');
  const snap = await getDocs(magasin ? query(ref, where('Magasin', '==', magasin)) : ref);
  return snap.docs.map(s => s.data());
}
