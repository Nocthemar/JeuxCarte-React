// =====================================================================
//  Les autres échoppes de la boutique (même HTML qu'avant)
//  - EtalMarchand : la sélection du bot Discord, renouvelée toutes les 5 h (ancien JS/boutique-jour.js) :
//    daily_shop du créneau en cours (current_shop_slot), stock limité, achat buy_daily_item,
//    compte à rebours jusqu'au prochain étal (next_shop_refresh) ;
//  - ArmoireProfil : bannières, titres et thèmes (items.shop = 'fun'), un exemplaire par joueur,
//    achat buy_fun_item (ancien JS/boutique-profil.js) ;
//  - AtelierPlateaux : les plateaux du Duel, achat acheter_plateau, « Jouer dessus » equiper_plateau
//    (ancien JS/boutique-plateaux.js).
//  Le solde et le stock sont vérifiés côté serveur : impossible de tricher.
//
//  props communes : moi, solde, possedes (ids des objets possédés), version, rafraichir()
// =====================================================================
import { useEffect, useState } from 'react';
import { Article, BoutonAchat, Pastilles, Piece } from './Article.jsx';
import { supabase } from '../../lib/supabase.js';
import { useNotifier } from '../../lib/notification.js';
import { urlPublique } from '../../lib/chemins.js';

const DELAI_APRES_RENOUVELLEMENT = 5000;   // laisse au bot le temps d'écrire la nouvelle sélection

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

// Un achat de l'étal ou de l'armoire : le message, puis tout se recharge (le solde est commun)
function useAcheter(rafraichir) {
  const notifier = useNotifier();
  return async (rpc, itemId) => {
    const { data, error } = await supabase.rpc(rpc, { p_item_id: itemId });
    if (error) notifier(error.message, 'erreur');
    else notifier(`${data.item} acheté pour ${data.price} pièces !`);
    rafraichir();
  };
}

// ---------------------------------------------------------------------
//  Le compte à rebours jusqu'au prochain étal ; à zéro, le marchand renouvelle son étal (surRenouveau)
// ---------------------------------------------------------------------
function Rebours({ version, surRenouveau }) {
  const [prochain, setProchain] = useState(null);   // Date du renouvellement (calculée par la base)
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [tour, setTour] = useState(0);
  useEffect(() => {
    let actif = true;
    supabase.rpc('next_shop_refresh').then(({ data, error }) => { if (actif) setProchain(error || !data ? false : new Date(data)); });
    return () => { actif = false; };
  }, [version, tour]);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const reste = prochain ? Math.max(0, Math.floor((prochain - maintenant) / 1000)) : null;
  const fini = reste === 0;
  useEffect(() => {
    if (!fini) return undefined;
    const t = setTimeout(() => { surRenouveau(); setTour((n) => n + 1); }, DELAI_APRES_RENOUVELLEMENT);
    return () => clearTimeout(t);
  }, [fini, surRenouveau]);

  if (!prochain) return <p id="rebours" className="rebours" />;
  // L'heure vient de Supabase en UTC : on l'affiche en heure de Paris (infobulle)
  const titre = `Renouvellement à ${prochain.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })} (heure de Paris)`;
  if (fini) return <p id="rebours" className="rebours" title={titre}>Le marchand renouvelle son étal…</p>;
  const hh = Math.floor(reste / 3600);
  const mm = Math.floor((reste % 3600) / 60);
  const ss = reste % 60;
  return (
    <p id="rebours" className="rebours" title={titre}>
      <span className="rebours__libelle">Nouvel étal dans</span>{' '}
      <strong className="rebours__temps">{hh} h {String(mm).padStart(2, '0')} min {String(ss).padStart(2, '0')} s</strong>
    </p>
  );
}

async function chargerEtal() {
  // Début du créneau de 5 h en cours, calculé par la base
  const { data: slot, error: erreurSlot } = await supabase.rpc('current_shop_slot');
  if (erreurSlot || !slot) return { erreur: true };
  const { data: lignes, error } = await supabase.from('daily_shop').select('price, stock, item:items(*)').eq('slot', slot).order('price');
  return error ? { erreur: true } : { lignes: lignes ?? [] };
}

export function EtalMarchand({ moi, solde, version, rafraichir }) {
  const [renouveau, setRenouveau] = useState(0);
  const d = useCharger(chargerEtal, [version, renouveau]);
  const acheter = useAcheter(rafraichir);
  const [surRenouveau] = useState(() => () => setRenouveau((n) => n + 1));
  return (
    <>
      <Rebours version={version} surRenouveau={surRenouveau} />
      <div id="jour" className="etal">
        {!d ? <p className="vide">Chargement…</p>
          : d.erreur ? <p className="vide">Impossible de charger la boutique du marchand.</p>
            : !d.lignes.length ? <p className="vide">Le marchand installe encore son étal… Reviens dans quelques minutes.</p>
              : d.lignes.map(({ price, stock, item }) => {
                const epuise = stock <= 0;
                const bas = !epuise && stock <= 2;   // presque plus rien : stock en rouge
                return (
                  <Article key={item.id} item={item} prix={price} epuise={epuise}
                    stock={<span className={`article__stock${bas ? ' article__stock--bas' : ''}`}>{epuise ? 'Épuisé' : `${stock} en stock`}</span>}
                    bouton={<BoutonAchat connecte={!!moi} solde={solde} prix={price} bloque={epuise ? 'Épuisé' : null}
                      attributs={{ 'data-boutique': 'jour', 'data-item': item.id }} surAchat={() => acheter('buy_daily_item', item.id)} />} />
                );
              })}
      </div>
    </>
  );
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
      {!d ? <p className="vide">Chargement…</p>
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
      {!d ? <p className="vide">Chargement…</p>
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
