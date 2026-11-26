/**********************************************************************
 *  Règles des alertes (revues avec Flo le 26/11/2026 : trop de bruit).
 *
 *  - « Stock faible » seulement pour un article rangé en plusieurs
 *    exemplaires, avec un seuil réglé, dont la quantité est descendue
 *    sous ce seuil. Une pièce unique en stock n'est pas un stock faible.
 *  - Un SAV n'est compté qu'une fois (« SAV qui traîne »), pas aussi en
 *    « MAD qui traîne ».
 *  - Un article sorti (« Sorti », « Sorti - Remis TLE », …) ne fait plus
 *    partie des mises à dispo.
 *  - Client prévenu qui ne vient pas : alerte « client à relancer »
 *    après le délai choisi dans les paramètres (7 jours par défaut).
 **********************************************************************/

export const JOUR = 86400000;

/* Tous les statuts de sortie commencent par « Sorti » */
export function estSorti(statut) {
  return String(statut || '').startsWith('Sorti');
}

export function stockFaiblePertinent(article, seuil) {
  const s = Number(seuil) || 0;
  const q = article.quantiteStock;
  if (s <= 0 || q === null || q === undefined) return false;
  return q > 0 && q <= s && (Number(article.quantiteInitiale) || 0) > s;
}

/* « 26/11/2026 14:05 » (date de l'historique, heure de Paris) → Date */
export function dateHistorique(texte) {
  const m = String(texte || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  return isNaN(d) ? null : d;
}

/**
 * Date à laquelle le client a été prévenu (ou relancé) pour la dernière fois.
 * Champ DatePrevenu depuis le 26/11/2026 ; avant, on la lit dans l'historique.
 * lignes : historique déjà découpé, le plus récent en premier.
 */
export function dernierContactClient(article, lignes) {
  if (article.datePrevenu) {
    const d = new Date(article.datePrevenu);
    if (!isNaN(d)) return d;
  }
  const l = (lignes || []).find(x => x.action === 'Client prévenu' || x.action === 'Client relancé');
  return l ? dateHistorique(l.dateStr) : null;
}

export function joursDepuis(date, maintenant = new Date()) {
  return Math.floor((maintenant - new Date(date)) / JOUR);
}

/* Mise à dispo encore en magasin depuis plus de `jours` jours : à vérifier */
export function madAVerifier(article, jours = 90, maintenant = new Date()) {
  return article.type === 'Mise à disposition' && !estSorti(article.statut)
    && !!article.dateReception && joursDepuis(article.dateReception, maintenant) > jours;
}

/* Catégories d'alertes, dans l'ordre d'affichage (la plus urgente en haut) */
export const CATEGORIES_ALERTES = [
  { cle: 'pret',     titre: 'Prêts en retard',                 type: 'danger' },
  { cle: 'recup',    titre: 'Récupérations client en retard',  type: 'danger' },
  { cle: 'relance',  titre: 'Clients à relancer',              type: 'warning' },
  { cle: 'sav',      titre: 'SAV qui traînent',                type: 'danger' },
  { cle: 'reprise',  titre: 'Reprises SAV à réceptionner',     type: 'warning' },
  { cle: 'mad',      titre: 'Mises à dispo qui traînent',      type: 'warning' },
  { cle: 'bientot',  titre: 'Bientôt (prêts, récupérations, TLE)', type: 'warning' },
  { cle: 'epuise',   titre: 'Stock épuisé',                    type: 'danger' },
  { cle: 'faible',   titre: 'Stock faible',                    type: 'warning' },
];

/* Regroupe les alertes par catégorie, dans l'ordre ci-dessus, sans catégorie vide */
export function grouperAlertes(alertes) {
  return CATEGORIES_ALERTES
    .map(c => ({ ...c, alertes: alertes.filter(a => a.cat === c.cle) }))
    .filter(g => g.alertes.length);
}
