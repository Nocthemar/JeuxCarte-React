// =====================================================================
//  Échoppe I : les boosters de cartes (ancien JS/boutique-boosters.js, même HTML)
//  Achat : acheter_booster (or du jeu) ; ouverture : ouvrir_booster (tirage côté serveur), puis
//  l'animation de lib/booster.js. Les boosters gagnés dans le Pass de saison s'ouvrent ici aussi.
//  L'offrande : un booster gratuit de 3 cartes toutes les 10 minutes (booster_gratuit_etat,
//  ouvrir_booster_gratuit) ; le serveur donne le temps restant, la page compte à rebours.
//
//  props : moi, solde, version (change après chaque achat : on recharge), rafraichir()
// =====================================================================
import { useEffect, useState } from 'react';
import { Piece, BoutonAchat } from './Article.jsx';
import { supabase } from '../../lib/supabase.js';
import { useNotifier } from '../../lib/notification.js';
import { ouvrirBoosterAnime, COULEURS_RARETE } from '../../lib/booster.js';
import { urlPublique } from '../../lib/chemins.js';

const NOMS_RARETE = { commune: 'Commune', eveillee: 'Éveillée', mythique: 'Mythique', legendaire: 'Légendaire', transcendante: 'Transcendante' };
const DELAI_GRATUIT = 600;   // secondes, comme dans le SQL
const OFFRANDE = { nom: 'Offrande du Voyageur', nb_cartes: 3, image: 'img/Booster/Booster.webp' };
const minSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const pluriel = (n) => (n > 1 ? 's' : '');

async function charger(moi) {
  const [{ data: liste }, { data: lignes }, possedes, gratuit] = await Promise.all([
    supabase.from('boosters').select('*').eq('en_vente', true).order('prix'),
    supabase.from('booster_cartes').select('booster_id, card:cards(*)'),
    moi ? supabase.from('player_boosters').select('booster_id, quantite').eq('discord_id', moi.discord_id) : { data: [] },
    moi ? supabase.rpc('booster_gratuit_etat') : null,
  ]);
  const cartes = new Map();
  for (const l of lignes ?? []) {
    if (!cartes.has(l.booster_id)) cartes.set(l.booster_id, []);
    if (l.card) cartes.get(l.booster_id).push(l.card);
  }
  return {
    liste: liste ?? [],
    cartes,
    possedes: new Map((possedes.data ?? []).map((l) => [l.booster_id, l.quantite])),
    // l'offrande : prête à Date.now() + secondes (indisponible si la fonction n'existe pas)
    gratuit: gratuit?.error ? null : { pret: Date.now() + (gratuit?.data?.secondes ?? 0) * 1000 },
  };
}

// L'image du booster : la porte, et derrière elle autant de dos de cartes en éventail que le booster
// en contient (1, 3, 5…) : on voit d'un coup d'œil ce qu'on achète
function Pile({ b }) {
  const n = Math.min(b.nb_cartes, 7);
  return (
    <div className={`booster__pile booster__pile--${n}`} style={{ '--n': n }} role="img" aria-label={`${b.nom} : ${b.nb_cartes} carte${pluriel(b.nb_cartes)}`}>
      {Array.from({ length: n }, (_, i) => (
        <img key={i} className="booster__dos" src={urlPublique('img/Cartes/Verso-gris.webp')} alt="" style={{ '--k': i - (n - 1) / 2 }} loading="lazy" />
      ))}
      {b.image && <img className="article__booster" src={urlPublique(b.image)} alt="" />}
    </div>
  );
}

// Chances par rareté (les cartes d'aperçu ont été retirées le 20/10/2026)
function Chances({ b }) {
  const chances = Object.entries(b.chances ?? {}).filter(([, v]) => v > 0);
  return (
    <ul className="booster__chances" aria-label="Chances par carte">
      {chances.map(([r, v]) => <li key={r} style={{ '--c': COULEURS_RARETE[r] }}>{NOMS_RARETE[r] ?? r} {v} %</li>)}
    </ul>
  );
}

