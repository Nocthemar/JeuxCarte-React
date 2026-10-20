// =====================================================================
//  Le Marché, onglet « Échanges » (ancien JS/marche-echanges.js, même HTML)
//  - Rédiger : un CONTRAT avec un joueur. On touche dans « Ton grimoire » les cartes qu'on donne
//    (elles se posent sur la table), dans le sien celles qu'on demande ; on ajoute de l'or et des
//    objets / cosmétiques de chaque côté. « Rédiger et apposer mon sceau ».
//  - Contrats : les contrats ouverts, sur parchemin. Chacun appose son sceau de cire ; le second
//    sceau ratifie le contrat. Le modifier brise les sceaux (il faut revalider), le rompre l'annule.
//  - Souhaits : les cartes qu'on recherche (vues par les autres joueurs).
//  - Registre : contrats ratifiés ou rompus, ventes du Marché conclues.
//  Les favorites (dernier exemplaire d'une carte du deck du profil) sont protégées.
//  Tout est vérifié par le serveur ; un contrat ratifié met à jour les cartes et la bourse (rafraichir).
//
//  props : moi, mesCartes ([carte + quantite]), protegee(id), visible (l'onglet est affiché),
//          avec (discord_id : un contrat avec ce joueur), rafraichir(), surASigner(n), surApercu(carte)
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import Carte from '../Carte.jsx';
import { Contrat, AnnonceConclue, Loupe } from './Contrat.jsx';
import { supabase } from '../../lib/supabase.js';
import { useNotifier } from '../../lib/notification.js';
import { animationsReduites } from '../../lib/preferences.js';
import { jouerSon } from '../../lib/son.js';
import { MAX_CARTES, MAX_OBJETS, TYPES_OBJET, absent, nombre, texteEquilibre, valeurCote } from '../../lib/marche.js';

const ONGLETS = [['proposer', 'Rédiger'], ['courrier', 'Contrats'], ['souhaits', 'Souhaits'], ['registre', 'Registre']];
const TABLE_VIDE = { donnees: [], demandees: [], objetsDonnes: [], objetsDemandes: [] };

const Avatar = ({ j }) => (j?.avatar_url ? <img className="proposer__avatar" src={j.avatar_url} alt="" /> : <span className="proposer__avatar" aria-hidden="true">✦</span>);

// Ajoute ou retire une valeur d'une liste (au plus max) ; renvoie la nouvelle liste, ou null si c'est plein
const basculer = (liste, cle, max) => (liste.includes(cle) ? liste.filter((x) => x !== cle) : liste.length >= max ? null : [...liste, cle]);

