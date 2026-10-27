// =====================================================================
//  Les badges de la Caverne, en rangée : l'image du badge, son prix, combien le joueur en garde,
//  « Acheter » (Boutique) et « Activer » (Boutique et porte de la Caverne). lib/caverne/badges.js
//  props : etat (caverne_badges_etat), surEtat(nouvel état), achat (montre « Acheter »), solde (or),
//          surAchat() : après un achat (la Boutique recharge son solde)
//  Styles : styles/badges-caverne.css
// =====================================================================
import { useState } from 'react';
import { urlPublique } from '../lib/chemins.js';
import { useNotifier } from '../lib/notification.js';
import { acheterBadge, activerBadge, tempsRestant } from '../lib/caverne/badges.js';

const nombre = (n) => Number(n).toLocaleString('fr-FR');

export default function BadgesCaverne({ etat, surEtat, achat = false, solde = 0, surAchat = null }) {
  const notifier = useNotifier();
  const [occupe, setOccupe] = useState(null);

  const agir = async (cle, fn, message) => {
    setOccupe(cle);
    try {
      const r = await fn();
      surEtat(r);
      notifier(message(r));
      if (cle.startsWith('a:')) surAchat?.();
    } catch (e) {
      notifier(e.message || 'Impossible pour le moment.', 'erreur');
    }
    setOccupe(null);
  };

  return (
    <div className="badges-caverne">
      {etat.badges.map((x) => (
        <article key={x.id} className={`badge-caverne${x.nombre > 0 ? ' a-des-badges' : ''}`}>
          <img className="badge-caverne__image" src={urlPublique(x.image)} alt={`Badge ${x.nom}`} loading="lazy" />
          {x.nombre > 0 && <span className="badge-caverne__nombre" title="Badges que tu gardes">×{x.nombre}</span>}
          <div className="badge-caverne__bas">
            {achat && x.prix != null && (
              <button type="button" className="badge-caverne__btn" disabled={!!occupe || solde < x.prix}
                title={solde < x.prix ? 'Pas assez de pièces' : undefined}
                onClick={() => agir(`a:${x.id}`, () => acheterBadge(x.id), (r) => `Badge ${r.achete} acheté pour ${nombre(r.prix)} pièces. Active-le quand tu veux.`)}>
                {occupe === `a:${x.id}` ? 'Achat…' : <>Acheter · {nombre(x.prix)} <img src={urlPublique('img/Equipement/Or-icone.webp')} alt="pièces" /></>}
              </button>
            )}
            {x.nombre > 0 && (
              <button type="button" className="badge-caverne__btn badge-caverne__btn--activer" disabled={!!occupe}
                onClick={() => agir(`v:${x.id}`, () => activerBadge(x.id), (r) => `Badge ${r.active} activé : la Caverne t'est ouverte encore ${tempsRestant(r.jusqu_a)}.`)}>
                {occupe === `v:${x.id}` ? 'Activation…' : 'Activer'}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
