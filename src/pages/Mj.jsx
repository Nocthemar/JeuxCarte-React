// =====================================================================
//  Écran « Panneau MJ » (ancien mj.html + JS/mj.js du site, déménagé dans le jeu en octobre 2026)
//  Trois onglets : Joueurs (pièces, inventaire, historique, rôle MJ, réinitialisation),
//  Journal (toutes les transactions, annulables), Objets & boutique (marchand du créneau, catalogue).
//  Toutes les modifications passent par des fonctions SQL « mj_… » qui vérifient côté serveur
//  que la personne connectée est MJ. Cacher cet écran ne suffirait pas : c'est la base qui protège.
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { lienSite } from '../lib/lienSite.js';

const LIBELLES = { banner: 'Bannière', title: 'Titre', theme: 'Thème', rp: 'Objet RP', wallpaper: 'Fond', access: 'Accès', other: 'Divers' };
const SOURCES = { bot: 'En jeu', mj: 'MJ', boutique_jour: 'Boutique du marchand', boutique_fun: 'Boutique fun', histoire: 'Mode Histoire' };
const BOUTIQUES = { daily: 'Du marchand', fun: 'Profil' };

const dateCourte = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Une image d'objet introuvable : on la cache plutôt que d'afficher une image cassée
const cacherSiCassee = (e) => { e.currentTarget.hidden = true; };


// ---------------------------------------------------------------------
// Une ligne du journal (fiche d'un joueur, ou onglet Journal avec le nom du joueur)
// ---------------------------------------------------------------------
function LigneTransaction({ t, nomJoueur, annuler }) {
  const annulable = !t.annulee && !t.annulation_de && t.amount !== 0;
  return (
    <li className={t.annulee ? 'tx--annulee' : ''}>
      <div>
        <span>{nomJoueur && <><strong>{nomJoueur(t.discord_id)}</strong> · </>}{t.reason ?? '—'}</span>
        <small className="doux"> {dateCourte(t.created_at)} · {SOURCES[t.source] ?? t.source}{t.annulee ? ' · annulée' : ''}</small>
      </div>
      <div className="actions">
        <strong className={t.amount >= 0 ? 'gain' : 'perte'}>{t.amount >= 0 ? '+' : ''}{t.amount}</strong>
        {annulable && <button type="button" className="btn-lien" onClick={() => annuler(t.id)}>Annuler</button>}
      </div>
    </li>
  );
}