export default function Boosters({ moi, solde, version, rafraichir }) {
  const notifier = useNotifier();
  const [d, setD] = useState(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [occupe, setOccupe] = useState(null);   // ce qui est en cours : 'gratuit', ou l'id d'un booster

  useEffect(() => {
    let actif = true;
    charger(moi).then((x) => { if (actif) setD(x); });
    return () => { actif = false; };
  }, [moi, version]);
  // Le compte à rebours de l'offrande (chaque seconde)
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!d) return <div id="boosters" className="etal etal--boosters"><p className="vide">Chargement…</p></div>;
  const details = () => new Map([...d.cartes.values()].flat().map((c) => [c.name, c]));

  const acheter = async (b) => {
    const { data, error } = await supabase.rpc('acheter_booster', { p_booster_id: b.id, p_quantite: 1 });
    if (error) notifier(error.message || 'Achat impossible.', 'erreur');
    else notifier(`${data.booster} acheté pour ${data.prix} pièces ! Ouvre-le quand tu veux.`);
    rafraichir();
  };
  const ouvrir = async (id) => {
    const b = d.liste.find((x) => x.id === id);
    setOccupe(id);
    const { data, error } = await supabase.rpc('ouvrir_booster', { p_booster_id: id });
    if (error) { setOccupe(null); notifier(error.message || 'Impossible d\'ouvrir ce booster.', 'erreur'); return; }
    const { rouvrir } = await ouvrirBoosterAnime(data, b?.image ?? 'img/Booster/Booster.webp', {
      restants: data.restants, surRouvrir: true, details: details(),
    });
    setOccupe(null);
    rafraichir();
    if (rouvrir) ouvrir(id);
  };

  // L'offrande
  const restant = d.gratuit ? Math.max(0, Math.ceil((d.gratuit.pret - maintenant) / 1000)) : 0;
  const offrandePrete = !!moi && restant === 0;
  const ouvrirGratuit = async () => {
    setOccupe('gratuit');
    const { data, error } = await supabase.rpc('ouvrir_booster_gratuit');
    if (error) {
      setOccupe(null);
      notifier(error.message || 'Impossible d\'ouvrir l\'offrande.', 'erreur');
      rafraichir();
      return;
    }
    const t = Date.now();
    setMaintenant(t);
    setD((x) => ({ ...x, gratuit: { pret: t + (data.secondes ?? DELAI_GRATUIT) * 1000 } }));
    setOccupe(null);
    await ouvrirBoosterAnime(data, OFFRANDE.image, { restants: 0, details: details() });
  };

  return (
    <>
      {/* L'offrande gratuite : seule sur sa rangée, au-dessus des boosters en vente */}
      <div id="booster-gratuit" className="etal etal--boosters etal--offrande" hidden={!d.gratuit && !!moi}>
        {(d.gratuit || !moi) && (
          <article className={`article article--booster article--offrande${offrandePrete ? ' est-pret' : ''}`}>
            <div className="article__niche article__niche--booster">
              <Pile b={OFFRANDE} />
              <span className="booster__ruban">Gratuit</span>
            </div>
            <div className="article__etiquette">
              <span className="article__type">Offert · 3 cartes</span>
              <h3 className="article__nom">{OFFRANDE.nom}</h3>
              <div className="article__prix offrande__prix">Gratuit</div>
              <div className="offrande__jauge" aria-hidden="true"><span style={{ width: `${moi ? (1 - restant / DELAI_GRATUIT) * 100 : 0}%` }} /></div>
              <p className="offrande__compte" aria-live="polite">
                {!moi ? 'Connecte-toi pour recevoir ton offrande.' : offrandePrete ? 'Ton offrande t\'attend !' : `Prochaine offrande dans ${minSec(restant)}`}
              </p>
              <button type="button" className={`btn-ouvrir offrande__btn${occupe === 'gratuit' ? ' est-en-cours' : ''}`} data-ouvrir-gratuit
                disabled={!offrandePrete || occupe === 'gratuit'} onClick={ouvrirGratuit}>
                {occupe === 'gratuit' ? 'Ouverture…' : !moi ? 'Connecte-toi' : offrandePrete ? 'Ouvrir gratuitement' : minSec(restant)}
              </button>
            </div>
          </article>
        )}
      </div>

      <div id="boosters" className="etal etal--boosters">
        {!d.liste.length ? <p className="vide">Aucun booster en vente pour le moment.</p> : d.liste.map((b) => {
          const n = d.possedes.get(b.id) ?? 0;
          return (
            <article key={b.id} className="article article--booster">
              <div className="article__niche article__niche--booster">
                <Pile b={b} />
                <span className="booster__ruban">{b.nb_cartes} carte{pluriel(b.nb_cartes)}</span>
                {n > 0 && <span className="booster__possedes" title="Boosters à ouvrir">×{n}</span>}
              </div>
              <div className="article__etiquette">
                <span className="article__type">Booster · {b.nb_cartes} carte{pluriel(b.nb_cartes)}</span>
                <h3 className="article__nom">{b.nom}</h3>
                <Chances b={b} />
                <p className="article__desc">Doublon : un exemplaire de plus, à recycler dans ton grimoire contre de l&apos;or.</p>
                <div className="article__prix">{b.prix} <Piece /></div>
                <BoutonAchat connecte={!!moi} solde={solde} prix={b.prix} surAchat={() => acheter(b)} />
                {n > 0 && (
                  <button type="button" className="btn-ouvrir" data-ouvrir-booster={b.id} disabled={occupe === b.id} onClick={() => ouvrir(b.id)}>Ouvrir ({n})</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

