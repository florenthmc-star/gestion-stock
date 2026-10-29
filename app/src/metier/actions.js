/**********************************************************************
 *  Logique des actions, reprise fidèle de l'ancien script Apps Script
 *  (code.gs V8). Chaque fonction reçoit la fiche telle qu'elle est en
 *  base (mêmes noms de colonnes que le Google Sheet) et renvoie les
 *  champs à écrire, ou { error } avec le même message qu'avant.
 *
 *  Fonctions pures : l'écriture dans Firestore (sous transaction, pour
 *  que deux magasins ne s'écrasent pas) est faite par src/donnees.js.
 **********************************************************************/
import { horodatageParis, jourParis } from './outils.js';

// Colonnes d'un article, dans l'ordre du Google Sheet (onglet Articles)
export const COLS = [
  'ID', 'Magasin', 'Type', 'Client', 'NumeroAR', 'Article', 'Reference',
  'NombreColis', 'QuantiteStock', 'QuantiteInitiale', 'Emplacement',
  'Kitchener', 'Notes',
  'Statut', 'DateReception', 'DatePret', 'PrenomEmprunteur',
  'DateRetourPrevue', 'DateRetourReel', 'DateSortie',
  'RaisonSortie', 'ParentId', 'Historique', 'StatutMAD', 'SAVDelaiAlerte', 'PrixVente', 'StatutPastille',
  'StockSubtype', 'MADSubtype', 'RecuperePar', 'Prets', 'DateTLE',
  'DateRecupClient', 'RepriseArticle', 'RepriseRecue',
];

/* « [20/02/2026 14:05] Amandine - Réception · Type: Stock » */
export function ligneHisto(user, action, details, date = new Date()) {
  return '[' + horodatageParis(date) + '] ' + (user || '?') + ' - ' + (action || 'Action') + (details ? ' · ' + details : '');
}

export function ajouterHisto(historique, ligne) {
  const cur = String(historique || '');
  return cur ? cur + '\n' + ligne : ligne;
}

/* Fiche complète à créer : toutes les colonnes, vides si non fournies (comme appendRow) */
export function nouvelleFiche(params) {
  const fiche = {};
  for (const col of COLS) fiche[col] = params[col] !== undefined && params[col] !== null ? params[col] : '';
  return fiche;
}

/* updateArticle : seules les colonnes connues, jamais l'Historique (préservé) */
export function champsModifies(params) {
  const champs = {};
  for (const col of COLS) {
    if (col === 'ID' || col === 'Historique') continue;
    if (params[col] !== undefined) champs[col] = params[col];
  }
  return champs;
}

const entier = v => parseInt(v, 10);

/**
 * Ajustement de quantité par delta (adjustQuantity_).
 * params : delta (+/-), user, raison, setSortiIfZero ('1' optionnel)
 */
export function ajusterQuantite(fiche, params, date = new Date()) {
  const delta = entier(params.delta);
  if (isNaN(delta) || delta === 0) return { error: 'Quantité invalide' };

  const current = entier(fiche.QuantiteStock) || 0;
  const newQty = current + delta;
  if (newQty < 0) return { error: 'Stock insuffisant — disponible : ' + current };

  const champs = { QuantiteStock: newQty };
  if (delta > 0) {
    const qi = entier(fiche.QuantiteInitiale) || 0;
    if (newQty > qi) champs.QuantiteInitiale = newQty;
    if (fiche.Statut === 'Sorti') champs.Statut = 'Stock';
  } else if (newQty === 0 && params.setSortiIfZero === '1') {
    champs.Statut = 'Sorti';
  }

  const label = delta > 0 ? 'Ajout stock' : 'Sortie stock';
  const detail = (delta > 0 ? '+' : '') + delta + ' unité(s) · Nouveau total: ' + newQty + (params.raison ? ' · ' + params.raison : '');
  champs.Historique = ajouterHisto(fiche.Historique, ligneHisto(params.user, label, detail, date));
  return { champs, newQty };
}

export function lirePrets(fiche) {
  try { return fiche.Prets ? JSON.parse(fiche.Prets) : []; } catch (e) { return []; }
}

/**
 * Prêt d'une ou plusieurs unités (preter_).
 * params : qte, emprunteur, dateRetourPrevue (ISO), user
 * hasard() : remplaçable dans les tests (Math.random par défaut)
 */
