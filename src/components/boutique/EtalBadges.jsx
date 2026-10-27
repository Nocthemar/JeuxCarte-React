// =====================================================================
//  Échoppe I, sous les boosters : les badges de la Caverne aux Trésors (acheter, activer)
//  props : moi, solde, version (change après chaque achat : on recharge), rafraichir()
// =====================================================================
import { useEffect, useState } from 'react';
import BadgesCaverne from '../BadgesCaverne.jsx';
import { lireBadges, tempsRestant } from '../../lib/caverne/badges.js';

export default function EtalBadges({ moi, solde, version, rafraichir }) {
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    if (!moi) return undefined;
    let actif = true;
    // sans les badges en base (caverne.sql pas encore lancé), l'étal ne s'affiche pas
    lireBadges().then((e) => { if (actif) setEtat(e); }).catch(() => {});
    return () => { actif = false; };
  }, [moi, version]);

  if (!etat?.badges?.length) return null;
  const ouverte = etat.jusqu_a && new Date(etat.jusqu_a) > new Date();
  return (
    <section className="etal-badges" aria-labelledby="etal-badges-titre">
      <header className="etal-badges__entete">
        <h3 id="etal-badges-titre">Badges de la Caverne aux Trésors</h3>
        <p>
          La Caverne est scellée : un badge te l&apos;ouvre pour le temps écrit dessus. Garde-le et active-le
          quand tu veux ; activé pendant que la Caverne t&apos;est ouverte, son temps s&apos;ajoute au tien.
          {ouverte && <> Elle t&apos;est ouverte encore <strong>{tempsRestant(etat.jusqu_a)}</strong>.</>}
        </p>
      </header>
      <BadgesCaverne etat={etat} surEtat={setEtat} achat solde={solde} surAchat={rafraichir} />
    </section>
  );
}