// ---------------------------------------------------------------------
// Onglet Joueurs : la fiche du joueur choisi
// ---------------------------------------------------------------------
function FicheJoueur({ j, moi, items, version, rpc, rafraichir, annulerTx }) {
  const notifier = useNotifier();
  const [d, setD] = useState({ pour: null, inv: [], tx: [] });

  useEffect(() => {
    let actif = true;
    Promise.all([
      supabase.from('inventory').select('quantity, item:items(*)').eq('discord_id', j.discord_id).order('acquired_at', { ascending: false }),
      supabase.from('transactions').select('*').eq('discord_id', j.discord_id).order('created_at', { ascending: false }).limit(30),
    ]).then(([{ data: inv }, { data: tx }]) => {
      if (actif) setD({ pour: j.discord_id, inv: inv ?? [], tx: tx ?? [] });
    });
    return () => { actif = false; };
  }, [j.discord_id, version]);

  const estMoi = j.discord_id === moi.discord_id;
  const charge = d.pour === j.discord_id;

  async function pieces(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const montant = Number(f.elements.montant.value);
    const retirer = e.nativeEvent.submitter?.value === 'retirer';
    if (await rpc('mj_give_coins', {
      p_discord_id: j.discord_id,
      p_amount: retirer ? -montant : montant,
      p_reason: f.elements.raison.value.trim(),
    }, retirer ? `${montant} pièces retirées` : `${montant} pièces données`)) { f.reset(); rafraichir(); }
  }

  async function fixerSolde(e) {
    e.preventDefault();
    const f = e.currentTarget;
    if (await rpc('mj_set_balance', {
      p_discord_id: j.discord_id,
      p_balance: Number(f.elements.solde.value),
      p_reason: 'Ajustement du solde par un MJ',
    }, 'Solde fixé')) { f.reset(); rafraichir(); }
  }

  async function offrir(e) {
    e.preventDefault();
    if (await rpc('mj_give_item', { p_discord_id: j.discord_id, p_item_id: Number(e.currentTarget.elements.objet.value) }, 'Objet offert')) rafraichir();
  }

  async function retirerObjet(itemId, rembourser) {
    if (!confirm(rembourser ? 'Retirer cet objet et rembourser son prix ?' : 'Retirer cet objet (sans remboursement) ?')) return;
    if (await rpc('mj_remove_item', { p_discord_id: j.discord_id, p_item_id: itemId, p_rembourser: rembourser },
      rembourser ? 'Objet retiré et remboursé' : 'Objet retiré')) rafraichir();
  }

  async function basculerMj() {
    if (!confirm(j.is_mj ? `Retirer le rôle MJ à ${j.username} ?` : `Nommer ${j.username} MJ ? Il aura accès à ce panneau.`)) return;
    if (await rpc('mj_set_mj', { p_discord_id: j.discord_id, p_value: !j.is_mj }, 'Rôle mis à jour')) rafraichir();
  }

  async function reinitialiser() {
    if (!confirm(`Réinitialiser ${j.username} à 100 % ?\nOr à 0, toutes ses cartes, son grimoire et son deck, ses boosters, son Pass de saison, le mode Histoire, ses plateaux, son rang classé, ses échanges, contrats, annonces et souhaits, ses cosmétiques et son historique : tout est effacé. Seul le compte est gardé.`)) return;
    if (prompt(`Pour confirmer, écris : ${j.username}`) !== j.username) return notifier('Réinitialisation annulée', 'erreur');
    if (await rpc('mj_reset_player', { p_discord_id: j.discord_id }, `${j.username} a été réinitialisé`)) rafraichir();
  }

  return (
    <>
      <div className="fiche-entete">
        {j.avatar_url && <img src={j.avatar_url} alt="" />}
        <div>
          <h2>{j.username ?? 'Sans pseudo'}{j.is_mj && <> <span className="badge-mj">MJ</span></>}</h2>
          <Link to={`/profil?id=${encodeURIComponent(j.discord_id)}`}>Voir le profil public →</Link>
        </div>
        <div className="fiche-solde"><strong>{j.solde}</strong> pièces</div>
      </div>

      <h3>Pièces</h3>
      <form className="ligne-form" onSubmit={pieces}>
        <input name="montant" className="champ champ--court" type="number" min="1" placeholder="Montant" required />
        <input name="raison" className="champ" type="text" placeholder="Raison (quête, session, event…)" required />
        <button type="submit" className="btn-petit" value="donner">Donner</button>
        <button type="submit" className="btn-petit btn-petit--rouge" value="retirer">Retirer</button>
      </form>
      <form className="ligne-form" onSubmit={fixerSolde}>
        <input name="solde" className="champ champ--court" type="number" min="0" placeholder="Nouveau solde" required />
        <button type="submit" className="btn-petit">Fixer le solde</button>
      </form>

      <h3>Inventaire</h3>
      <ul className="liste">
        {!charge ? <p className="vide">Chargement…</p> : d.inv.length ? d.inv.map(({ quantity, item }) => (
          <li key={item.id}>
            <div>
              <span className="petit-type">{LIBELLES[item.kind] ?? item.kind}</span>
              <strong>{item.name}</strong>{quantity > 1 && <> <span className="doux">×{quantity}</span></>}
            </div>
            <div className="actions">
              <button type="button" className="btn-lien" onClick={() => retirerObjet(item.id, false)}>Retirer</button>
              <button type="button" className="btn-lien" onClick={() => retirerObjet(item.id, true)} title={`Retire l'objet et rend ${item.price} pièces`}>Retirer + rembourser</button>
            </div>
          </li>
        )) : <p className="vide">Inventaire vide.</p>}
      </ul>
      <form className="ligne-form" onSubmit={offrir}>
        <select name="objet" className="champ" required>
          {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({BOUTIQUES[it.shop]})</option>)}
        </select>
        <button type="submit" className="btn-petit">Offrir</button>
      </form>

      <h3>Historique</h3>
      <ul className="liste">
        {!charge ? <p className="vide">Chargement…</p> : d.tx.length
          ? d.tx.map((t) => <LigneTransaction key={t.id} t={t} annuler={annulerTx} />)
          : <p className="vide">Aucune transaction.</p>}
      </ul>

      <h3 className="zone-danger-titre">Zone sensible</h3>
      <div className="zone-danger">
        {!estMoi && <button type="button" className="btn-petit" onClick={basculerMj}>{j.is_mj ? 'Retirer le rôle MJ' : 'Nommer MJ'}</button>}
        <button type="button" className="btn-petit btn-petit--rouge" onClick={reinitialiser}>Réinitialiser le joueur</button>
      </div>
    </>
  );
}

