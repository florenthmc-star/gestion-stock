/**********************************************************************
 *  Vendeur de la cuisine (demande de Flo, 26/11/2026).
 *
 *  Sur une mise à dispo, on note le vendeur qui a vendu la cuisine
 *  d'où vient l'article. Ce n'est PAS la personne qui réceptionne
 *  l'article (champ Kitchener). Un directeur peut ensuite retrouver
 *  tous les articles d'un vendeur.
 *
 *  Le nom reste un texte libre (un ancien vendeur ou un remplaçant doit
 *  pouvoir être saisi), mais on propose les noms connus pour éviter
 *  « Julien », « julien » et « Julien M. » sur le même vendeur.
 **********************************************************************/

const ROLES_VENDEURS = ['VENDEUR', 'DIRECTEUR'];

/* Même nom écrit avec d'autres majuscules ou espaces = même vendeur */
export function cleVendeur(nom) {
  return String(nom || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/* Équipe publiée pour tous (les fiches utilisateurs, elles, ne sont lisibles que par l'admin) */
export function listeEquipe(users) {
  return users
    .filter(u => u.actif === true && ROLES_VENDEURS.includes(u.role) && String(u.nom || '').trim())
    .map(u => ({ nom: String(u.nom).trim().replace(/\s+/g, ' '), magasin: u.magasin || '' }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.magasin.localeCompare(b.magasin, 'fr'));
}

/**
 * Noms à proposer pour un magasin ('' = tous) : l'équipe de ce magasin
 * et les vendeurs déjà saisis sur ses articles. Un seul exemplaire par nom.
 */
export function vendeursConnus(articles, equipe, magasin = '') {
  const noms = new Map();
  const ajouter = nom => {
    const cle = cleVendeur(nom);
    if (cle && !noms.has(cle)) noms.set(cle, String(nom).trim().replace(/\s+/g, ' '));
  };
  (equipe || []).filter(e => !magasin || e.magasin === magasin || e.magasin === 'ALL').forEach(e => ajouter(e.nom));
  (articles || []).filter(a => !magasin || a.magasin === magasin).forEach(a => ajouter(a.vendeur));
  return [...noms.values()].sort((a, b) => a.localeCompare(b, 'fr'));
}

/* Filtre « vendeur » : insensible aux majuscules et aux espaces en trop */
export function memeVendeur(article, nom) {
  return !nom || cleVendeur(article.vendeur) === cleVendeur(nom);
}
