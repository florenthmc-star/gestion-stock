/* Tests de la logique reprise de l'ancien script (code.gs V8).
   Lancer avec : npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ligneHisto, ajouterHisto, nouvelleFiche, champsModifies, ajusterQuantite,
  preter, retourPret, modifierDateRetour, ficheArchive, traceArchive, articlesAArchiver, COLS,
} from '../app/src/metier/actions.js';

const QUAND = new Date('2026-10-29T13:05:00Z');   // 14:05 à Paris (heure d'hiver)

test('ligne d\'historique au même format que l\'ancien script', () => {
  assert.equal(ligneHisto('Amandine', 'Réception', 'Type: Stock', QUAND), '[29/10/2026 14:05] Amandine - Réception · Type: Stock');
  assert.equal(ligneHisto('', '', '', QUAND), '[29/10/2026 14:05] ? - Action');
  assert.equal(ajouterHisto('', 'a'), 'a');
  assert.equal(ajouterHisto('a', 'b'), 'a\nb');
});

test('une nouvelle fiche a toutes les colonnes du Sheet', () => {
  const f = nouvelleFiche({ ID: 'ART-1', Magasin: 'Aix', QuantiteStock: 3 });
  assert.deepEqual(Object.keys(f), COLS);
  assert.equal(f.QuantiteStock, 3);
  assert.equal(f.Client, '');
});

test('une modification ne touche jamais l\'historique ni l\'ID', () => {
  const c = champsModifies({ ID: 'X', Historique: 'pirate', Statut: 'Sorti', Inconnu: 1 });
  assert.deepEqual(c, { Statut: 'Sorti' });
});

test('sortie de stock : décompte, statut Sorti à zéro, historique', () => {
  const fiche = { QuantiteStock: 2, QuantiteInitiale: 5, Statut: 'Stock', Historique: 'h' };
  const r = ajusterQuantite(fiche, { delta: -2, user: 'Flo', raison: 'Chantier', setSortiIfZero: '1' }, QUAND);
  assert.equal(r.newQty, 0);
  assert.equal(r.champs.QuantiteStock, 0);
  assert.equal(r.champs.Statut, 'Sorti');
  assert.equal(r.champs.Historique, 'h\n[29/10/2026 14:05] Flo - Sortie stock · -2 unité(s) · Nouveau total: 0 · Chantier');
});

test('sortie sans setSortiIfZero : le statut ne bouge pas (vente)', () => {
  const r = ajusterQuantite({ QuantiteStock: 1, Statut: 'Stock' }, { delta: -1, user: 'Flo' }, QUAND);
  assert.equal(r.champs.Statut, undefined);
});

test('on ne sort jamais plus que le stock', () => {
  assert.deepEqual(ajusterQuantite({ QuantiteStock: 1 }, { delta: -2 }), { error: 'Stock insuffisant — disponible : 1' });
  assert.deepEqual(ajusterQuantite({ QuantiteStock: 1 }, { delta: 0 }), { error: 'Quantité invalide' });
  assert.deepEqual(ajusterQuantite({ QuantiteStock: 1 }, { delta: 'abc' }), { error: 'Quantité invalide' });
});

test('ajout de stock : relève la quantité initiale et remet en stock', () => {
  const r = ajusterQuantite({ QuantiteStock: 0, QuantiteInitiale: 1, Statut: 'Sorti' }, { delta: 3, user: 'Flo', raison: 'Réappro' }, QUAND);
  assert.equal(r.champs.QuantiteStock, 3);
  assert.equal(r.champs.QuantiteInitiale, 3);
  assert.equal(r.champs.Statut, 'Stock');
  assert.match(r.champs.Historique, /Ajout stock · \+3 unité\(s\) · Nouveau total: 3 · Réappro$/);
});

test('quantités venues du Sheet en texte', () => {
  const r = ajusterQuantite({ QuantiteStock: '4', QuantiteInitiale: '4' }, { delta: '-1' }, QUAND);
  assert.equal(r.newQty, 3);
});

test('prêt : une ligne par unité, décompte du disponible', () => {
  const fiche = { QuantiteStock: 3, Prets: '[]', Historique: '' };
  const r = preter(fiche, { qte: 2, emprunteur: 'DRUAUX', dateRetourPrevue: '2026-11-05T11:00:00.000Z', user: 'Seb' }, QUAND, () => 0.5);
  assert.equal(r.restant, 1);
  assert.equal(r.champs.QuantiteStock, 1);
  const prets = JSON.parse(r.champs.Prets);
  assert.equal(prets.length, 2);
  assert.deepEqual(prets[0], {
    pretId: 'PRET-' + QUAND.getTime() + '-0-500', emprunteur: 'DRUAUX', datePret: QUAND.toISOString(),
    dateRetourPrevue: '2026-11-05T11:00:00.000Z', pretePar: 'Seb', statut: 'En cours',
  });
  assert.equal(r.champs.Historique, '[29/10/2026 14:05] Seb - Prêt · 2 unité(s) à DRUAUX — Retour: 05/11/2026 — Reste dispo: 1');
});

test('prêt refusé : trop d\'unités ou emprunteur manquant', () => {
  assert.deepEqual(preter({ QuantiteStock: 1 }, { qte: 2, emprunteur: 'X' }), { error: 'Seulement 1 unité(s) disponible(s)' });
  assert.deepEqual(preter({ QuantiteStock: 1 }, { qte: 1 }), { error: 'Emprunteur manquant' });
});

test('retour de prêt : une unité revient, le prêt est clos une seule fois', () => {
  const prets = [{ pretId: 'P1', emprunteur: 'DRUAUX', statut: 'En cours' }];
  const fiche = { QuantiteStock: 0, Prets: JSON.stringify(prets), Historique: '' };
  const r = retourPret(fiche, { pretId: 'P1', user: 'Seb' }, QUAND);
  assert.equal(r.champs.QuantiteStock, 1);
  const apres = JSON.parse(r.champs.Prets)[0];
  assert.equal(apres.statut, 'Retourné');
  assert.equal(apres.retournePar, 'Seb');
  assert.equal(r.champs.Historique, '[29/10/2026 14:05] Seb - Retour de prêt · Retourné par DRUAUX');
  const deuxieme = retourPret({ ...fiche, Prets: r.champs.Prets }, { pretId: 'P1' });
  assert.deepEqual(deuxieme, { error: 'Ce prêt a déjà été retourné' });
  assert.deepEqual(retourPret(fiche, { pretId: 'P9' }), { error: 'Prêt non trouvé' });
});

test('report de la date de retour d\'un prêt', () => {
  const fiche = { Prets: JSON.stringify([{ pretId: 'P1', emprunteur: 'X', dateRetourPrevue: '2026-11-01T11:00:00.000Z' }]) };
  const r = modifierDateRetour(fiche, { pretId: 'P1', dateRetourPrevue: '2026-11-10T11:00:00.000Z', user: 'Flo' }, QUAND);
  assert.equal(JSON.parse(r.champs.Prets)[0].dateRetourPrevue, '2026-11-10T11:00:00.000Z');
  assert.match(r.champs.Historique, /Modification date retour · 01\/11\/2026 → 10\/11\/2026 \(Prêt X\)$/);
});

test('archivage : la fiche complète part dans les archives, une trace reste', () => {
  const fiche = { ID: 'ART-1', Magasin: 'Aix', Article: 'Frigo', Historique: 'h', majLe: 'x' };
  const a = ficheArchive(fiche, { user: 'Flo', raison: 'Doublon' }, QUAND);
  assert.equal(a.Article, 'Frigo');
  assert.equal(a.Historique, 'h\n[29/10/2026 14:05] Flo - Suppression · Doublon');
  assert.equal(a.DateArchivage, QUAND.toISOString());
  assert.equal(a.RaisonArchivage, 'Doublon');
  assert.equal(a.majLe, undefined);
  const sansLigne = ficheArchive(fiche, { user: 'Flo', raison: 'Nettoyage', avecLigne: false }, QUAND);
  assert.equal(sansLigne.Historique, 'h');
  assert.deepEqual(traceArchive(fiche), { ID: 'ART-1', Magasin: 'Aix', supprime: true });
});

test('nettoyage : seuls les articles clos depuis plus de X jours', () => {
  const maintenant = Date.parse('2026-10-29T12:00:00Z');
  const fiches = [
    { ID: 'a', Statut: 'Sorti', DateSortie: '2026-06-01T10:00:00Z' },
    { ID: 'b', Statut: 'Sorti', DateSortie: '2026-10-20T10:00:00Z' },
    { ID: 'c', Statut: 'Stock', DateReception: '2025-01-01T10:00:00Z' },
    { ID: 'd', Statut: 'Récupéré', DateSortie: '', DateReception: '2026-01-01T10:00:00Z' },
    { ID: 'e', Statut: 'Sorti' },
  ];
  assert.deepEqual(articlesAArchiver(fiches, 90, maintenant).map(f => f.ID), ['a', 'd']);
});
