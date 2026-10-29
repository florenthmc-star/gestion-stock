/**********************************************************************
 *  Reprise des données de l'ancienne appli et recopie des utilisateurs
 *  de l'appli HMC. Fonctions pures, testées dans tests/import.test.js.
 **********************************************************************/
import { COLS } from './actions.js';
import { cleMagasin } from './outils.js';

export const MAGASINS_DEPART = ['Lattes', 'Vedène', 'Aix', 'Nîmes', 'Vitrolles'];

/* Une valeur du Sheet → valeur à ranger dans Firestore : texte, nombre ou '' (jamais null) */
function valeur(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString();
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return String(v);
}

/* Une ligne de l'onglet Articles (objet { ID, Magasin, … }) → fiche Firestore */
export function ficheDepuisLigne(ligne) {
  const fiche = {};
  for (const col of COLS) fiche[col] = valeur(ligne[col]);
  fiche.ID = String(fiche.ID).trim();
  return fiche;
}

/**
 * Lignes en double dans le Sheet (même identifiant, souvent un double clic
 * avant l'anti-doublon de la V8). L'ancienne appli ne mettait à jour que la
 * PREMIÈRE ligne trouvée : c'est elle qu'on garde. Les copies partent dans
 * les archives sous un identifiant à part, pour ne rien perdre.
 */
export function separerDoublons(fiches) {
  const vus = new Map(), uniques = [], doublons = [];
  for (const f of fiches) {
    const n = vus.get(f.ID) || 0;
    vus.set(f.ID, n + 1);
    if (n === 0) uniques.push(f);
    else doublons.push({ ...f, ID: `${f.ID}-doublon-${n}`, IDOrigine: f.ID, RaisonArchivage: 'Doublon dans l\'ancien Google Sheet (même identifiant)', SourceSheet: 'Articles' });
  }
  return { uniques, doublons };
}

/* Une ligne de l'onglet Archives : les colonnes d'un article + DateArchivage + SourceSheet.
   Dans l'ancien script, une suppression rangeait la raison dans la colonne SourceSheet. */
export function archiveDepuisLigne(ligne) {
  const fiche = ficheDepuisLigne(ligne);
  fiche.DateArchivage = valeur(ligne.DateArchivage);
  const source = String(valeur(ligne.SourceSheet));
  fiche.SourceSheet = 'Articles';
  fiche.RaisonArchivage = source && source !== 'Articles' ? source : 'Archivage';
  return fiche;
}

/* L'onglet Archives contient parfois plusieurs lignes pour le même ID (article archivé deux fois,
   à quelques secondes d'écart). Chaque ligne est gardée : la 1re garde son ID, les suivantes
   deviennent ID-archive-2, ID-archive-3… (ID d'origine dans IDOrigine). Même résultat à chaque
   import du même fichier, donc relancer l'import ne crée pas de doublon. */
export function numeroterArchives(archives) {
  const vus = new Map();
  return archives.map(a => {
    const n = (vus.get(a.ID) || 0) + 1;
    vus.set(a.ID, n);
    return n === 1 ? a : { ...a, ID: `${a.ID}-archive-${n}`, IDOrigine: a.ID };
  });
}

/* Tableau de lignes ([[titres], [valeurs]…]) → objets { titre: valeur } (lignes sans ID ignorées) */
export function objetsDepuisTableau(lignes) {
  if (!lignes || !lignes.length) return [];
  const titres = lignes[0].map(t => String(t || '').trim());
  const out = [];
  for (let i = 1; i < lignes.length; i++) {
    const o = {};
    titres.forEach((t, j) => { if (t) o[t] = lignes[i][j]; });
    if (o.ID !== undefined && o.ID !== null && String(o.ID).trim()) out.push(o);
  }
  return out;
}

/* Paramètres de l'ancienne appli (textes JSON) → document config/parametres */
export function configDepuisAncienne(donnees, magasins = MAGASINS_DEPART) {
  const lire = t => { try { return t ? JSON.parse(t) : {}; } catch (e) { return {}; } };
  const params = lire(donnees.params);
  // Les emails automatiques sont retirés pour l'instant (Flo, 29/10/2026)
  for (const k of Object.keys(params)) if (k.startsWith('email')) delete params[k];
  return {
    params,
    seuilsMAD: lire(donnees.seuilsMAD),
    seuilsSAV: lire(donnees.seuilsSAV),
    magasins,
  };
}

/* Seuils par article de l'ancienne appli → { ID: nombre } */
export function seuilsDepuisAncienne(donnees) {
  try { return donnees.seuils ? JSON.parse(donnees.seuils) : {}; } catch (e) { return {}; }
}

/**
 * Contrôle chiffré : de quoi comparer l'ancienne et la nouvelle appli
 * avant la bascule (articles par magasin et par statut, prêts en cours,
 * quantités en stock).
 */
export function controle(fiches) {
  const parMagasin = {}, parStatut = {};
  let pretsEnCours = 0, quantite = 0;
  for (const f of fiches) {
    parMagasin[f.Magasin || '?'] = (parMagasin[f.Magasin || '?'] || 0) + 1;
    parStatut[f.Statut || '?'] = (parStatut[f.Statut || '?'] || 0) + 1;
    quantite += parseInt(f.QuantiteStock, 10) || 0;
    try {
      const prets = f.Prets ? JSON.parse(f.Prets) : [];
      pretsEnCours += prets.filter(p => p.statut === 'En cours').length;
    } catch (e) { /* prêts illisibles : comptés à 0, comme l'ancienne appli */ }
  }
  return { total: fiches.length, parMagasin, parStatut, pretsEnCours, quantite };
}

/* Deux contrôles identiques ? → liste des écarts lisibles (vide = tout est bon) */
export function ecarts(avant, apres) {
  const out = [];
  if (avant.total !== apres.total) out.push(`Nombre d'articles : ${avant.total} → ${apres.total}`);
  if (avant.pretsEnCours !== apres.pretsEnCours) out.push(`Prêts en cours : ${avant.pretsEnCours} → ${apres.pretsEnCours}`);
  if (avant.quantite !== apres.quantite) out.push(`Quantité en stock : ${avant.quantite} → ${apres.quantite}`);
  for (const [nom, cle] of [['Magasin', 'parMagasin'], ['Statut', 'parStatut']]) {
    const tous = new Set([...Object.keys(avant[cle]), ...Object.keys(apres[cle])]);
    for (const k of tous) if ((avant[cle][k] || 0) !== (apres[cle][k] || 0)) out.push(`${nom} ${k} : ${avant[cle][k] || 0} → ${apres[cle][k] || 0}`);
  }
  return out;
}

/**
 * Fiche d'un utilisateur de l'appli HMC → fiche de l'appli stock.
 * Le nom du magasin est réécrit comme dans l'appli stock (« Vedene » → « Vedène »)
 * pour que les règles de sécurité puissent le comparer à celui des articles.
 */
export function ficheUtilisateur(email, u, magasins) {
  const brut = String(u.magasin || '').trim();
  let magasin = brut.toUpperCase() === 'ALL' ? 'ALL' : brut;
  if (magasin !== 'ALL') magasin = magasins.find(m => cleMagasin(m) === cleMagasin(brut)) || brut;
  return {
    email: String(email).toLowerCase(),
    nom: u.nom || '',
    role: u.role || 'NONE',
    roleRaw: u.roleRaw || '',
    magasin,
    actif: u.actif === true,
  };
}