export function preter(fiche, params, date = new Date(), hasard = Math.random) {
  const qte = entier(params.qte) || 1;
  const dispo = entier(fiche.QuantiteStock) || 0;
  if (qte <= 0) return { error: 'Quantité invalide' };
  if (qte > dispo) return { error: 'Seulement ' + dispo + ' unité(s) disponible(s)' };
  if (!params.emprunteur) return { error: 'Emprunteur manquant' };

  const prets = lirePrets(fiche);
  const now = date.toISOString();
  const pretIds = [];
  for (let i = 0; i < qte; i++) {
    const pretId = 'PRET-' + date.getTime() + '-' + i + '-' + Math.floor(hasard() * 1000);
    pretIds.push(pretId);
    prets.push({
      pretId,
      emprunteur: params.emprunteur,
      datePret: now,
      dateRetourPrevue: params.dateRetourPrevue || '',
      pretePar: params.user || '?',
      statut: 'En cours',
    });
  }

  const dateStr = params.dateRetourPrevue ? jourParis(params.dateRetourPrevue) : '?';
  const champs = {
    Prets: JSON.stringify(prets),
    QuantiteStock: dispo - qte,
    Historique: ajouterHisto(fiche.Historique, ligneHisto(params.user, 'Prêt',
      qte + ' unité(s) à ' + params.emprunteur + ' — Retour: ' + dateStr + ' — Reste dispo: ' + (dispo - qte), date)),
  };
  return { champs, restant: dispo - qte, pretIds };
}

/* Retour d'un prêt (retourPret_). params : pretId, user */
export function retourPret(fiche, params, date = new Date()) {
  const prets = lirePrets(fiche);
  const pret = prets.find(p => p.pretId === params.pretId);
  if (!pret) return { error: 'Prêt non trouvé' };
  if (pret.statut !== 'En cours') return { error: 'Ce prêt a déjà été retourné' };

  pret.statut = 'Retourné';
  pret.dateRetourReel = date.toISOString();
  pret.retournePar = params.user || '?';

  const dispo = entier(fiche.QuantiteStock) || 0;
  const champs = {
    Prets: JSON.stringify(prets),
    QuantiteStock: dispo + 1,
    Historique: ajouterHisto(fiche.Historique, ligneHisto(params.user, 'Retour de prêt', 'Retourné par ' + (pret.emprunteur || '?'), date)),
  };
  return { champs, restant: dispo + 1 };
}

/* Report de la date de retour d'un prêt (modifierDateRetour_). params : pretId, dateRetourPrevue, user */
export function modifierDateRetour(fiche, params, date = new Date()) {
  const prets = lirePrets(fiche);
  const pret = prets.find(p => p.pretId === params.pretId);
  if (!pret) return { error: 'Prêt non trouvé' };

  const ancienne = pret.dateRetourPrevue ? jourParis(pret.dateRetourPrevue) : '?';
  pret.dateRetourPrevue = params.dateRetourPrevue || '';
  const nouvelle = params.dateRetourPrevue ? jourParis(params.dateRetourPrevue) : '?';

  const champs = {
    Prets: JSON.stringify(prets),
    Historique: ajouterHisto(fiche.Historique, ligneHisto(params.user, 'Modification date retour',
      ancienne + ' → ' + nouvelle + ' (Prêt ' + (pret.emprunteur || '?') + ')', date)),
  };
  return { champs };
}

/**
 * Archivage d'un article (deleteArticle_ et archiveArticles_) : la fiche
 * complète part dans « archives », avec la date, la raison et, pour une
 * suppression, une dernière ligne d'historique. Rien n'est perdu.
 */
export function ficheArchive(fiche, { user, raison, avecLigne = true }, date = new Date()) {
  const copie = {};
  for (const col of COLS) copie[col] = fiche[col] !== undefined && fiche[col] !== null ? fiche[col] : '';
  if (avecLigne) copie.Historique = ajouterHisto(copie.Historique, ligneHisto(user || '?', 'Suppression', raison || 'Suppression', date));
  copie.DateArchivage = date.toISOString();
  copie.RaisonArchivage = raison || '';
  copie.SourceSheet = 'Articles';
  return copie;
}

/* Ce qui reste dans « articles » après archivage : une simple trace, pour que
   tous les téléphones retirent l'article de leur liste (voir src/donnees.js). */
export function traceArchive(fiche) {
  return { ID: fiche.ID, Magasin: fiche.Magasin, supprime: true };
}

/* Articles clos depuis plus de « jours » jours (actArchiveOld de l'ancienne appli) */
export const STATUTS_CLOS = ['Sorti', 'Sorti - Remis TLE', 'Sorti - Récupéré client', 'Retourné', 'Récupéré'];
export function articlesAArchiver(fiches, jours, maintenant = Date.now()) {
  const limite = maintenant - jours * 86400000;
  return fiches.filter(a => {
    if (!STATUTS_CLOS.includes(a.Statut)) return false;
    const ref = a.DateSortie || a.DateRetourReel || a.DateReception;
    return !!ref && new Date(ref).getTime() < limite;
  });
}
