// =====================================================================
//  Le Marché, onglet « Ventes » (ancien JS/marche.js, même HTML)
//  - la liste des ventes ouvertes (14 jours), avec filtres : nom, rareté, Veine, prix, mes ventes ;
//  - Acheter : conclure_annonce (le serveur vérifie la carte du vendeur et l'or de l'acheteur) ;
//  - Mettre en vente : publier_annonce('vente', carte, prix) ; Retirer : retirer_annonce.
//  Le dernier exemplaire d'une favorite (deck du profil) ne peut pas être vendu.
//
//  props : moi, solde, mesCartes ([{ carte, quantite }]), protegee(id), version, rafraichir(), surApercu(carte)
// =====================================================================
import { useEffect, useState } from 'react';
import Carte from '../Carte.jsx';
import { supabase } from '../../lib/supabase.js';
import { useNotifier } from '../../lib/notification.js';
import { RARETES, VEINES } from '../../data/affichage.js';
import { JOURS_VENTE, PRIX_CONSEILLE, nombre, veineDe } from '../../lib/marche.js';
import Chargement from '../Chargement.jsx';

// Par paquets de 100 : une longue liste ne tient pas dans l'adresse d'une seule requête
const paquets = (liste) => Array.from({ length: Math.ceil(liste.length / 100) }, (_, i) => liste.slice(i * 100, i * 100 + 100));

async function chargerVentes(connecte) {
  const depuis = new Date(Date.now() - JOURS_VENTE * 864e5).toISOString();
  // Toutes les ventes ouvertes, par pages de 500 (2 000 au plus)
  const PAGE = 500;
  let ventes = [];
  for (let debut = 0; debut < 2000; debut += PAGE) {
    const r = await supabase.from('annonces').select('*')
      .eq('type', 'vente').eq('statut', 'ouverte').gte('cree_le', depuis)
      .order('cree_le', { ascending: false }).order('id', { ascending: false }).range(debut, debut + PAGE - 1);
    if (r.error) {
      return {
        erreur: /schema cache|does not exist|PGRST20|42P01/.test(`${r.error.code} ${r.error.message}`)
          ? 'Le marché n’est pas encore installé (SQL/commerce.sql).' : connecte ? 'Impossible de charger le marché.' : 'Connecte-toi pour voir le marché.',
      };
    }
    ventes = ventes.concat(r.data ?? []);
    if ((r.data ?? []).length < PAGE) break;
  }
  const [cartes, profils] = await Promise.all([
    Promise.all(paquets([...new Set(ventes.map((v) => v.card_id))]).map((p) => supabase.from('cards').select('*').in('id', p))),
    Promise.all(paquets([...new Set(ventes.map((v) => v.auteur))]).map((p) => supabase.from('players').select('discord_id, username').in('discord_id', p))),
  ]);
  return {
    ventes,
    cartes: new Map(cartes.flatMap((r) => r.data ?? []).map((c) => [c.id, c])),
    joueurs: new Map(profils.flatMap((r) => r.data ?? []).map((j) => [j.discord_id, j])),
  };
}

