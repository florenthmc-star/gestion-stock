/**********************************************************************
 *  Listes déroulantes « maison », comme dans l'appli HMC.
 *
 *  Sur ordinateur, la liste ouverte d'un <select> est dessinée par
 *  Windows / macOS : elle reste carrée quoi qu'on fasse. On garde donc
 *  le <select> (caché) pour sa valeur et son onchange, et on affiche à
 *  sa place un bouton arrondi qui ouvre une liste arrondie.
 *
 *  Sur téléphone, on laisse la liste du téléphone (plus pratique au doigt).
 **********************************************************************/

const boutons = new WeakMap();   // <select> → bouton affiché à sa place
let ouverte = null;              // { sel, pop } : la liste actuellement ouverte

export function activerListesDeroulantes() {
  if (!window.matchMedia('(pointer: fine)').matches) return;

  // Une valeur changée par le code (sel.value = …) met aussi le bouton à jour
  for (const prop of ['value', 'selectedIndex']) {
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    Object.defineProperty(HTMLSelectElement.prototype, prop, {
      ...d,
      set(v) { d.set.call(this, v); majBouton(this); },
    });
  }

  document.querySelectorAll('select').forEach(habiller);

  // Listes ajoutées plus tard (fiche article, filtres remplis…) et options changées
  new MutationObserver(changements => {
    for (const c of changements) {
      if (c.type === 'attributes') { if (c.target.tagName === 'SELECT') majBouton(c.target); continue; }
      const el = c.target.nodeType === 1 ? c.target : c.target.parentElement;
      const sel = el ? el.closest('select') : null;
      if (sel) { majBouton(sel); continue; }
      c.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'SELECT') habiller(n);
        else n.querySelectorAll('select').forEach(habiller);
      });
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'disabled'] });

  document.addEventListener('change', e => { if (e.target.tagName === 'SELECT') majBouton(e.target); }, true);
  // Un formulaire remis à zéro remet ses listes sans prévenir
  document.addEventListener('reset', () => setTimeout(() => document.querySelectorAll('select').forEach(majBouton)), true);
  // Champ obligatoire vide : on montre le bouton plutôt que la liste cachée
  document.addEventListener('invalid', e => {
    const b = e.target.tagName === 'SELECT' && boutons.get(e.target);
    if (b) { b.classList.add('liste-erreur'); b.focus(); }
  }, true);

  document.addEventListener('mousedown', e => {
    if (ouverte && !ouverte.pop.contains(e.target) && e.target !== boutons.get(ouverte.sel)) fermer();
  });
  window.addEventListener('resize', () => fermer());
  // La page bouge (défilement) : la liste suit son bouton, et se ferme s'il sort de l'écran
  document.addEventListener('scroll', e => { if (ouverte && !ouverte.pop.contains(e.target)) placer(); }, true);
}

function habiller(sel) {
  if (boutons.has(sel) || sel.multiple) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'liste-bouton';
  if (sel.getAttribute('style')) b.setAttribute('style', sel.getAttribute('style'));
  b.addEventListener('click', () => (ouverte && ouverte.sel === sel ? fermer() : ouvrir(sel)));
  b.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); ouvrir(sel); }
  });
  sel.classList.add('liste-native');
  sel.tabIndex = -1;
  sel.after(b);
  boutons.set(sel, b);
  majBouton(sel);
}

function majBouton(sel) {
  const b = boutons.get(sel);
  if (!b) return;
  const opt = sel.options[sel.selectedIndex];
  b.textContent = opt ? opt.textContent : '';
  b.disabled = sel.disabled;
  // Même visibilité que la liste d'origine (certaines sont cachées selon le formulaire)
  b.style.display = sel.style.display === 'none' ? 'none' : '';
  if (sel.value) b.classList.remove('liste-erreur');
}

function ouvrir(sel) {
  fermer();
  const b = boutons.get(sel);
  const pop = document.createElement('div');
  pop.className = 'liste-pop';
  pop.setAttribute('role', 'listbox');
  [...sel.options].forEach((o, i) => {
    if (o.hidden) return;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'liste-option' + (i === sel.selectedIndex ? ' choisie' : '');
    item.textContent = o.textContent;
    item.disabled = o.disabled;
    item.addEventListener('click', () => choisir(sel, i));
    item.addEventListener('keydown', e => naviguer(e, sel, i));
    pop.append(item);
  });
  document.body.append(pop);
  ouverte = { sel, pop };
  b.classList.add('ouverte');
  placer();
  (pop.querySelector('.choisie') || pop.querySelector('.liste-option'))?.focus();
}

/* Sous le bouton, ou au-dessus s'il n'y a pas la place */
function placer() {
  if (!ouverte) return;
  const { sel, pop } = ouverte;
  const r = boutons.get(sel).getBoundingClientRect();
  if (!sel.isConnected || r.bottom < 0 || r.top > window.innerHeight) { fermer(); return; }
  pop.style.minWidth = Math.max(r.width, 180) + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = pop.style.bottom = '';
  const enBas = window.innerHeight - r.bottom;
  if (enBas < Math.min(pop.offsetHeight, 300) + 12 && r.top > enBas) pop.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  else pop.style.top = (r.bottom + 6) + 'px';
}

function naviguer(e, sel, i) {
  const items = [...ouverte.pop.querySelectorAll('.liste-option:not(:disabled)')];
  const pos = items.indexOf(e.target);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(pos + 1, items.length - 1)]?.focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(pos - 1, 0)]?.focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); fermer(true); }
  else if (e.key === 'Tab') fermer();
}

function choisir(sel, i) {
  fermer(true);
  if (sel.selectedIndex === i) return;
  sel.selectedIndex = i;
  sel.dispatchEvent(new Event('change', { bubbles: true }));   // déclenche le onchange d'origine
}

function fermer(rendreFocus = false) {
  if (!ouverte) return;
  const b = boutons.get(ouverte.sel);
  ouverte.pop.remove();
  b.classList.remove('ouverte');
  ouverte = null;
  if (rendreFocus) b.focus();
}
