/* Reprise des données de l'ancienne appli et recopie des utilisateurs HMC */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ficheDepuisLigne, archiveDepuisLigne, objetsDepuisTableau, configDepuisAncienne,
  seuilsDepuisAncienne, controle, ecarts, ficheUtilisateur, MAGASINS_DEPART, separerDoublons,
  numeroterArchives,
} from '../app/src/metier/import.js';
import { COLS } from '../app/src/metier/actions.js';

test('une ligne de l\'ancienne appli garde toutes ses colonnes, sans null', () => {
  const f = ficheDepuisLigne({ ID: ' ART-1 ', Magasin: 'Nîmes', QuantiteStock: 0, Notes: null, DateSortie: new Date('2026-05-18T08:09:30.429Z'), Prets: '[]' });
  assert.deepEqual(Object.keys(f), COLS);
  assert.equal(f.ID, 'ART-1');
  assert.equal(f.QuantiteStock, 0);
  assert.equal(f.Notes, '');
  assert.equal(f.DateSortie, '2026-05-18T08:09:30.429Z');
  assert.equal(f.Prets, '[]');
});

test('archives : la raison d\'une suppression était rangée dans SourceSheet', () => {
  const a = archiveDepuisLigne({ ID: 'ART-2', DateArchivage: new Date('2026-07-07T10:00:00Z'), SourceSheet: 'Doublon' });
  assert.equal(a.RaisonArchivage, 'Doublon');
  assert.equal(a.SourceSheet, 'Articles');
  assert.equal(a.DateArchivage, '2026-07-07T10:00:00.000Z');
  assert.equal(archiveDepuisLigne({ ID: 'ART-3', SourceSheet: 'Articles' }).RaisonArchivage, 'Archivage');
});

test('tableau Excel → objets, lignes vides ignorées', () => {
  const o = objetsDepuisTableau([['ID', 'Magasin', ''], ['ART-1', 'Aix', 'x'], ['', 'Aix'], [null]]);
  assert.deepEqual(o, [{ ID: 'ART-1', Magasin: 'Aix' }]);
});

test('paramètres : les réglages d\'email sont retirés, le reste est gardé', () => {
  const c = configDepuisAncienne({ params: '{"alerteBientot":3,"emailsActifs":true,"emailLattes":"a@b"}', seuilsMAD: '{}', seuilsSAV: 'pas du json' });
  assert.deepEqual(c, { params: { alerteBientot: 3 }, seuilsMAD: {}, seuilsSAV: {}, magasins: MAGASINS_DEPART });
  assert.deepEqual(seuilsDepuisAncienne({ seuils: '{"ART-1":5}' }), { 'ART-1': 5 });
  assert.deepEqual(seuilsDepuisAncienne({}), {});
});

test('contrôle chiffré et écarts', () => {
  const fiches = [
    { Magasin: 'Aix', Statut: 'Stock', QuantiteStock: 2, Prets: JSON.stringify([{ statut: 'En cours' }, { statut: 'Retourné' }]) },
    { Magasin: 'Aix', Statut: 'Sorti', QuantiteStock: '', Prets: '' },
  ];
  const c = controle(fiches);
  assert.deepEqual(c, { total: 2, parMagasin: { Aix: 2 }, parStatut: { Stock: 1, Sorti: 1 }, pretsEnCours: 1, quantite: 2 });
  assert.deepEqual(ecarts(c, c), []);
  const autre = controle([fiches[0]]);
  assert.deepEqual(ecarts(c, autre), ['Nombre d\'articles : 2 → 1', 'Magasin Aix : 2 → 1', 'Statut Sorti : 1 → 0']);
});

test('utilisateurs HMC : magasin réécrit comme dans l\'appli stock', () => {
  assert.deepEqual(ficheUtilisateur('Flo@Gmail.com', { role: 'ADMIN', magasin: 'ALL', nom: 'Flo', actif: true }, MAGASINS_DEPART),
    { email: 'flo@gmail.com', nom: 'Flo', role: 'ADMIN', roleRaw: '', magasin: 'ALL', actif: true });
  assert.equal(ficheUtilisateur('a@b', { role: 'VENDEUR', magasin: 'Vedene', actif: true }, MAGASINS_DEPART).magasin, 'Vedène');
  assert.equal(ficheUtilisateur('a@b', { role: 'VENDEUR', magasin: 'Nimes', actif: true }, MAGASINS_DEPART).magasin, 'Nîmes');
  assert.equal(ficheUtilisateur('a@b', { role: 'VENDEUR', magasin: 'Valencia', actif: true }, MAGASINS_DEPART).magasin, 'Valencia');
  assert.equal(ficheUtilisateur('a@b', { role: 'VENDEUR', magasin: 'Aix' }, MAGASINS_DEPART).actif, false);
});

test('doublons du Sheet : la première ligne (celle que l\'ancienne appli modifiait) est gardée', () => {
  const r = separerDoublons([
    { ID: 'A', Statut: 'Sorti' }, { ID: 'B', Statut: 'Stock' }, { ID: 'A', Statut: 'Stock' }, { ID: 'A', Statut: 'Stock' },
  ]);
  assert.deepEqual(r.uniques.map(f => f.ID + ':' + f.Statut), ['A:Sorti', 'B:Stock']);
  assert.deepEqual(r.doublons.map(f => f.ID), ['A-doublon-1', 'A-doublon-2']);
  assert.equal(r.doublons[0].IDOrigine, 'A');
  assert.match(r.doublons[0].RaisonArchivage, /Doublon/);
});

test('archives : plusieurs lignes au même ID sont toutes gardées, sans écrasement', () => {
  const a = numeroterArchives([
    { ID: 'A', Article: 'Soda' }, { ID: 'B' }, { ID: 'A', Article: 'Soda' }, { ID: 'A' },
  ]);
  assert.deepEqual(a.map(x => x.ID), ['A', 'B', 'A-archive-2', 'A-archive-3']);
  assert.equal(new Set(a.map(x => x.ID)).size, 4);
  assert.equal(a[2].IDOrigine, 'A');
  assert.equal(a[0].IDOrigine, undefined);
  // Même fichier importé deux fois → mêmes identifiants (pas de doublon en base)
  assert.deepEqual(numeroterArchives([{ ID: 'A' }, { ID: 'A' }]).map(x => x.ID), ['A', 'A-archive-2']);
});
