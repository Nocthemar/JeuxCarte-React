// =====================================================================
//  Les autres échoppes de la boutique (même HTML qu'avant)
//  - ArmoireProfil : bannières, titres et thèmes (items.shop = 'fun'), un exemplaire par joueur,
//    achat buy_fun_item (ancien JS/boutique-profil.js) ;
//  - AtelierPlateaux : les plateaux du Duel, achat acheter_plateau, « Jouer dessus » equiper_plateau
//    (ancien JS/boutique-plateaux.js).
//  Le solde est vérifié côté serveur : impossible de tricher.
//
//  props communes : moi, solde, possedes (ids des objets possédés), version, rafraichir()
// =====================================================================
import { useEffect, useState } from 'react';
import { Article, BoutonAchat, Pastilles, Piece } from './Article.jsx';
import { supabase } from '../../lib/supabase.js';
import { useNotifier } from '../../lib/notification.js';
import { urlPublique } from '../../lib/chemins.js';
import Chargement from '../Chargement.jsx';

// Recharge des données quand la clé change ; null pendant le premier chargement
function useCharger(charger, cles) {
  const [donnees, setDonnees] = useState(null);
  useEffect(() => {
    let actif = true;
    charger().then((d) => { if (actif) setDonnees(d); });
    return () => { actif = false; };
    // (charger est recréée à chaque affichage : on ne recharge que si les clés changent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, cles);
  return donnees;
}

// Un achat de l'armoire : le message, puis tout se recharge (le solde est commun)
function useAcheter(rafraichir) {
  const notifier = useNotifier();
  return async (rpc, itemId) => {
    const { data, error } = await supabase.rpc(rpc, { p_item_id: itemId });
    if (error) notifier(error.message, 'erreur');
    else notifier(`${data.item} acheté pour ${data.price} pièces !`);
    rafraichir();
  };
}

async function chargerArmoire() {
  const { data, error } = await supabase.from('items').select('*').eq('shop', 'fun').eq('is_available', true).order('price');
  return error ? { erreur: true } : { items: data ?? [] };
}

export function ArmoireProfil({ moi, solde, possedes, version, rafraichir }) {
  const d = useCharger(chargerArmoire, [version]);
  const acheter = useAcheter(rafraichir);
  return (
    <div id="profil" className="etal">
      {!d ? <Chargement texte="Le marchand ouvre son étal…" />
        : d.erreur ? <p className="vide">Impossible de charger la boutique.</p>
          : !d.items.length ? <p className="vide">Rien à vendre pour l&apos;instant.</p>
            : d.items.map((item) => (
              <Article key={item.id} item={item} prix={item.price} extra={<Pastilles item={item} />}
                bouton={<BoutonAchat connecte={!!moi} solde={solde} prix={item.price} bloque={possedes.has(item.id) ? 'Possédé' : null}
                  attributs={{ 'data-boutique': 'profil', 'data-item': item.id }} surAchat={() => acheter('buy_fun_item', item.id)} />} />
            ))}
    </div>
  );
}

async function chargerPlateaux(moi) {
  const [{ data: liste }, { data: miens }] = await Promise.all([
    supabase.from('plateaux').select('*').eq('en_vente', true).order('ordre'),
    moi ? supabase.from('joueur_plateaux').select('plateau_id, equipe').eq('discord_id', moi.discord_id) : { data: [] },
  ]);
  return {
    liste: liste ?? [],
    possedes: new Set((miens ?? []).map((l) => l.plateau_id)),
    equipe: (miens ?? []).find((l) => l.equipe)?.plateau_id ?? null,
  };
}

export function AtelierPlateaux({ moi, solde, version, rafraichir }) {
  const notifier = useNotifier();
  const d = useCharger(() => chargerPlateaux(moi), [moi, version]);
  const [equipement, setEquipement] = useState(null);   // le plateau en train d'être choisi
  const acheter = async (p) => {
    const { data, error } = await supabase.rpc('acheter_plateau', { p_plateau_id: p.id });
    if (error) notifier(error.message || 'Achat impossible.', 'erreur');
    else notifier(`${data.plateau} acheté pour ${data.prix} pièces ! Clique « Jouer dessus » pour l'utiliser en duel.`);
    rafraichir();
  };
  const equiper = async (p) => {
    setEquipement(p.id);
    const { error } = await supabase.rpc('equiper_plateau', { p_plateau_id: p.id });
    if (error) notifier(error.message || 'Impossible de choisir ce plateau.', 'erreur');
    else notifier('C\'est ton plateau pour tes prochains duels.');
    setEquipement(null);
    rafraichir();
  };
  return (
    <div id="plateaux" className="etal etal--plateaux">
      {!d ? <Chargement texte="Le marchand ouvre son étal…" />
        : !d.liste.length ? <p className="vide">Aucun plateau en vente pour le moment.</p>
          : d.liste.map((p) => {
            const possede = d.possedes.has(p.id);
            return (
              <article key={p.id} className={`article article--plateau${possede ? ' article--possede' : ''}`}>
                <div className="article__niche article__niche--plateau">
                  <img className="article__plateau" src={urlPublique(p.miniature ?? p.image)} alt="" loading="lazy" />
                  {possede && <span className="plateau__possede">Possédé</span>}
                </div>
                <div className="article__etiquette">
                  <span className="article__type">Plateau de duel</span>
                  <h3 className="article__nom">{p.nom}</h3>
                  <p className="article__desc">{p.description ?? ''}</p>
                  <div className="article__prix">{possede ? 'Acheté' : <>{p.prix} <Piece /></>}</div>
                  {possede && d.equipe === p.id ? <button type="button" className="btn-acheter" disabled>Ton plateau actuel</button>
                    : possede ? <button type="button" className="btn-acheter" data-equiper-plateau={p.id} disabled={equipement === p.id} onClick={() => equiper(p)}>Jouer dessus</button>
                      : <BoutonAchat connecte={!!moi} solde={solde} prix={p.prix} attributs={{ 'data-acheter-plateau': p.id }} surAchat={() => acheter(p)} />}
                </div>
              </article>
            );
          })}
    </div>
  );
}