// Mettre une carte en vente
function Vendre({ mesCartes, protegee, surVente }) {
  const notifier = useNotifier();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState('');
  const [prix, setPrix] = useState('100');
  const [envoi, setEnvoi] = useState(false);
  const proposable = mesCartes.filter((x) => !protegee(x.carte.id));
  const carteId = choix && mesCartes.some((x) => String(x.carte.id) === choix) ? choix : String(proposable[0]?.carte.id ?? '');
  const c = mesCartes.find((x) => String(x.carte.id) === carteId)?.carte;

  const vendre = async (e) => {
    e.preventDefault();
    const p = Math.floor(Number(prix) || 0);
    if (!c || p < 1) return;
    setEnvoi(true);
    const { error } = await supabase.rpc('publier_annonce', { p_type: 'vente', p_card_id: c.id, p_prix: p, p_message: null });
    setEnvoi(false);
    if (error) { notifier(error.message || 'Mise en vente impossible.', 'erreur'); return; }
    notifier('Ta carte est en vente sur le marché.');
    setOuvert(false);
    surVente();
  };

  return (
    <details className="marche-vendre" id="marche-vendre" open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary>Mettre une carte en vente</summary>
      <form className="marche-vendre__form" id="form-vente" onSubmit={vendre}>
        <label>Carte
          <select id="vente-carte" required value={carteId} onChange={(e) => setChoix(e.target.value)}>
            {mesCartes.length ? mesCartes.map((x) => (
              <option key={x.carte.id} value={x.carte.id} disabled={protegee(x.carte.id)}>
                {x.carte.name} · {RARETES[x.carte.rarity] ?? ''}{x.quantite > 1 ? ` · ×${x.quantite}` : ''}{protegee(x.carte.id) ? ' (favorite)' : ''}
              </option>
            )) : <option value="">Ton grimoire est vide</option>}
          </select>
        </label>
        <label>Prix
          <span className="marche-vendre__prix"><input type="number" id="vente-prix" min="1" max="1000000" required inputMode="numeric" value={prix} onChange={(e) => setPrix(e.target.value)} /> or</span>
        </label>
        <p className="marche-vendre__aide" id="vente-aide">
          {c ? `Prix conseillé pour une carte ${(RARETES[c.rarity] ?? '').toLowerCase()} : environ ${nombre(PRIX_CONSEILLE[c.rarity] ?? 50)} or. Ta vente reste ${JOURS_VENTE} jours sur le marché.` : ''}
        </p>
        <button type="submit" className="btn-or" disabled={envoi}>Mettre en vente</button>
      </form>
    </details>
  );
}

// Une vente de la liste
function Vente({ v, c, vendeur, moi, solde, surAchat, surRetrait, surApercu }) {
  const [envoi, setEnvoi] = useState(false);
  const mienne = v.auteur === moi?.discord_id;
  const agir = async (fn) => { setEnvoi(true); await fn(); setEnvoi(false); };
  return (
    <article className={`vente rar-${c.rarity ?? 'commune'}${mienne ? ' est-mienne' : ''}`}>
      <button type="button" className="vente__carte" aria-label={`Voir ${c.name} en grand`} onClick={() => surApercu(c)}><Carte carte={c} /></button>
      <div className="vente__infos">
        <h2 className="vente__nom">{c.name}</h2>
        <p className="vente__rarete">{RARETES[c.rarity] ?? ''}</p>
        <p className="vente__prix">{nombre(v.prix)} <span>or</span></p>
        <p className="vente__vendeur">{mienne ? 'Ta vente' : `Vendue par ${vendeur?.username ?? 'un joueur'}`}</p>
        {!moi ? <button type="button" className="btn-or" disabled>Connecte-toi</button>
          : mienne ? <button type="button" className="btn-sobre" data-retirer={v.id} disabled={envoi} onClick={() => agir(surRetrait)}>Retirer de la vente</button>
            : (
              <button type="button" className="btn-or" data-acheter={v.id} disabled={envoi || solde < v.prix} title={solde < v.prix ? 'Pas assez d’or' : undefined}
                onClick={() => agir(surAchat)}>Acheter · {nombre(v.prix)} or</button>
            )}
      </div>
    </article>
  );
}

