/* Vendeur de la cuisine : noms proposés et recherche */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listeEquipe, vendeursConnus, memeVendeur } from '../app/src/metier/vendeurs.js';

test('équipe publiée : vendeurs et directeurs actifs avec un nom', () => {
  const equipe = listeEquipe([
    { nom: 'Julien  Martin', role: 'VENDEUR', magasin: 'Aix', actif: true },
    { nom: 'Sophie', role: 'DIRECTEUR', magasin: 'Aix', actif: true },
    { nom: 'Ancien', role: 'VENDEUR', magasin: 'Aix', actif: false },
    { nom: 'Compta', role: 'COMPTA', magasin: 'ALL', actif: true },
    { nom: '', role: 'VENDEUR', magasin: 'Lattes', actif: true },
  ]);
  assert.deepEqual(equipe, [{ nom: 'Julien Martin', magasin: 'Aix' }, { nom: 'Sophie', magasin: 'Aix' }]);
});

test('noms proposés : équipe du magasin + vendeurs déjà saisis, sans doublon', () => {
  const equipe = [{ nom: 'Julien Martin', magasin: 'Aix' }, { nom: 'Paul', magasin: 'Lattes' }];
  const articles = [
    { magasin: 'Aix', vendeur: 'julien martin' },
    { magasin: 'Aix', vendeur: 'Remplaçant' },
    { magasin: 'Lattes', vendeur: 'Marie' },
    { magasin: 'Aix', vendeur: '' },
  ];
  assert.deepEqual(vendeursConnus(articles, equipe, 'Aix'), ['Julien Martin', 'Remplaçant']);
  assert.deepEqual(vendeursConnus(articles, equipe, ''), ['Julien Martin', 'Marie', 'Paul', 'Remplaçant']);
});

test('filtre vendeur : majuscules et espaces ne comptent pas', () => {
  assert.equal(memeVendeur({ vendeur: ' Julien  MARTIN ' }, 'julien martin'), true);
  assert.equal(memeVendeur({ vendeur: 'Paul' }, 'julien martin'), false);
  assert.equal(memeVendeur({ vendeur: 'Paul' }, ''), true);
});