function OngletJoueurs({ joueurs, ...fiche }) {
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState(null);
  const filtre = recherche.trim().toLowerCase();
  const liste = joueurs.filter((j) => (j.username ?? '').toLowerCase().includes(filtre));
  const choisi = joueurs.find((j) => j.discord_id === selection);

  return (
    <section className="onglet-contenu">
      <div className="mj-colonnes">
        <div className="carte">
          <h2>Joueurs</h2>
          <input className="champ" type="search" placeholder="Rechercher un joueur…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <ul className="liste liste-joueurs">
            {liste.length ? liste.map((j) => (
              <li key={j.discord_id} className={`joueur${j.discord_id === selection ? ' joueur--actif' : ''}`} onClick={() => setSelection(j.discord_id)}>
                {j.avatar_url ? <img src={j.avatar_url} alt="" /> : <span className="avatar-vide" />}
                <span className="joueur__nom">{j.username ?? 'Sans pseudo'}{j.is_mj && <> <span className="badge-mj">MJ</span></>}</span>
                <strong>{j.solde}</strong>
              </li>
            )) : <p className="vide">Aucun joueur.</p>}
          </ul>
        </div>

        <div className="carte">
          {!selection ? <p className="vide">Choisis un joueur dans la liste.</p>
            : !choisi ? <p className="vide">Joueur introuvable.</p>
              : <FicheJoueur j={choisi} {...fiche} />}
        </div>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------
// Onglet Journal
// ---------------------------------------------------------------------
function OngletJournal({ joueurs, version, annulerTx }) {
  const [filtre, setFiltre] = useState('');
  const [journal, setJournal] = useState(null);   // { data } ou { erreur }

  useEffect(() => {
    let actif = true;
    let requete = supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(200);
    if (filtre) requete = requete.eq('discord_id', filtre);
    requete.then(({ data, error }) => { if (actif) setJournal(error ? { erreur: error.message } : { data }); });
    return () => { actif = false; };
  }, [filtre, version]);

  const nomJoueur = (id) => joueurs.find((j) => j.discord_id === id)?.username ?? id;

  return (
    <section className="onglet-contenu">
      <div className="carte">
        <div className="mj-titre">
          <h2>Journal des pièces</h2>
          <select className="champ champ--auto" value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="">Tous les joueurs</option>
            {joueurs.map((j) => <option key={j.discord_id} value={j.discord_id}>{j.username ?? j.discord_id}</option>)}
          </select>
        </div>
        <p className="aide">« Annuler » applique le montant inverse et garde une trace. Pour un achat, ça rembourse les pièces : retire aussi l'objet de l'inventaire si besoin.</p>
        <ul className="liste">
          {!journal ? <p className="vide">Chargement…</p>
            : journal.erreur ? <p className="vide">Erreur : {journal.erreur}</p>
              : journal.data.length ? journal.data.map((t) => <LigneTransaction key={t.id} t={t} nomJoueur={nomJoueur} annuler={annulerTx} />)
                : <p className="vide">Aucune transaction.</p>}
        </ul>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------
// Onglet Objets & boutique
// ---------------------------------------------------------------------
function LigneMarchand({ price, stock, item, rpc, rafraichir }) {
  const [valeur, setValeur] = useState(stock);
  return (
    <li>
      <div><strong>{item.name}</strong> <span className="doux">{price} pièces</span></div>
      <div className="actions">
        <input className="champ champ--court" type="number" min="0" value={valeur} onChange={(e) => setValeur(e.target.value)} aria-label="Stock" />
        <button type="button" className="btn-lien" onClick={async () => {
          if (await rpc('mj_set_daily_stock', { p_item_id: item.id, p_stock: Number(valeur) }, 'Stock mis à jour')) rafraichir();
        }}>Enregistrer</button>
        <button type="button" className="btn-lien" onClick={async () => {
          if (await rpc('mj_remove_daily_item', { p_item_id: item.id }, 'Retiré de la boutique du marchand')) rafraichir();
        }}>Retirer</button>
      </div>
    </li>
  );
}

// Formulaire d'objet (création ou modification)
function FormObjet({ item, rpc, fermer, rafraichir }) {
  const p = item?.payload ?? {};
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [item]);

  async function enregistrer(e) {
    e.preventDefault();
    const champ = (nom) => e.currentTarget.elements.namedItem(nom);
    // On part du payload existant : les clés sans champ ici (emoji, rarete… utilisées par le bot) sont conservées
    const payload = { ...p };
    for (const [nom, cle] of [['image', 'image'], ['texte', 'text'], ['couleur', 'accent'], ['couleur2', 'accent2'], ['role', 'discord_role_id']]) {
      const v = champ(nom).value.trim();
      if (v) payload[cle] = v;
      else delete payload[cle];
    }
    const ok = await rpc('mj_save_item', {
      p_item: {
        id: item?.id ?? '',
        name: champ('nom').value,
        description: champ('description').value,
        price: Number(champ('prix').value),
        shop: champ('boutique').value,
        kind: champ('type').value,
        min_stock: Number(champ('stock_min').value),
        max_stock: Number(champ('stock_max').value),
        is_available: champ('en_vente').checked,
        payload,
      },
    }, 'Objet enregistré');
    if (ok) { fermer(); rafraichir(); }
  }

  return (
    <form ref={ref} className="form-objet" onSubmit={enregistrer}>
      <h3>{item ? `Modifier « ${item.name} »` : 'Nouvel objet'}</h3>
      <div className="grille-form">
        <label>Nom <input name="nom" className="champ" required defaultValue={item?.name ?? ''} /></label>
        <label>Prix <input name="prix" className="champ" type="number" min="0" required defaultValue={item?.price ?? 50} /></label>
        <label>Boutique
          <select name="boutique" className="champ" defaultValue={item?.shop ?? 'daily'}>
            <option value="daily">Boutique du marchand</option>
            <option value="fun">Boutique du profil</option>
          </select>
        </label>
        <label>Type
          <select name="type" className="champ" defaultValue={item?.kind ?? 'rp'}>
            {Object.entries(LIBELLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="large">Description <textarea name="description" className="champ" rows="2" defaultValue={item?.description ?? ''} /></label>
        <label>Stock min (marchand) <input name="stock_min" className="champ" type="number" min="0" defaultValue={item?.min_stock ?? 1} /></label>
        <label>Stock max (marchand) <input name="stock_max" className="champ" type="number" min="0" defaultValue={item?.max_stock ?? 5} /></label>
        <label>Image (bannière) <input name="image" className="champ" placeholder="img/Bannière/xxx.webp" defaultValue={p.image ?? ''} /></label>
        <label>Texte (titre) <input name="texte" className="champ" defaultValue={p.text ?? ''} /></label>
        <label>Couleur (thème) <input name="couleur" className="champ" placeholder="#8b1e2d" defaultValue={p.accent ?? ''} /></label>
        <label>Couleur 2 (thème, optionnelle) <input name="couleur2" className="champ" placeholder="#d4b537" defaultValue={p.accent2 ?? ''} /></label>
        <label>ID rôle Discord (optionnel) <input name="role" className="champ" defaultValue={p.discord_role_id ?? ''} /></label>
        <label className="case"><input name="en_vente" type="checkbox" defaultChecked={item?.is_available !== false} /> En vente</label>
      </div>
      <div className="ligne-form">
        <button type="submit" className="btn-petit">Enregistrer</button>
        <button type="button" className="btn-lien" onClick={fermer}>Annuler</button>
      </div>
    </form>
  );
}

function OngletObjets({ items, version, rpc, rafraichir }) {
  const [jour, setJour] = useState(null);
  const [edition, setEdition] = useState(null);   // null : fermé ; { item } : nouvel objet (item null) ou modification

  useEffect(() => {
    let actif = true;
    // Créneau en cours (la boutique du marchand ne change plus par jour)
    supabase.rpc('current_shop_slot').then(({ data: slot }) => supabase
      .from('daily_shop')
      .select('price, stock, item:items(id, name)')
      .eq('slot', slot)
      .order('price'))
      .then(({ data }) => { if (actif) setJour(data ?? []); });
    return () => { actif = false; };
  }, [version]);

  const dejaAuJour = new Set((jour ?? []).map((l) => l.item.id));
  const ajoutables = items.filter((it) => it.shop === 'daily' && !dejaAuJour.has(it.id));

  async function regenerer() {
    if (!confirm('Tirer une nouvelle sélection ? Celle du créneau en cours sera remplacée (les achats déjà faits restent).')) return;
    if (await rpc('mj_regenerate_daily_shop', {}, 'Nouvelle sélection du marchand')) rafraichir();
  }

  async function ajouter(e) {
    e.preventDefault();
    const f = e.currentTarget.elements;
    if (await rpc('mj_add_daily_item', { p_item_id: Number(f.objet.value), p_stock: Number(f.stock.value) },
      'Ajouté à la boutique du marchand')) rafraichir();
  }

  async function basculerVente(it) {
    if (await rpc('mj_toggle_item', { p_item_id: it.id, p_available: !it.is_available },
      it.is_available ? 'Retiré de la vente' : 'Remis en vente')) rafraichir();
  }

  return (
    <section className="onglet-contenu">
      <div className="carte">
        <div className="mj-titre">
          <h2>Boutique du marchand</h2>
          <button type="button" className="btn-petit" onClick={regenerer}>Nouvelle sélection</button>
        </div>
        <ul className="liste">
          {!jour ? <p className="vide">Chargement…</p> : jour.length
            ? jour.map((l) => <LigneMarchand key={`${l.item.id}-${l.stock}-${version}`} {...l} rpc={rpc} rafraichir={rafraichir} />)
            : <p className="vide">Pas de boutique pour ce créneau. Clique sur « Nouvelle sélection ».</p>}
        </ul>
        {ajoutables.length > 0 && (
          <form className="ligne-form" onSubmit={ajouter}>
            <select name="objet" className="champ" required>
              {ajoutables.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.price} pièces)</option>)}
            </select>
            <input name="stock" className="champ champ--court" type="number" min="0" defaultValue="3" required />
            <button type="submit" className="btn-petit">Ajouter à la boutique</button>
          </form>
        )}
      </div>

      <div className="carte">
        <div className="mj-titre">
          <h2>Catalogue</h2>
          <button type="button" className="btn-petit" onClick={() => setEdition({ item: null })}>+ Nouvel objet</button>
        </div>
        {edition && (
          <FormObjet key={edition.item?.id ?? 'nouveau'} item={edition.item} rpc={rpc} fermer={() => setEdition(null)} rafraichir={rafraichir} />
        )}
        <ul className="liste">
          {items.length ? items.map((it) => (
            <li key={it.id} className={it.is_available ? '' : 'objet--cache'}>
              <div className="objet-catalogue__entete">
                {it.payload?.image && <img className="objet-catalogue__icone" src={lienSite(it.payload.image)} alt="" onError={cacherSiCassee} />}
                <div>
                  <span className="petit-type">{BOUTIQUES[it.shop]} · {LIBELLES[it.kind] ?? it.kind}{it.is_available ? '' : ' · hors vente'}</span>
                  <strong>{it.name}</strong> <span className="doux">{it.price} pièces</span>
                </div>
              </div>
              <div className="actions">
                <button type="button" className="btn-lien" onClick={() => setEdition({ item: it })}>Modifier</button>
                <button type="button" className="btn-lien" onClick={() => basculerVente(it)}>{it.is_available ? 'Retirer de la vente' : 'Remettre en vente'}</button>
              </div>
            </li>
          )) : <p className="vide">Catalogue vide.</p>}
        </ul>
      </div>
    </section>
  );
}


// ---------------------------------------------------------------------
// L'écran
// ---------------------------------------------------------------------
const ONGLETS = [['joueurs', 'Joueurs'], ['journal', 'Journal'], ['objets', 'Objets & boutique']];

export default function Mj() {
  const { joueur: moi } = useAuth();
  const notifier = useNotifier();
  const estMj = !!moi?.is_mj;
  const [onglet, setOnglet] = useState('joueurs');
  const [joueurs, setJoueurs] = useState(null);   // [{ discord_id, username, avatar_url, is_mj, solde }]
  const [items, setItems] = useState([]);         // catalogue complet
  // Chaque modification fait monter la version : tout ce qui est affiché se recharge
  const [version, setVersion] = useState(0);
  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!estMj) return undefined;
    let actif = true;
    Promise.all([
      supabase.from('players').select('discord_id, username, avatar_url, is_mj, wallet:wallets(balance)').order('username'),
      supabase.from('items').select('*').order('shop').order('price'),
    ]).then(([{ data, error }, { data: catalogue }]) => {
      if (!actif) return;
      if (error) notifier('Impossible de charger les joueurs : ' + error.message, 'erreur');
      else setJoueurs(data.map((j) => {
        const w = Array.isArray(j.wallet) ? j.wallet[0] : j.wallet;
        return { ...j, solde: w?.balance ?? 0 };
      }));
      setItems(catalogue ?? []);
    });
    return () => { actif = false; };
  }, [estMj, version, notifier]);

  // Appel d'une fonction SQL avec gestion d'erreur et message
  const rpc = useCallback(async (nom, params, succes) => {
    const { data, error } = await supabase.rpc(nom, params);
    if (error) {
      notifier(error.message, 'erreur');
      return false;
    }
    if (succes) notifier(succes);
    return data ?? true;
  }, [notifier]);

  const annulerTx = useCallback(async (id) => {
    if (!confirm('Annuler cette transaction ? Le montant inverse sera appliqué.')) return;
    if (await rpc('mj_cancel_transaction', { p_id: Number(id) }, 'Transaction annulée')) rafraichir();
  }, [rpc, rafraichir]);

  return (
    <Page id="mj" classes="page-profil page-mj" titre="Panneau MJ">
      <main className="profil-wrap mj-wrap">
        {!estMj ? (
          <section className="carte centre">
            <h2>Panneau MJ</h2>
            <p>Cette page est réservée aux Maîtres du Jeu.</p>
          </section>
        ) : !joueurs ? <p className="vide">Chargement…</p> : (
          <div>
            <header className="mj-entete">
              <h1>Panneau du Maître du Jeu</h1>
              <nav className="onglets" role="tablist">
                {ONGLETS.map(([id, libelle]) => (
                  <button key={id} type="button" role="tab" aria-selected={onglet === id} className={`onglet${onglet === id ? ' actif' : ''}`} onClick={() => setOnglet(id)}>{libelle}</button>
                ))}
              </nav>
            </header>

            {onglet === 'joueurs' && <OngletJoueurs joueurs={joueurs} moi={moi} items={items} version={version} rpc={rpc} rafraichir={rafraichir} annulerTx={annulerTx} />}
            {onglet === 'journal' && <OngletJournal joueurs={joueurs} version={version} annulerTx={annulerTx} />}
            {onglet === 'objets' && <OngletObjets items={items} version={version} rpc={rpc} rafraichir={rafraichir} />}
          </div>
        )}
      </main>
    </Page>
  );
}
