/**********************************************************************
 *  Qui a le droit de faire quoi (décidé avec Flo le 29/10/2026).
 *
 *  - Tout le monde voit le stock de tous les magasins.
 *  - On ne modifie que son propre magasin, sauf l'ADV, la direction et
 *    l'admin qui modifient partout.
 *  - Directeurs, technique et planification peuvent aussi archiver un
 *    article de leur magasin ; les vendeurs non.
 *  - Seul l'admin archive en masse et change les paramètres.
 *  - Compta et RH n'ont pas accès à l'appli.
 *
 *  Ces fonctions servent à l'affichage. La vraie protection est dans
 *  firestore.rules, qui applique exactement la même logique.
 **********************************************************************/

export const ROLES_TOUS_MAGASINS = ['ADMIN', 'DIRECTION', 'ADV'];
export const ROLES_MAGASIN_ARCHIVE = ['DIRECTEUR', 'RESP_TECH', 'PLANIFICATEUR'];
export const ROLES_MAGASIN = [...ROLES_MAGASIN_ARCHIVE, 'VENDEUR', 'SAV'];
export const ROLES_SANS_ACCES = ['COMPTA', 'RH', 'NONE'];

export function peutOuvrir(moi) {
  return !!moi && moi.actif === true && !ROLES_SANS_ACCES.includes(moi.role);
}

function surSonMagasin(moi, magasin) {
  return moi.magasin === 'ALL' || moi.magasin === magasin;
}

export function peutModifier(moi, magasin) {
  if (!peutOuvrir(moi)) return false;
  if (ROLES_TOUS_MAGASINS.includes(moi.role)) return true;
  return ROLES_MAGASIN.includes(moi.role) && surSonMagasin(moi, magasin);
}

export function peutArchiver(moi, magasin) {
  if (!peutOuvrir(moi)) return false;
  if (ROLES_TOUS_MAGASINS.includes(moi.role)) return true;
  return ROLES_MAGASIN_ARCHIVE.includes(moi.role) && surSonMagasin(moi, magasin);
}

/* Une ligne de stock épuisée (quantité 0) peut être close par toute personne
   qui peut modifier son magasin : c'est ce que fait une vente complète. */
export function peutClore(moi, ligne) {
  if (peutArchiver(moi, ligne.Magasin)) return true;
  return peutModifier(moi, ligne.Magasin) && Number(ligne.QuantiteStock) === 0 && String(ligne.QuantiteStock) !== '';
}

export function estAdmin(moi) {
  return peutOuvrir(moi) && moi.role === 'ADMIN';
}

/* Magasins dans lesquels la personne peut créer ou modifier un article */
export function magasinsModifiables(moi, magasins) {
  return magasins.filter(m => peutModifier(moi, m));
}

/* Nom du rôle affiché sous le nom de la personne */
const LIBELLES_ROLES = {
  ADMIN: 'Administrateur', DIRECTION: 'Direction', ADV: 'ADV', DIRECTEUR: 'Directeur',
  RESP_TECH: 'Responsable technique', PLANIFICATEUR: 'Planification', VENDEUR: 'Vendeur',
  SAV: 'SAV', LECTURE: 'Consultation',
};
export function libelleRole(role) {
  return LIBELLES_ROLES[role] || String(role || '');
}

/* Alertes et pastilles : chacun ne voit que celles de son magasin.
   ADV, direction, admin et les comptes « tous magasins » voient tout ('' = tous). */
export function magasinDesAlertes(moi) {
  if (!moi || ROLES_TOUS_MAGASINS.includes(moi.role) || moi.magasin === 'ALL') return '';
  return moi.magasin || '';
}
