/* Tests des règles d'accès, sur l'émulateur Firestore.
   Lancer avec : npm run test:regles   (Java requis) */
import { test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';

let env;
const USERS = {
  'admin@hmc.fr':     { role: 'ADMIN', magasin: 'ALL', actif: true },
  'dg@hmc.fr':        { role: 'DIRECTION', magasin: 'ALL', actif: true },
  'adv@hmc.fr':       { role: 'ADV', magasin: 'Aix', actif: true },
  'dir.lattes@hmc.fr': { role: 'DIRECTEUR', magasin: 'Lattes', actif: true },
  'v.lattes@hmc.fr':  { role: 'VENDEUR', magasin: 'Lattes', actif: true },
  'tech@hmc.fr':      { role: 'RESP_TECH', magasin: 'ALL', actif: true },
  'compta@hmc.fr':    { role: 'COMPTA', magasin: 'ALL', actif: true },
  'ancien@hmc.fr':    { role: 'VENDEUR', magasin: 'Lattes', actif: false },
  'lecture@hmc.fr':   { role: 'LECTURE', magasin: 'ALL', actif: true },
};
const qui = email => env.authenticatedContext(email, { email, email_verified: true }).firestore();
const signe = (email, data) => ({ ...data, majLe: serverTimestamp(), majPar: email });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-stock',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [email, u] of Object.entries(USERS)) await setDoc(doc(db, 'users', email), u);
    await setDoc(doc(db, 'config', 'parametres'), { params: {}, magasins: ['Lattes', 'Vedène'] });
    await setDoc(doc(db, 'articles', 'L1'), { ID: 'L1', Magasin: 'Lattes', QuantiteStock: 3, Statut: 'Stock' });
    await setDoc(doc(db, 'articles', 'L0'), { ID: 'L0', Magasin: 'Lattes', QuantiteStock: 0, Statut: 'Stock' });
    await setDoc(doc(db, 'articles', 'V1'), { ID: 'V1', Magasin: 'Vedène', QuantiteStock: 2, Statut: 'Stock' });
    await setDoc(doc(db, 'archives', 'A1'), { ID: 'A1', Magasin: 'Lattes' });
  });
});

test('tout le monde lit tout le stock, sauf compta, comptes inactifs et inconnus', async () => {
  await assertSucceeds(getDocs(collection(qui('v.lattes@hmc.fr'), 'articles')));
  await assertSucceeds(getDoc(doc(qui('lecture@hmc.fr'), 'articles', 'V1')));
  await assertFails(getDoc(doc(qui('compta@hmc.fr'), 'articles', 'L1')));
  await assertFails(getDoc(doc(qui('ancien@hmc.fr'), 'articles', 'L1')));
  await assertFails(getDoc(doc(qui('inconnu@hmc.fr'), 'articles', 'L1')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'articles', 'L1')));
});

test('un vendeur de Lattes modifie Lattes, pas Vedène', async () => {
  const e = 'v.lattes@hmc.fr', db = qui(e);
  await assertSucceeds(updateDoc(doc(db, 'articles', 'L1'), signe(e, { QuantiteStock: 2 })));
  await assertFails(updateDoc(doc(db, 'articles', 'V1'), signe(e, { QuantiteStock: 1 })));
  await assertSucceeds(setDoc(doc(db, 'articles', 'L2'), signe(e, { ID: 'L2', Magasin: 'Lattes' })));
  await assertFails(setDoc(doc(db, 'articles', 'V2'), signe(e, { ID: 'V2', Magasin: 'Vedène' })));
  // déplacer un article vers un autre magasin = modifier ce magasin : refusé
  await assertFails(updateDoc(doc(db, 'articles', 'L1'), signe(e, { Magasin: 'Vedène' })));
});

test('chaque écriture doit être datée par le serveur et signée', async () => {
  const e = 'v.lattes@hmc.fr', db = qui(e);
  await assertFails(updateDoc(doc(db, 'articles', 'L1'), { QuantiteStock: 2 }));
  await assertFails(updateDoc(doc(db, 'articles', 'L1'), { QuantiteStock: 2, majLe: serverTimestamp(), majPar: 'autre@hmc.fr' }));
  await assertFails(setDoc(doc(db, 'articles', 'L3'), signe(e, { ID: 'AUTRE', Magasin: 'Lattes' })));
});