export default function Ventes({ moi, solde, mesCartes, protegee, version, rafraichir, surApercu }) {
  const notifier = useNotifier();
  const [d, setD] = useState(null);
  const [filtres, setFiltres] = useState({ nom: '', rarete: '', veine: '', tri: 'recent', miennes: false });
  const filtre = (cle) => (e) => setFiltres((f) => ({ ...f, [cle]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const connecte = !!moi;

  useEffect(() => {
    let actif = true;
    chargerVentes(connecte).then((x) => { if (actif) setD(x); });
    return () => { actif = false; };
  }, [connecte, version]);

  const acheter = async (v, c) => {
    if (!confirm(`Acheter « ${c?.name ?? 'cette carte'} » pour ${nombre(v.prix)} or ?`)) return;
    const { data, error } = await supabase.rpc('conclure_annonce', { p_id: v.id });
    if (error) notifier(error.message || 'Achat impossible.', 'erreur');
    else if (!data?.ok) notifier(`Achat impossible : ${data?.raison ?? ''}`, 'erreur');
    else notifier(`« ${data.carte} » rejoint ton grimoire !`);
    rafraichir();
  };
  const retirer = async (v) => {
    const { error } = await supabase.rpc('retirer_annonce', { p_id: v.id });
    notifier(error ? error.message : 'Ta carte est retirée du marché.', error ? 'erreur' : 'ok');
    rafraichir();
  };

  let liste = [];
  if (d && !d.erreur) {
    const texte = filtres.nom.trim().toLowerCase();
    liste = d.ventes.filter((v) => {
      const c = d.cartes.get(v.card_id);
      if (!c) return false;
      if (texte && !c.name.toLowerCase().includes(texte)) return false;
      if (filtres.rarete && c.rarity !== filtres.rarete) return false;
      if (filtres.veine && veineDe(c) !== filtres.veine) return false;
      if (filtres.miennes && v.auteur !== moi?.discord_id) return false;
      return true;
    });
    if (filtres.tri === 'prix') liste.sort((a, b) => a.prix - b.prix);
    else if (filtres.tri === 'prix-desc') liste.sort((a, b) => b.prix - a.prix);
  }

  return (
    <>
      {moi && <Vendre mesCartes={mesCartes} protegee={protegee} surVente={rafraichir} />}

      {/* Filtres */}
      <div className="marche-filtres">
        <input type="search" id="filtre-nom" placeholder="Chercher une carte…" aria-label="Chercher une carte" value={filtres.nom} onChange={filtre('nom')} />
        <select id="filtre-rarete" aria-label="Rareté" value={filtres.rarete} onChange={filtre('rarete')}>
          <option value="">Toutes les raretés</option>
          <option value="commune">Commune</option>
          <option value="eveillee">Éveillée</option>
          <option value="mythique">Mythique</option>
          <option value="legendaire">Légendaire</option>
          <option value="transcendante">Transcendante</option>
        </select>
        <select id="filtre-veine" aria-label="Type (Veine)" value={filtres.veine} onChange={filtre('veine')}>
          <option value="">Toutes les Veines</option>
          {Object.entries(VEINES).map(([k, [nom, ico]]) => <option key={k} value={k}>{ico} {nom}</option>)}
        </select>
        <select id="filtre-tri" aria-label="Trier" value={filtres.tri} onChange={filtre('tri')}>
          <option value="recent">Les plus récentes</option>
          <option value="prix">Prix croissant</option>
          <option value="prix-desc">Prix décroissant</option>
        </select>
        <label className="marche-filtres__miennes"><input type="checkbox" id="filtre-miennes" checked={filtres.miennes} onChange={filtre('miennes')} /> Mes ventes</label>
      </div>

      <div className="marche-liste" id="marche-liste">
        {!d ? <Chargement texte="Les vendeurs installent leurs étals…" />
          : d.erreur ? <p className="marche-vide">{d.erreur}</p>
            : !liste.length ? <p className="marche-vide">{d.ventes.length ? 'Aucune carte ne correspond à ces filtres.' : 'Aucune carte en vente pour l’instant. Sois le premier à en proposer une !'}</p>
              : liste.map((v) => {
                const c = d.cartes.get(v.card_id);
                return (
                  <Vente key={v.id} v={v} c={c} vendeur={d.joueurs.get(v.auteur)} moi={moi} solde={solde} surApercu={surApercu}
                    surAchat={() => acheter(v, c)} surRetrait={() => retirer(v)} />
                );
              })}
      </div>
    </>
  );
}
