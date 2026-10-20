// =====================================================================
//  Les données dont le Duel a besoin, chargées depuis Supabase (ancien init() de JS/jeu-cartes.js)
//    catalogue        : toutes les unités du catalogue (l'Ombre et le mode Histoire s'en servent)
//    collection       : les unités de la collection du joueur (son Grimoire se construit avec)
//    objets           : ses objets de pouvoir (table inventory) qui existent comme cartes
//    favorites        : les id des cartes du deck de son profil (proposées en premier)
//    plateau          : le plateau choisi pour ses duels (défaut : l'arène de pierre)
//  useDonneesDuel(joueur) -> { pret, erreur, ...ces données }
// =====================================================================
import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { uniteDepuisCarte, objetDepuisNom } from '../moteur/index.js';

// Les plateaux que le CSS sait afficher (classe plateau-… sur <body>)
export const PLATEAUX = ['defaut', 'automne', 'ete', 'hiver', 'printemps', 'cristaux'];

// Seulement les vraies cartes illustrées (pas la carte d'exemple)
const jouable = (c) => c?.image && c.description !== "Carte d'exemple";

// Les objets possédés (lignes d'inventaire { item: { name } }) qui existent comme cartes de pouvoir
export const objetsPossedes = (lignes) => (lignes ?? []).map(({ item }) => item && objetDepuisNom(item.name)).filter(Boolean);

async function charger(id) {
  const { data: cartes, error } = await supabase.from('cards').select('*').eq('is_available', true).order('id');
  if (error) return { erreur: true };
  const catalogue = (cartes ?? []).filter(jouable).map(uniteDepuisCarte);
  if (!id) return { catalogue, collection: null, objets: [], favorites: [], plateau: 'defaut' };

  const [deck, inventaire, lignes, plateau] = await Promise.all([
    supabase.from('player_deck_cards').select('position, card_id').eq('discord_id', id),
    supabase.from('inventory').select('item:items(name, kind)').eq('discord_id', id),
    // La collection (lisible seulement par son propriétaire)
    supabase.from('player_cards').select('card:cards(*)').eq('discord_id', id),
    supabase.from('joueur_plateaux').select('plateau_id').eq('discord_id', id).eq('equipe', true).maybeSingle(),
  ]);
  const favorites = (deck.data ?? []).sort((a, b) => a.position - b.position).map((l) => l.card_id);
  const vues = new Set();
  const collection = (lignes.data ?? []).map((l) => l.card)
    .filter((c) => jouable(c) && !vues.has(c.id) && vues.add(c.id)).map(uniteDepuisCarte);
  return {
    catalogue, collection, favorites,
    objets: objetsPossedes(inventaire.data),
    plateau: PLATEAUX.includes(plateau.data?.plateau_id) ? plateau.data.plateau_id : 'defaut',
  };
}

export function useDonneesDuel(joueur, chargementAuth) {
  // Les données, avec le joueur pour qui elles ont été chargées (null : visiteur)
  const [donnees, setDonnees] = useState(null);
  const pour = joueur?.discord_id ?? null;

  useEffect(() => {
    if (chargementAuth) return undefined;
    let actif = true;
    charger(pour).then((d) => { if (actif) setDonnees({ ...d, pour }); });
    return () => { actif = false; };
  }, [pour, chargementAuth]);   // seulement si le joueur change vraiment (son discord_id)

  const pret = !chargementAuth && donnees !== null && donnees.pour === pour;
  return { pret, ...(pret ? donnees : {}) };
}