test('un directeur ne modifie que son magasin ; ADV et direction partout', async () => {
  await assertSucceeds(updateDoc(doc(qui('dir.lattes@hmc.fr'), 'articles', 'L1'), signe('dir.lattes@hmc.fr', { Notes: 'x' })));
  await assertFails(updateDoc(doc(qui('dir.lattes@hmc.fr'), 'articles', 'V1'), signe('dir.lattes@hmc.fr', { Notes: 'x' })));
  await assertSucceeds(updateDoc(doc(qui('adv@hmc.fr'), 'articles', 'L1'), signe('adv@hmc.fr', { Notes: 'x' })));
  await assertSucceeds(updateDoc(doc(qui('dg@hmc.fr'), 'articles', 'V1'), signe('dg@hmc.fr', { Notes: 'x' })));
  await assertSucceeds(updateDoc(doc(qui('tech@hmc.fr'), 'articles', 'V1'), signe('tech@hmc.fr', { Notes: 'x' })));
  await assertFails(updateDoc(doc(qui('lecture@hmc.fr'), 'articles', 'V1'), signe('lecture@hmc.fr', { Notes: 'x' })));
});

test('archiver : directeur de son magasin oui, vendeur seulement une ligne épuisée', async () => {
  const trace = (e, id, mag) => setDoc(doc(qui(e), 'articles', id), signe(e, { ID: id, Magasin: mag, supprime: true }));
  const copie = (e, id, mag, q) => setDoc(doc(qui(e), 'archives', id), { ID: id, Magasin: mag, QuantiteStock: q });
  await assertFails(trace('v.lattes@hmc.fr', 'L1', 'Lattes'));
  await assertFails(copie('v.lattes@hmc.fr', 'L1', 'Lattes', 3));
  await assertSucceeds(trace('v.lattes@hmc.fr', 'L0', 'Lattes'));
  await assertSucceeds(copie('v.lattes@hmc.fr', 'L0', 'Lattes', 0));
  await assertSucceeds(trace('dir.lattes@hmc.fr', 'L1', 'Lattes'));
  await assertFails(trace('dir.lattes@hmc.fr', 'V1', 'Vedène'));
});

test('un article archivé ne revient pas, sauf par l\'admin', async () => {
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'articles', 'L9'), { ID: 'L9', Magasin: 'Lattes', supprime: true }));
  await assertFails(setDoc(doc(qui('dir.lattes@hmc.fr'), 'articles', 'L9'), signe('dir.lattes@hmc.fr', { ID: 'L9', Magasin: 'Lattes' })));
  await assertSucceeds(setDoc(doc(qui('admin@hmc.fr'), 'articles', 'L9'), signe('admin@hmc.fr', { ID: 'L9', Magasin: 'Lattes' })));
});

test('personne ne supprime vraiment un article', async () => {
  await assertFails(deleteDoc(doc(qui('admin@hmc.fr'), 'articles', 'L1')));
});

test('archives, paramètres et utilisateurs : réservés à l\'admin', async () => {
  await assertSucceeds(getDoc(doc(qui('admin@hmc.fr'), 'archives', 'A1')));
  await assertFails(getDoc(doc(qui('dg@hmc.fr'), 'archives', 'A1')));
  await assertSucceeds(getDoc(doc(qui('v.lattes@hmc.fr'), 'config', 'parametres')));
  await assertFails(setDoc(doc(qui('dg@hmc.fr'), 'config', 'parametres'), { params: {} }));
  await assertSucceeds(setDoc(doc(qui('admin@hmc.fr'), 'config', 'parametres'), { params: {} }));
  await assertSucceeds(getDoc(doc(qui('v.lattes@hmc.fr'), 'users', 'v.lattes@hmc.fr')));
  await assertFails(getDoc(doc(qui('v.lattes@hmc.fr'), 'users', 'admin@hmc.fr')));
  await assertFails(setDoc(doc(qui('v.lattes@hmc.fr'), 'users', 'v.lattes@hmc.fr'), { role: 'ADMIN', magasin: 'ALL', actif: true }));
  await assertSucceeds(setDoc(doc(qui('admin@hmc.fr'), 'users', 'nouveau@hmc.fr'), { role: 'VENDEUR', magasin: 'Lattes', actif: true }));
});
