/* Droits par rôle (affichage). Les mêmes cas sont vérifiés sur les vraies
   règles de sécurité dans tests/regles/regles.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { peutOuvrir, peutModifier, peutArchiver, peutClore, estAdmin, magasinsModifiables, libelleRole, magasinDesAlertes } from '../app/src/metier/droits.js';

const u = (role, magasin = 'Lattes', actif = true) => ({ role, magasin, actif });
const MAGS = ['Lattes', 'Vedène', 'Aix'];

test('compta, RH et comptes inactifs n\'ouvrent pas l\'appli', () => {
  assert.equal(peutOuvrir(u('COMPTA', 'ALL')), false);
  assert.equal(peutOuvrir(u('RH', 'ALL')), false);
  assert.equal(peutOuvrir(u('VENDEUR', 'Lattes', false)), false);
  assert.equal(peutOuvrir(null), false);
  assert.equal(peutOuvrir(u('LECTURE')), true);
});

test('un vendeur de Lattes modifie Lattes, pas Vedène, et n\'archive pas', () => {
  const v = u('VENDEUR');
  assert.equal(peutModifier(v, 'Lattes'), true);
  assert.equal(peutModifier(v, 'Vedène'), false);
  assert.equal(peutArchiver(v, 'Lattes'), false);
  assert.deepEqual(magasinsModifiables(v, MAGS), ['Lattes']);
});

test('un directeur modifie et archive seulement son magasin', () => {
  const d = u('DIRECTEUR', 'Vedène');
  assert.equal(peutModifier(d, 'Vedène'), true);
  assert.equal(peutArchiver(d, 'Vedène'), true);
  assert.equal(peutModifier(d, 'Lattes'), false);
});

test('technique et planification : comme un directeur, partout si « ALL »', () => {
  assert.equal(peutArchiver(u('RESP_TECH', 'Aix'), 'Aix'), true);
  assert.equal(peutModifier(u('PLANIFICATEUR', 'Aix'), 'Lattes'), false);
  assert.equal(peutModifier(u('PLANIFICATEUR', 'ALL'), 'Lattes'), true);
});

test('ADV, direction et admin modifient tous les magasins', () => {
  for (const r of ['ADV', 'DIRECTION', 'ADMIN']) {
    assert.equal(peutModifier(u(r, 'Aix'), 'Lattes'), true, r);
    assert.equal(peutArchiver(u(r, 'Aix'), 'Lattes'), true, r);
  }
  assert.equal(estAdmin(u('ADMIN', 'ALL')), true);
  assert.equal(estAdmin(u('DIRECTION', 'ALL')), false);
});

test('lecture seule : voit tout, ne modifie rien', () => {
  assert.equal(peutModifier(u('LECTURE', 'ALL'), 'Lattes'), false);
});

test('un vendeur peut clore une ligne épuisée (vente complète), pas une ligne pleine', () => {
  const v = u('VENDEUR');
  assert.equal(peutClore(v, { Magasin: 'Lattes', QuantiteStock: 0 }), true);
  assert.equal(peutClore(v, { Magasin: 'Lattes', QuantiteStock: 2 }), false);
  assert.equal(peutClore(v, { Magasin: 'Lattes', QuantiteStock: '' }), false);
  assert.equal(peutClore(v, { Magasin: 'Aix', QuantiteStock: 0 }), false);
});

test('nom du rôle affiché sous le nom de la personne', () => {
  assert.equal(libelleRole('ADMIN'), 'Administrateur');
  assert.equal(libelleRole('RESP_TECH'), 'Responsable technique');
  assert.equal(libelleRole('INCONNU'), 'INCONNU');
  assert.equal(libelleRole(undefined), '');
});

test('alertes : vendeurs et directeurs ne voient que leur magasin', () => {
  assert.equal(magasinDesAlertes(u('VENDEUR', 'Lattes')), 'Lattes');
  assert.equal(magasinDesAlertes(u('DIRECTEUR', 'Vedène')), 'Vedène');
  assert.equal(magasinDesAlertes(u('DIRECTEUR', 'ALL')), '');
  assert.equal(magasinDesAlertes(u('ADV', 'Lattes')), '');
  assert.equal(magasinDesAlertes(u('ADMIN', 'ALL')), '');
});
