/**********************************************************************
 *  Nouvelle version en ligne : comme dans l'appli HMC, un onglet resté
 *  ouvert regarde régulièrement /version.json (écrit à chaque
 *  publication) et propose de recharger quand il a changé.
 **********************************************************************/
const TOUTES_LES_5_MIN = 5 * 60 * 1000;

export function surveillerVersion() {
  let affiche = false;
  async function verifier() {
    if (affiche) return;
    try {
      const r = await fetch('/version.json', { cache: 'no-store' });
      const { v } = await r.json();   // en développement, pas de fichier : on ne fait rien
      if (v && v !== __VERSION__) afficher();
    } catch (e) { /* hors ligne ou pas de fichier : on réessaiera */ }
  }
  function afficher() {
    affiche = true;
    const bandeau = document.createElement('div');
    bandeau.setAttribute('role', 'status');
    bandeau.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:800;background:#111827;color:#fff;padding:10px 14px;border-radius:12px;display:flex;gap:12px;align-items:center;font-size:13px;font-weight:600;box-shadow:0 12px 32px rgba(0,0,0,.2);';
    const texte = document.createElement('span');
    texte.textContent = 'Une nouvelle version de l\'appli est disponible.';
    const b = document.createElement('button');
    b.className = 'btn btn-primary';
    b.textContent = 'Recharger';
    b.addEventListener('click', () => location.reload());
    bandeau.append(texte, b);
    document.body.append(bandeau);
  }
  setInterval(verifier, TOUTES_LES_5_MIN);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); });
}
