// =====================================================================
//  Écran « Marché » (ancien marche.html + JS/marche.js + JS/marche-echanges.js)
//  Deux onglets :
//  - Ventes : des cartes mises en vente par les joueurs, un prix, un bouton Acheter (components/marche/Ventes.jsx) ;
//  - Échanges : les contrats à sceaux entre deux joueurs, les souhaits, le registre (components/marche/Echanges.jsx).
//  #/marche?onglet=echanges ouvre les échanges (l'ancien marche.html#echanges) ;
//  #/marche?avec=<discord_id> ouvre un contrat avec ce joueur.
// =====================================================================
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import Ventes from '../components/marche/Ventes.jsx';
import Echanges from '../components/marche/Echanges.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.js';
import { nombre } from '../lib/marche.js';

// Ma bourse, mes cartes (pour vendre et échanger) et mes favorites (protégées si dernier exemplaire)
async function chargerCompte(discordId) {
  const [{ data: bourse }, { data: lignes }, { data: deck }] = await Promise.all([
    supabase.from('wallets').select('balance').eq('discord_id', discordId).maybeSingle(),
    supabase.from('player_cards').select('quantite, card:cards(*)').eq('discord_id', discordId),
    supabase.from('player_deck_cards').select('card_id').eq('discord_id', discordId),
  ]);
  return {
    solde: bourse?.balance ?? 0,
    favorites: new Set((deck ?? []).map((d) => d.card_id)),
    mesCartes: (lignes ?? []).filter((l) => l.card).map((l) => ({ carte: l.card, quantite: l.quantite ?? 1 }))
      .sort((a, b) => a.carte.name.localeCompare(b.carte.name, 'fr')),
  };
}

export default function Marche() {
  const { joueur, chargement } = useAuth();
  const [params, setParams] = useSearchParams();
  const discordId = joueur?.discord_id ?? null;
  const [compte, setCompte] = useState({ pour: null });
  const [version, setVersion] = useState(0);        // change après un achat, une vente, un échange : tout se recharge
  const [aSigner, setASigner] = useState(0);        // contrats qui attendent mon sceau
  const [ouverte, setOuverte] = useState(null);     // la carte affichée en grand
  const rafraichir = () => setVersion((v) => v + 1);

  const avec = params.get('avec');
  const section = avec || params.get('onglet') === 'echanges' ? 'echanges' : 'ventes';
  const montrer = (nom) => {
    const p = new URLSearchParams(params);
    if (nom === 'echanges') p.set('onglet', 'echanges'); else { p.delete('onglet'); p.delete('avec'); }
    setParams(p, { replace: true });
  };

  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    chargerCompte(discordId).then((c) => { if (actif) setCompte({ pour: discordId, ...c }); });
    return () => { actif = false; };
  }, [discordId, version]);
  const c = discordId && compte.pour === discordId ? compte : null;
  // Favorites protégées : le dernier exemplaire d'une carte du deck du profil ne s'échange pas et ne se vend pas
  const protegee = (id) => { const x = c?.mesCartes.find((y) => y.carte.id === id); return !!x && x.quantite <= 1 && !!c?.favorites.has(id); };

  return (
    <Page id="marche" classes="page-profil page-marche" titre="Marché">
      <main className="profil-wrap marche-page">
        <header className="marche-entete">
          <span className="marche-entete__sur">Les étals de Nocthémar</span>
          <h1>Le Marché</h1>
          <p>Achète et vends des cartes, ou échange directement avec un joueur sous contrat scellé.</p>
          <p className="marche-entete__bourse" id="bourse" hidden={!c}>Ta bourse : <b id="solde">{nombre(c?.solde)}</b> or</p>
        </header>
        <p className="marche-connexion" id="marche-connexion" hidden={chargement || !!joueur}>Connecte-toi avec Discord pour acheter, vendre et échanger des cartes.</p>

        <div className="marche-sections" role="tablist" aria-label="Le Marché">
          <button type="button" role="tab" className="marche-sections__onglet" id="onglet-ventes" aria-selected={section === 'ventes'} aria-controls="section-ventes"
            onClick={() => montrer('ventes')}>Ventes</button>
          <button type="button" role="tab" className="marche-sections__onglet" id="onglet-echanges" aria-selected={section === 'echanges'} aria-controls="section-echanges"
            onClick={() => montrer('echanges')}>
            ⇄ Échanges <span className="marche-sections__nb" id="badge-echanges" title="Contrats qui attendent ton sceau" hidden={!aSigner}>{aSigner}</span>
          </button>
        </div>

        <div className="marche-section" id="section-ventes" role="tabpanel" aria-labelledby="onglet-ventes" hidden={section !== 'ventes'}>
          {!chargement && (!joueur || c) && (
            <Ventes moi={joueur} solde={c?.solde ?? 0} mesCartes={c?.mesCartes ?? []} protegee={protegee}
              version={version} rafraichir={rafraichir} surApercu={setOuverte} />
          )}
        </div>

        <div className="marche-section" id="section-echanges" role="tabpanel" aria-labelledby="onglet-echanges" hidden={section !== 'echanges'}>
          <p className="marche-vide" id="echanges-connexion" hidden={chargement || !!joueur}>Connecte-toi avec Discord pour échanger avec les autres joueurs.</p>
          {/* Les échanges : contrats à sceaux entre joueurs, souhaits, registre */}
          {c && (
            <Echanges key={discordId} moi={joueur} mesCartes={c.mesCartes.map((x) => ({ ...x.carte, quantite: x.quantite }))} protegee={protegee}
              visible={section === 'echanges'} avec={avec} rafraichir={rafraichir} surASigner={setASigner} surApercu={setOuverte} />
          )}
        </div>
      </main>

      {ouverte && <ApercuCarte carte={ouverte} surFermeture={() => setOuverte(null)} />}
    </Page>
  );
}
