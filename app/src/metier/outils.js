/**********************************************************************
 *  Petits outils partagés (sans Firebase, testés dans tests/).
 **********************************************************************/

/* « Vedène », « vedene », « VEDENE » → « vedene » : sert à comparer des noms
   de magasins écrits différemment (l'appli HMC écrit « Vedene » sans accent). */
export function cleMagasin(nom) {
  return String(nom || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/* Date et heure de Paris, au format de l'historique : « 20/02/2026 14:05 » */
export function horodatageParis(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).map(x => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/* Jour de Paris « 20/02/2026 » d'une date ISO (comme Utilities.formatDate de l'ancien script) */
export function jourParis(iso) {
  if (!iso) return '?';
  const d = new Date(iso);
  if (isNaN(d)) return '?';
  return horodatageParis(d).slice(0, 10);
}