export default function Echanges({ moi, mesCartes, protegee, visible, avec, rafraichir, surASigner, surApercu }) {
  const notifier = useNotifier();
  const [onglet, setOnglet] = useState('proposer');
  const [cache, setCache] = useState({ cartes: new Map(), objets: new Map(), joueurs: new Map([[moi.discord_id, moi]]) });
  const cacheRef = useRef(cache);
  useEffect(() => { cacheRef.current = cache; }, [cache]);

  // Rédiger
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState(null);   // null : liste fermée
  const [ami, setAmi] = useState(null);
  const [sien, setSien] = useState({ cartes: [], objets: [], mesObjets: [], souhaits: new Set() });
  const [table, setTable] = useState(TABLE_VIDE);
  const [orDonne, setOrDonne] = useState('0');
  const [orDemande, setOrDemande] = useState('0');
  const [message, setMessage] = useState('');
  const [edition, setEdition] = useState(null);       // { id, version } : un contrat en cours de modification
  const [envoi, setEnvoi] = useState(false);
  const champAmi = useRef(null);
  const zone = useRef(null);

  // Souhaits, contrats
  const [souhaits, setSouhaits] = useState(new Set());
  const [catalogue, setCatalogue] = useState(null);
  const [rechercheSouhait, setRechercheSouhait] = useState('');
  const [contrats, setContrats] = useState(null);    // { liste, conclues } ou { erreur }
  const contratsVus = useRef(new Map());              // id -> statut (pour signaler une ratification faite par l'autre)

  const mesParId = new Map(mesCartes.map((c) => [c.id, c]));
  const infos = {
    moi: moi.discord_id,
    carte: (id) => cache.cartes.get(id) ?? mesParId.get(id),
    objet: (id) => cache.objets.get(String(id)),
    nom: (id) => cache.joueurs.get(id)?.username ?? 'Un joueur',
  };

  // Cartes, objets et joueurs à connaître pour afficher des contrats et des annonces
  const precharger = async ({ cartes = [], objets = [], joueurs = [] }) => {
    const connu = cacheRef.current;
    const ids = [...new Set(cartes)].filter((id) => id != null && !connu.cartes.has(id));
    const obj = [...new Set(objets)].filter((id) => id != null && !connu.objets.has(String(id)));
    const jou = [...new Set(joueurs)].filter((id) => id && !connu.joueurs.has(id));
    if (!ids.length && !obj.length && !jou.length) return;
    const [{ data: c }, { data: o }, { data: j }] = await Promise.all([
      ids.length ? supabase.from('cards').select('*').in('id', ids) : { data: [] },
      obj.length ? supabase.from('items').select('*').in('id', obj) : { data: [] },
      jou.length ? supabase.from('players').select('discord_id, username, avatar_url').in('discord_id', jou) : { data: [] },
    ]);
    ajouterAuCache({ cartes: c, objets: o, joueurs: j });
  };
  const ajouterAuCache = ({ cartes = [], objets = [], joueurs = [] }) => setCache((x) => ({
    cartes: new Map([...x.cartes, ...(cartes ?? []).map((v) => [v.id, v])]),
    objets: new Map([...x.objets, ...(objets ?? []).map((v) => [String(v.id), v])]),
    joueurs: new Map([...x.joueurs, ...(joueurs ?? []).map((v) => [v.discord_id, v])]),
  }));

  // ---------------------------------------------------------------------
  //  Contrats (ouverts) et registre
  // ---------------------------------------------------------------------
  const chargerContrats = async () => {
    const { data, error } = await supabase.from('contrats').select('*').order('maj_le', { ascending: false }).limit(80);
    if (error) { setContrats({ erreur: absent(error) ? 'Les échanges ne sont pas encore installés (SQL/commerce.sql).' : 'Impossible de charger les contrats.' }); return; }
    const liste = data ?? [];
    const { data: conclues } = await supabase.from('annonces').select('*')
      .or(`auteur.eq.${moi.discord_id},conclu_par.eq.${moi.discord_id}`).eq('statut', 'conclue').order('conclu_le', { ascending: false }).limit(20);
    await precharger({
      cartes: [...liste.flatMap((c) => [...c.cartes_de, ...c.cartes_pour]), ...(conclues ?? []).map((a) => a.card_id)],
      objets: liste.flatMap((c) => [...c.objets_de, ...c.objets_pour]),
      joueurs: [...liste.flatMap((c) => [c.de, c.pour]), ...(conclues ?? []).flatMap((a) => [a.auteur, a.conclu_par])],
    });
    // Un contrat ratifié par l'autre joueur depuis le dernier passage : on le signale et on recharge le grimoire
    let ratifies = 0;
    for (const c of liste) {
      if (contratsVus.current.get(c.id) === 'ouvert' && c.statut === 'ratifie') ratifies += 1;
      contratsVus.current.set(c.id, c.statut);
    }
    if (ratifies) {
      notifier(ratifies > 1 ? `${ratifies} contrats ont été ratifiés !` : 'Un contrat a été ratifié : ton grimoire est à jour.');
      rafraichir();
    }
    surASigner(liste.filter((c) => c.statut === 'ouvert' && !(c.de === moi.discord_id ? c.sceau_de : c.sceau_pour)).length);
    setContrats({ liste, conclues: conclues ?? [] });
  };

  // ---------------------------------------------------------------------
  //  Rédiger : le joueur
  // ---------------------------------------------------------------------
  const chercherAmi = async (texte) => {
    const motif = `%${texte.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const { data } = await supabase.from('players').select('discord_id, username, avatar_url')
      .ilike('username', motif).neq('discord_id', moi.discord_id).order('username').limit(8);
    ajouterAuCache({ joueurs: data });
    setResultats(data ?? []);
  };
  // (la recherche part 250 ms après la dernière lettre tapée)
  useEffect(() => {
    const texte = recherche.trim();
    if (texte.length < 2) return undefined;
    const t = setTimeout(() => chercherAmi(texte), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche]);

  const choisirAmi = async (j, garder = false) => {
    if (!j) return;
    const change = ami?.discord_id !== j.discord_id;
    if (change && edition && !garder) setEdition(null);
    setAmi(j);
    ajouterAuCache({ joueurs: [j] });
    setResultats(null);
    setRecherche('');
    const [cartes, sesObjets, mesObjets, sesSouhaits] = await Promise.all([
      supabase.rpc('cartes_du_joueur', { p_discord_id: j.discord_id }),
      supabase.rpc('objets_du_joueur', { p_discord_id: j.discord_id }),
      supabase.rpc('objets_du_joueur', { p_discord_id: moi.discord_id }),
      supabase.from('souhaits').select('card_id').eq('discord_id', j.discord_id),
    ]);
    if (cartes.error) { notifier(cartes.error.message || 'Impossible de voir ses cartes.', 'erreur'); return; }
    // Seulement les objets échangeables (items.echangeable)
    const objets = (sesObjets.data ?? []).filter((o) => o.echangeable !== false);
    const miens = (mesObjets.data ?? []).filter((o) => o.echangeable !== false);
    ajouterAuCache({ cartes: cartes.data, objets: [...objets, ...miens] });
    setSien({ cartes: cartes.data ?? [], objets, mesObjets: miens, souhaits: new Set((sesSouhaits.data ?? []).map((s) => s.card_id)) });
    if (change && !garder) { setTable(TABLE_VIDE); setOrDonne('0'); setOrDemande('0'); }
  };
  const oublierAmi = () => {
    setAmi(null);
    setSien({ cartes: [], objets: [], mesObjets: [], souhaits: new Set() });
    setEdition(null);
    setTable(TABLE_VIDE);
    setTimeout(() => champAmi.current?.focus(), 0);
  };

  // Au début : mes souhaits, les contrats, et le contrat avec un joueur (lien « Proposer un échange » du profil)
  const debut = useRef(false);
  useEffect(() => {
    if (debut.current) return;
    debut.current = true;
    supabase.from('souhaits').select('card_id').eq('discord_id', moi.discord_id)
      .then(({ data }) => setSouhaits(new Set((data ?? []).map((s) => s.card_id))));
    chargerContrats();
    if (avec && avec !== moi.discord_id) {
      supabase.from('players').select('discord_id, username, avatar_url').eq('discord_id', avec).maybeSingle()
        .then(({ data: j }) => { if (j) { setOnglet('proposer'); choisirAmi(j); } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Les contrats se mettent à jour pendant qu'on les regarde (le sceau de l'autre, une ratification)
  const relire = useRef(null);
  useEffect(() => { relire.current = () => { if (visible && !document.hidden) chargerContrats(); }; });
  useEffect(() => {
    const t = setInterval(() => relire.current(), 15000);
    return () => clearInterval(t);
  }, []);

  const choisirOnglet = (nom) => {
    setOnglet(nom);
    if (nom === 'souhaits' && !catalogue) {
      supabase.from('cards').select('*').eq('is_available', true).order('name').then(({ data }) => {
        const liste = (data ?? []).filter((c) => c.image && c.description !== "Carte d'exemple");
        ajouterAuCache({ cartes: liste });
        setCatalogue(liste);
      });
    }
    if (nom === 'courrier' || nom === 'registre') chargerContrats();
  };

  // ---------------------------------------------------------------------
  //  Rédiger : la table
  // ---------------------------------------------------------------------
  const poser = (cle, valeur, max, message) => {
    const n = basculer(table[cle], valeur, max);
    if (!n) { notifier(message, 'erreur'); return; }
    setTable((t) => ({ ...t, [cle]: n }));
  };
  // Une carte de mon grimoire touchée : posée sur la table, ou reprise
  const basculerDonnee = (id) => {
    if (!ami) { notifier('Choisis d’abord avec qui échanger.', 'erreur'); return; }
    if (!table.donnees.includes(id) && protegee(id)) { notifier('C’est une de tes favorites (dernier exemplaire) : retire-la d’abord des favorites.', 'erreur'); return; }
    poser('donnees', id, MAX_CARTES, `${MAX_CARTES} cartes au plus de chaque côté.`);
  };
  const basculerDemandee = (id) => poser('demandees', id, MAX_CARTES, `${MAX_CARTES} cartes au plus de chaque côté.`);

  // Modifier un contrat ouvert : il se recharge sur la table (les sceaux se briseront)
  const modifier = async (id) => {
    const { data: c, error } = await supabase.from('contrats').select('*').eq('id', id).maybeSingle();
    if (error || !c || c.statut !== 'ouvert') { notifier('Ce contrat n’est plus ouvert.', 'erreur'); await chargerContrats(); return; }
    const jeSuisDe = c.de === moi.discord_id;
    const autre = jeSuisDe ? c.pour : c.de;
    await precharger({ joueurs: [autre] });
    setEdition({ id: c.id, version: c.version });
    setTable({
      donnees: jeSuisDe ? c.cartes_de : c.cartes_pour,
      demandees: jeSuisDe ? c.cartes_pour : c.cartes_de,
      objetsDonnes: (jeSuisDe ? c.objets_de : c.objets_pour).map(String),
      objetsDemandes: (jeSuisDe ? c.objets_pour : c.objets_de).map(String),
    });
    setOrDonne(String(jeSuisDe ? c.or_de : c.or_pour));
    setOrDemande(String(jeSuisDe ? c.or_pour : c.or_de));
    setMessage(c.message ?? '');
    setOnglet('proposer');
    await choisirAmi(cacheRef.current.joueurs.get(autre) ?? { discord_id: autre, username: infos.nom(autre) }, true);
    zone.current?.scrollIntoView({ behavior: animationsReduites() ? 'auto' : 'smooth', block: 'start' });
  };

  const apposerSceau = async (id, version) => {
    const { data, error } = await supabase.rpc('apposer_sceau', { p_id: id, p_version: version });
    if (!error) jouerSon('cire');   // le sceau de cire se pose
    if (error) notifier(error.message || 'Impossible d’apposer ton sceau.', 'erreur');
    else if (data?.ratifie) {
      notifier('Les deux sceaux sont apposés : le contrat est ratifié ! Ton grimoire est à jour.');
      contratsVus.current.set(id, 'ratifie');
      rafraichir();
    } else if (data?.raison) notifier(`Ratification impossible : ${data.raison} Les sceaux sont brisés.`, 'erreur');
    else notifier('Ton sceau est apposé. Le contrat sera ratifié quand l’autre joueur aura apposé le sien.');
    await chargerContrats();
  };
  const rompre = async (id) => {
    if (!confirm('Rompre ce contrat ? Rien ne sera échangé.')) return;
    const { error } = await supabase.rpc('rompre_contrat', { p_id: id });
    notifier(error ? error.message : 'Contrat rompu.', error ? 'erreur' : 'ok');
    if (edition?.id === id) setEdition(null);
    await chargerContrats();
  };

  const proposer = async () => {
    if (!ami) return;
    setEnvoi(true);
    const enEdition = !!edition;
    const mien = { cartes: table.donnees, or: Math.max(0, Math.floor(Number(orDonne) || 0)), objets: table.objetsDonnes };
    const lui = { cartes: table.demandees, or: Math.max(0, Math.floor(Number(orDemande) || 0)), objets: table.objetsDemandes };
    const mot = message.trim() || null;
    let id;
    let version;
    if (edition) {
      // Côtés du contrat : « de » est celui qui l'a rédigé à l'origine
      const { data: c } = await supabase.from('contrats').select('de').eq('id', edition.id).maybeSingle();
      const [de, pour] = c?.de === moi.discord_id ? [mien, lui] : [lui, mien];
      const { data, error } = await supabase.rpc('modifier_contrat', {
        p_id: edition.id, p_cartes_de: de.cartes, p_cartes_pour: pour.cartes, p_or_de: de.or, p_or_pour: pour.or,
        p_objets_de: de.objets, p_objets_pour: pour.objets, p_message: mot,
      });
      if (error) { notifier(error.message || 'Modification impossible.', 'erreur'); setEnvoi(false); return; }
      id = edition.id;
      version = data;
    } else {
      const { data, error } = await supabase.rpc('ouvrir_contrat', {
        p_pour: ami.discord_id, p_cartes_de: mien.cartes, p_cartes_pour: lui.cartes, p_or_de: mien.or, p_or_pour: lui.or,
        p_objets_de: mien.objets, p_objets_pour: lui.objets, p_message: mot,
      });
      if (error) { notifier(error.message || 'Contrat impossible.', 'erreur'); setEnvoi(false); return; }
      id = data;
      version = 1;
    }
    // Le rédacteur appose aussitôt son sceau
    const { error: errSceau } = await supabase.rpc('apposer_sceau', { p_id: id, p_version: version });
    if (!errSceau) jouerSon('cire');
    notifier(errSceau
      ? `Contrat enregistré, mais ton sceau n'a pas pu être apposé : ${errSceau.message}`
      : `Contrat ${enEdition ? 'modifié' : 'rédigé'} et scellé de ton côté. ${ami.username ?? 'L’autre joueur'} doit maintenant apposer le sien.`, errSceau ? 'erreur' : 'ok');
    setEnvoi(false);
    setEdition(null);
    setTable(TABLE_VIDE);
    setOrDonne('0');
    setOrDemande('0');
    setMessage('');
    await chargerContrats();
    setOnglet('courrier');
  };

  // ---------------------------------------------------------------------
  //  Souhaits
  // ---------------------------------------------------------------------
  const basculerSouhait = async (id) => {
    const { data, error } = await supabase.rpc('basculer_souhait', { p_card_id: id });
    if (error) { notifier(error.message || 'Impossible de modifier ta liste.', 'erreur'); return; }
    setSouhaits((s) => { const n = new Set(s); if (data) n.add(id); else n.delete(id); return n; });
    notifier(data ? 'Ajoutée à ta liste de souhaits.' : 'Retirée de ta liste de souhaits.');
  };
  const tuileSouhait = (c) => {
    const voulue = souhaits.has(c.id);
    return (
      <span key={c.id} className={`souhait${voulue ? ' est-souhaitee' : ''}`}>
        <Carte carte={c} />
        <button type="button" className="souhait__coeur" data-souhait={c.id} aria-pressed={voulue} title={voulue ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
          onClick={() => basculerSouhait(c.id)}>{voulue ? '♥' : '♡'}</button>
        <Loupe carte={c} surApercu={surApercu} />
      </span>
    );
  };

  // ---------------------------------------------------------------------
  //  L'affichage
  // ---------------------------------------------------------------------
  const vDonne = valeurCote(infos, table.donnees, Math.max(0, Number(orDonne) || 0), table.objetsDonnes);
  const vRecoit = valeurCote(infos, table.demandees, Math.max(0, Number(orDemande) || 0), table.objetsDemandes);
  const tableVide = table.donnees.length + table.demandees.length + table.objetsDonnes.length + table.objetsDemandes.length === 0;
  const aSigner = contrats?.liste?.filter((c) => c.statut === 'ouvert' && !(c.de === moi.discord_id ? c.sceau_de : c.sceau_pour)).length ?? 0;
  const ouverts = contrats?.liste?.filter((c) => c.statut === 'ouvert') ?? [];
  const registre = contrats?.liste ? [
    ...contrats.liste.filter((c) => c.statut !== 'ouvert').slice(0, 15).map((c) => ({ date: c.ratifie_le ?? c.maj_le, el: <Contrat key={`c${c.id}`} c={c} clos infos={infos} surApercu={surApercu} /> })),
    ...contrats.conclues.map((a) => ({ date: a.conclu_le, el: <AnnonceConclue key={`a${a.id}`} a={a} infos={infos} /> })),
  ].sort((x, y) => new Date(y.date) - new Date(x.date)) : [];
  const miennes = new Set(mesCartes.map((c) => c.id));
  const jePeux = mesCartes.filter((c) => sien.souhaits.has(c.id));

  const surTable = (ids, cote, vide) => (ids.length ? (
    <div className="eventail eventail--table" style={{ '--n': ids.length }}>
      {ids.map((id, i) => (
        <button key={id} type="button" className="eventail__carte proposer__carte" data-cote={cote} data-id={id}
          style={{ '--k': (i - (ids.length - 1) / 2).toFixed(1) }} title="Reprendre cette carte"
          onClick={() => (cote === 'donne' ? basculerDonnee(id) : basculerDemandee(id))}>
          {infos.carte(id) && <Carte carte={infos.carte(id)} />}
        </button>
      ))}
    </div>
  ) : <div className="eventail eventail--vide"><span>{vide}</span></div>);

  const puces = (liste, choisis, cle, vide) => (liste.length ? liste.map((o) => {
    const choisi = choisis.includes(String(o.id));
    return (
      <button key={o.id} type="button" className={`objet-puce objet-puce--choix${choisi ? ' est-choisi' : ''}`} data-objet={String(o.id)} aria-pressed={choisi}
        onClick={() => poser(cle, String(o.id), MAX_OBJETS, `${MAX_OBJETS} objets au plus de chaque côté.`)}>
        {o.kind && TYPES_OBJET[o.kind] && <small>{TYPES_OBJET[o.kind]}</small>}{o.name}
      </button>
    );
  }) : <span className="objet-vide">{vide}</span>);

  return (
    <section id="marche" className="marche" aria-labelledby="marche-titre" ref={zone}>
      <header className="marche__tete">
        <h2 id="marche-titre" className="marche__titre"><span aria-hidden="true">❦</span> Échanges scellés <span aria-hidden="true">❦</span></h2>
        <div className="marche__onglets" role="tablist" aria-label="Les échanges">
          {ONGLETS.map(([id, nom]) => (
            <button key={id} type="button" role="tab" className="marche__onglet" data-onglet={id} aria-selected={onglet === id} onClick={() => choisirOnglet(id)}>
              {nom}{id === 'courrier' && <> <span id="compte-recus">{aSigner ? `(${aSigner})` : ''}</span></>}
            </button>
          ))}
        </div>
      </header>

      {/* Rédiger un contrat (ou le modifier) */}
      <div className="marche__panneau" data-panneau="proposer" hidden={onglet !== 'proposer'}>
        <div className="table-echange__ami">
          <label htmlFor="recherche-ami">Avec qui ?</label>
          <div className="proposer__recherche">
            <input type="search" id="recherche-ami" placeholder="Pseudo du joueur…" autoComplete="off" ref={champAmi} value={recherche}
              onChange={(e) => { setRecherche(e.target.value); if (e.target.value.trim().length < 2) setResultats(null); }} />
            <ul id="resultats-ami" className="proposer__resultats" hidden={!resultats}>
              {resultats && (resultats.length ? resultats.map((j) => (
                <li key={j.discord_id}><button type="button" data-ami={j.discord_id} onClick={() => choisirAmi(j)}><Avatar j={j} /><span>{j.username ?? 'Aventurier'}</span></button></li>
              )) : <li className="vide">Aucun joueur trouvé.</li>)}
            </ul>
          </div>
          {ami && (
            <div id="ami-choisi" className="proposer__choisi">
              <Avatar j={ami} /><b>{ami.username ?? 'Aventurier'}</b><button type="button" className="btn-petit" id="changer-ami" onClick={oublierAmi}>Changer</button>
            </div>
          )}
        </div>
        <p className="marche__aide" id="marche-aide">
          {ami ? 'Touche dans « Ton grimoire » les cartes que tu donnes (elles se posent sur la table), et dans le sien celles que tu demandes. Ajoute de l’or ou des objets de chaque côté.'
            : 'Choisis un joueur : tu composes ensuite le contrat avec les cartes de ton grimoire et du sien.'}
        </p>
        {ami && (
          <div id="proposer-cartes" className="marche__plan">
            {edition && <p className="contrat-edition" id="contrat-edition">Modification du contrat n°{edition.id} : les deux sceaux seront brisés, chacun devra revalider.</p>}
            {/* La table : ce qui part, ce qui arrive */}
            <div className="plateau-echange">
              <div className="plateau-echange__cote">
                <h3>Tu donnes <span id="compte-donnees">{table.donnees.length} / {MAX_CARTES}</span></h3>
                <div id="table-donnees" className="plateau-echange__eventail">{surTable(table.donnees, 'donne', 'Touche une carte de ton grimoire')}</div>
                <label className="plateau-echange__or">Or <input type="number" id="or-donne" min="0" max="1000000" step="1" inputMode="numeric" value={orDonne} onChange={(e) => setOrDonne(e.target.value)} /></label>
                <div className="plateau-echange__objets" id="objets-donnes">
                  <span className="objets__titre">Objets et cosmétiques</span>{puces(sien.mesObjets, table.objetsDonnes, 'objetsDonnes', 'Tu n’as pas d’objet.')}
                </div>
                <p className="plateau-echange__valeur" id="valeur-donne">{vDonne ? `Valeur indicative ≈ ${nombre(vDonne)} or` : ''}</p>
              </div>
              <div className="plateau-echange__balance" aria-hidden="true">⚖</div>
              <div className="plateau-echange__cote">
                <h3>Tu reçois <span id="compte-demandees">{table.demandees.length} / {MAX_CARTES}</span></h3>
                <div id="table-demandees" className="plateau-echange__eventail">{surTable(table.demandees, 'demande', 'Choisis une carte du sien')}</div>
                <label className="plateau-echange__or">Or <input type="number" id="or-demande" min="0" max="1000000" step="1" inputMode="numeric" value={orDemande} onChange={(e) => setOrDemande(e.target.value)} /></label>
                <div className="plateau-echange__objets" id="objets-demandes">
                  <span className="objets__titre">Ses objets et cosmétiques</span>{puces(sien.objets, table.objetsDemandes, 'objetsDemandes', 'Aucun objet.')}
                </div>
                <p className="plateau-echange__valeur" id="valeur-demande">{vRecoit ? `Valeur indicative ≈ ${nombre(vRecoit)} or` : ''}</p>
              </div>
              <p className="plateau-echange__equilibre" id="equilibre">{texteEquilibre(vDonne, vRecoit)}</p>
              <div className="plateau-echange__envoi">
                <input type="text" id="message-echange" maxLength={200} placeholder="Une clause ou un petit mot (facultatif)" value={message} onChange={(e) => setMessage(e.target.value)} />
                {edition && <button type="button" className="btn-petit" id="btn-annuler-edition" onClick={() => setEdition(null)}>Annuler la modification</button>}
                <button type="button" className="btn-dc-or" id="btn-proposer" disabled={tableVide || envoi} onClick={proposer}>
                  {edition ? 'Modifier le contrat et apposer mon sceau' : 'Rédiger et apposer mon sceau'}
                </button>
              </div>
            </div>
            {jePeux.length > 0 && (
              <p className="souhaits-ami" id="souhaits-ami">
                <span>♥ {ami.username ?? 'Ce joueur'} recherche des cartes que tu as :</span>{' '}
                {jePeux.map((c) => <button key={c.id} type="button" className="btn-petit" data-donner={c.id} onClick={() => { if (!table.donnees.includes(c.id)) basculerDonnee(c.id); }}>{c.name}</button>)}
              </p>
            )}
            <div className="coffres">
              {/* Mon grimoire : les cartes que je donne */}
              <div className="coffre">
                <h3 className="coffre__titre">Ton grimoire</h3>
                <p className="coffre__aide">Touche une carte pour la donner (elle se pose sur la table). ♥ = il la recherche. Le dernier exemplaire d’une favorite ne s’échange pas.</p>
                <div id="mes-cartes-echange" className="coffre__grille">
                  {mesCartes.length ? mesCartes.map((c) => {
                    const choisie = table.donnees.includes(c.id);
                    const bloquee = !choisie && protegee(c.id);
                    const souhaitee = sien.souhaits.has(c.id);
                    return (
                      <span key={c.id} className={`proposer__tuile${choisie ? ' est-choisie' : ''}${bloquee ? ' est-bloquee' : ''}${souhaitee ? ' est-souhaitee' : ''}`}>
                        <button type="button" className="proposer__carte" data-cote="donne" data-id={c.id} aria-pressed={choisie} disabled={bloquee}
                          title={bloquee ? 'Favorite (dernier exemplaire) : retire-la d’abord des favorites' : undefined} onClick={() => basculerDonnee(c.id)}><Carte carte={c} /></button>
                        {souhaitee && <span className="proposer__souhait" title={`${ami.username ?? 'Ce joueur'} la recherche`}>♥</span>}
                        {c.quantite > 1 && <span className="proposer__deja">×{c.quantite}</span>}
                        {bloquee && <span className="proposer__deja">favorite</span>}
                        <Loupe carte={c} surApercu={surApercu} />
                      </span>
                    );
                  }) : <p className="echanges__vide">Ton grimoire est vide.</p>}
                </div>
              </div>
              {/* Le grimoire de l'autre joueur */}
              <div className="coffre">
                <h3 className="coffre__titre" id="titre-ses-cartes">Le grimoire de {ami.username ?? 'ce joueur'}</h3>
                <p className="coffre__aide">Touche une carte pour la demander. Une carte que tu as déjà te donnera un exemplaire de plus. ♥ = sur ta liste de souhaits.</p>
                <div id="ses-cartes" className="coffre__grille">
                  {sien.cartes.length ? sien.cartes.map((c) => {
                    const choisie = table.demandees.includes(c.id);
                    const dejaAMoi = miennes.has(c.id);   // permis : ce sera un exemplaire de plus
                    const souhait = souhaits.has(c.id);
                    return (
                      <span key={c.id} className={`proposer__tuile${choisie ? ' est-choisie' : ''}${souhait ? ' est-souhaitee' : ''}`}>
                        <button type="button" className="proposer__carte" data-cote="demande" data-id={c.id} aria-pressed={choisie}
                          title={dejaAMoi ? 'Tu l’as déjà : ce sera un exemplaire de plus' : undefined} onClick={() => basculerDemandee(c.id)}><Carte carte={c} /></button>
                        {souhait && <span className="proposer__souhait" title="Sur ta liste de souhaits">♥</span>}
                        {dejaAMoi && <span className="proposer__deja">déjà à toi</span>}
                        <Loupe carte={c} surApercu={surApercu} />
                      </span>
                    );
                  }) : <p className="echanges__vide">Son grimoire est vide.</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contrats ouverts : apposer son sceau, modifier, rompre */}
      <div className="marche__panneau" data-panneau="courrier" hidden={onglet !== 'courrier'}>
        <p className="marche__aide">Un contrat est ratifié quand les deux joueurs y ont apposé leur sceau. Toute modification brise les sceaux : chacun doit revalider.</p>
        <div id="contrats" className="contrats">
          {!contrats ? null : contrats.erreur ? <p className="echanges__vide">{contrats.erreur}</p>
            : ouverts.length ? ouverts.map((c) => (
              <Contrat key={c.id} c={c} infos={infos} surApercu={surApercu}
                surSceau={() => apposerSceau(c.id, c.version)} surModifier={() => modifier(c.id)} surRompre={() => rompre(c.id)} />
            )) : <p className="echanges__vide">Aucun contrat ouvert. Rédige-en un avec un joueur.</p>}
        </div>
      </div>

      {/* Liste de souhaits */}
      <div className="marche__panneau" data-panneau="souhaits" hidden={onglet !== 'souhaits'}>
        <p className="marche__aide">Les cartes que tu recherches : les autres joueurs les voient quand ils rédigent un contrat avec toi.</p>
        <div id="mes-souhaits" className="souhaits">
          {catalogue && (catalogue.some((c) => souhaits.has(c.id))
            ? catalogue.filter((c) => souhaits.has(c.id)).map((c) => tuileSouhait(c))
            : <p className="echanges__vide">Ta liste est vide : touche ♡ sur une carte ci-dessous.</p>)}
        </div>
        <h3 className="marche__rubrique">Toutes les cartes</h3>
        <input type="search" id="souhait-recherche" className="souhaits__recherche" placeholder="Chercher une carte…" aria-label="Chercher une carte"
          value={rechercheSouhait} onChange={(e) => setRechercheSouhait(e.target.value)} />
        <div id="catalogue-souhaits" className="souhaits souhaits--catalogue">
          {catalogue && (() => {
            const texte = rechercheSouhait.trim().toLowerCase();
            const liste = catalogue.filter((c) => !texte || c.name.toLowerCase().includes(texte)).slice(0, 60);
            return liste.length ? liste.map((c) => tuileSouhait(c)) : <p className="echanges__vide">Aucune carte trouvée.</p>;
          })()}
        </div>
      </div>

      {/* Registre : contrats ratifiés ou rompus, ventes conclues sur le Marché */}
      <div className="marche__panneau" data-panneau="registre" hidden={onglet !== 'registre'}>
        <div id="historique-echanges" className="contrats">
          {contrats && !contrats.erreur && (registre.length ? registre.map((x) => x.el)
            : <p className="echanges__vide">Le registre est encore vierge.</p>)}
        </div>
      </div>
    </section>
  );
}

