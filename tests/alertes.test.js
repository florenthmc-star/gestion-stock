/* Alertes : moins de bruit (Flo, 26/11/2026) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estSorti, stockFaiblePertinent, dateHistorique, dernierContactClient, madAVerifier, grouperAlertes } from '../app/src/metier/alertes.js';

test('tous les statuts « Sorti… » sont des sorties', () => {
  assert.equal(estSorti('Sorti'), true);
  assert.equal(estSorti('Sorti - Remis TLE'), true);
  assert.equal(estSorti('Sorti - Récupéré client'), true);
  assert.equal(estSorti('Stock'), false);
});

test('stock faible : pas pour une pièce unique ni sans seuil', () => {
  assert.equal(stockFaiblePertinent({ quantiteStock: 1, quantiteInitiale: 1 }, 5), false);
  assert.equal(stockFaiblePertinent({ quantiteStock: 2, quantiteInitiale: 10 }, 0), false);
  assert.equal(stockFaiblePertinent({ quantiteStock: 2, quantiteInitiale: 10 }, 3), true);
  assert.equal(stockFaiblePertinent({ quantiteStock: 0, quantiteInitiale: 10 }, 3), false);   // épuisé : autre alerte
  assert.equal(stockFaiblePertinent({ quantiteStock: 5, quantiteInitiale: 10 }, 3), false);
});

test('date de l\'historique et dernier contact client', () => {
  assert.deepEqual(dateHistorique('20/02/2026 14:05'), new Date(2026, 1, 20, 14, 5));
  assert.equal(dateHistorique('n\'importe quoi'), null);
  const lignes = [
    { dateStr: '10/11/2026 09:00', action: 'Changement d\'emplacement' },
    { dateStr: '05/11/2026 10:30', action: 'Client prévenu' },
  ];
  assert.deepEqual(dernierContactClient({}, lignes), new Date(2026, 10, 5, 10, 30));
  assert.deepEqual(dernierContactClient({ datePrevenu: '2026-11-20T08:00:00.000Z' }, lignes), new Date('2026-11-20T08:00:00.000Z'));
  assert.equal(dernierContactClient({}, []), null);
});

test('mise à dispo à vérifier : plus de 90 jours et pas sortie', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const mad = (statut, recu) => ({ type: 'Mise à disposition', statut, dateReception: recu });
  assert.equal(madAVerifier(mad('Stock', '2026-07-01'), 90, now), true);
  assert.equal(madAVerifier(mad('Stock', '2026-10-01'), 90, now), false);
  assert.equal(madAVerifier(mad('Sorti - Remis TLE', '2026-07-01'), 90, now), false);
});

test('alertes groupées dans l\'ordre, sans catégorie vide', () => {
  const g = grouperAlertes([{ cat: 'faible' }, { cat: 'pret' }, { cat: 'faible' }]);
  assert.deepEqual(g.map(x => [x.cle, x.alertes.length]), [['pret', 1], ['faible', 2]]);
});
