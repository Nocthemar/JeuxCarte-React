// =====================================================================
//  La sécurité de la base (supabase/schema.sql + securite.sql), testée comme un tricheur s'y prendrait :
//  appels directs à l'API avec son propre compte, en visiteur, ou avec de fausses données.
// =====================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { creerBase } from './base.js';

const ALICE = '11111111-1111-1111-1111-111111111111';    // Discord 111111, MJ
const BOB = '22222222-2222-2222-2222-222222222222';      // Discord 222222
const PIRATE = '33333333-3333-3333-3333-333333333333';   // inscription par e-mail
const NEUF = '44444444-4444-4444-4444-444444444444';     // compte e-mail tout neuf
const maintenant = () => Math.floor(Date.now() / 1000);
const jetonRecent = { amr: [{ method: 'oauth', timestamp: maintenant() }] };

let b;
beforeAll(async () => {
  b = await creerBase();
  await b.compte({ id: ALICE, fournisseur: 'discord', meta: { provider_id: '111111', full_name: 'Alice', avatar_url: 'https://cdn.discordapp.com/avatars/111111/a.png' } });
  await b.compte({ id: BOB, fournisseur: 'discord', meta: { provider_id: '222222', full_name: 'Bob' } });
  await b.sql(`update players set is_mj = true, created_at = now() - interval '30 days' where discord_id = '111111';
               update players set created_at = now() - interval '30 days' where discord_id = '222222';
               update wallets set balance = 1000;`);
}, 60000);

describe('identité : création du profil', () => {
  it('une inscription par e-mail ne peut pas voler le profil d\'un joueur Discord (même avec ses métadonnées)', async () => {
    await b.compte({ id: PIRATE, fournisseur: 'email', meta: { provider_id: '111111', sub: '111111', full_name: 'Alice' } });
    const [alice] = await b.sql(`select user_id from players where discord_id = '111111'`);
    expect(alice.user_id).toBe(ALICE);
    const [pirate] = await b.sql(`select discord_id, username, pseudo_a_choisir, is_mj from players where user_id = $1`, [PIRATE]);
    expect(pirate.discord_id).toBe('e_' + PIRATE.replace(/-/g, ''));
    expect(pirate.username).toMatch(/^Aventurier-/);
    expect(pirate.pseudo_a_choisir).toBe(true);
    expect(pirate.is_mj).toBe(false);
    const moi = await b.en('authenticated', PIRATE, 'select my_discord_id() as id');
    expect(moi[0].id).toBe(pirate.discord_id);
  });

  it('un second compte Discord avec le même identifiant ne reprend pas un profil déjà rattaché', async () => {
    const autre = '55555555-5555-5555-5555-555555555555';
    await b.compte({ id: autre, fournisseur: 'discord', meta: { provider_id: '222222', full_name: 'Faux Bob' } });
    const [bob] = await b.sql(`select user_id from players where discord_id = '222222'`);
    expect(bob.user_id).toBe(BOB);
    const refus = await b.sql(`select count(*)::int n from securite.journal where action = 'profil_refuse'`);
    expect(refus[0].n).toBe(1);
  });

  it('un profil créé par le bot (sans compte) est rattaché à la première connexion Discord', async () => {
    await b.sql(`insert into players (discord_id, username) values ('777777', 'Créé par le bot')`);
    const id = '77777777-7777-7777-7777-777777777777';
    await b.compte({ id, fournisseur: 'discord', meta: { provider_id: '777777', full_name: 'Gaël' } });
    const [p] = await b.sql(`select user_id, username from players where discord_id = '777777'`);
    expect(p.user_id).toBe(id);
    expect(p.username).toBe('Créé par le bot');
  });

  it('un compte anonyme n\'a pas de profil de joueur', async () => {
    const id = '88888888-8888-8888-8888-888888888888';
    await b.compte({ id, fournisseur: 'anonymous', meta: { provider_id: '222222' } });
    expect(await b.sql('select * from players where user_id = $1', [id])).toHaveLength(0);
  });

  it('l\'avatar ne peut pas être remplacé par une image hors de Discord', async () => {
    await b.sql(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"avatar_url": "https://pirate.example/pixel.png"}' where id = $1`, [ALICE]);
    let [p] = await b.sql(`select avatar_url from players where discord_id = '111111'`);
    expect(p.avatar_url).toBe('https://cdn.discordapp.com/avatars/111111/a.png');
    await b.sql(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"avatar_url": "https://cdn.discordapp.com/avatars/111111/b.png"}' where id = $1`, [ALICE]);
    [p] = await b.sql(`select avatar_url from players where discord_id = '111111'`);
    expect(p.avatar_url).toBe('https://cdn.discordapp.com/avatars/111111/b.png');
  });

  it('choisir son pseudo : une seule fois, validé, unique, pas de nom réservé', async () => {
    const choisir = (nom) => b.essai('authenticated', PIRATE, `select choisir_pseudo('${nom.replace(/'/g, "''")}') as p`);
    expect((await choisir('ab')).erreur).toMatch(/entre 3 et 20/);
    expect((await choisir('<script>')).erreur).toMatch(/lettres/);
    expect((await choisir('Le MJ')).erreur).toMatch(/réservé/);
    expect((await choisir('alice')).erreur).toMatch(/déjà pris/);
    expect((await choisir('  Élise   des Brumes ')).lignes[0].p).toBe('Élise des Brumes');
    expect((await choisir('Autre')).erreur).toMatch(/déjà choisi/);
    expect((await b.essai('authenticated', ALICE, `select choisir_pseudo('Mjolnir')`)).erreur).toMatch(/déjà choisi/);
  });

  it('mon_profil : le profil du joueur connecté seulement', async () => {
    const [{ p }] = await b.en('authenticated', ALICE, 'select mon_profil() as p');
    expect(p.discord_id).toBe('111111');
    expect(p.is_mj).toBe(true);
    expect((await b.essai('anon', '', 'select mon_profil()')).ok).toBe(false);
  });
});

describe('droits de base (aucune écriture directe)', () => {
  const refuse = async (role, uid, sql) => expect((await b.essai(role, uid, sql)).ok, sql).toBe(false);
  it('ni or, ni cartes, ni rôle MJ par l\'API', async () => {
    await refuse('authenticated', BOB, 'update wallets set balance = 99999');
    await refuse('authenticated', BOB, "insert into player_cards (discord_id, card_id) values ('222222', 1)");
    await refuse('authenticated', BOB, 'update player_cards set quantite = 50');
    await refuse('authenticated', BOB, 'update players set is_mj = true');
    await refuse('authenticated', BOB, "select grant_card('222222', 1)");
    await refuse('authenticated', BOB, "select pass_ajouter_xp('222222', 99999)");
    await refuse('authenticated', BOB, "select pass_donner_or('222222', 99999, 'x')");
    await refuse('authenticated', BOB, "select crediter_recyclage('222222', 99999, 0, 'x')");
    await refuse('authenticated', BOB, "select commerce_transferer('111111', '222222', '{}', 500, '{}', 'x')");
    await refuse('authenticated', BOB, "select mj_reset_player('111111')");
    await refuse('authenticated', BOB, 'select * from duels');
    await refuse('authenticated', BOB, 'select * from salons');
    await refuse('authenticated', BOB, 'select * from securite.journal');
    await refuse('authenticated', BOB, 'select * from admin.journal_recent');
    await refuse('anon', '', 'select * from securite.quotas');
  });

  it('un visiteur n\'appelle que les fonctions publiques prévues', async () => {
    const ouvertes = await b.sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'securite') and has_function_privilege('anon', p.oid, 'execute') order by 1`);
    expect(ouvertes.map((x) => x.proname)).toEqual([
      'card_attack_is_valid', 'commerce_normaliser', 'current_shop_slot', 'limiter_requete', 'next_shop_refresh',
      'signaler_erreur', 'stats_joueur', 'succes_vitrine', 'valeur_recyclage',
    ]);
  });

  it('une NOUVELLE fonction n\'est plus exécutable par tout le monde par défaut', async () => {
    await b.sql(`create function public.nouvelle_fonction_du_site() returns int language sql as $$ select 1 $$`);
    await refuse('anon', '', 'select nouvelle_fonction_du_site()');
    await refuse('authenticated', BOB, 'select nouvelle_fonction_du_site()');
  });
});

describe('duels contre l\'Ombre et mode Histoire', () => {
  const commencer = (uid, args = "'ia', 'difficile', null, '[\"u1\", \"t-garde\", \"o-potion\"]'") => b.en('authenticated', uid, `select duel_commencer(${args}) as d`);
  const vieillir = (id, secondes) => b.sql(`update duels set commence_le = now() - make_interval(secs => ${secondes}) where id = $1`, [id]);
  const terminer = (role, uid, id, resultat) => b.essai(role, uid, `select duel_terminer('${id}', '${resultat}') as r`);

  it('le serveur tire la graine et note le Grimoire ; un visiteur ne peut pas commencer', async () => {
    const [{ d }] = await commencer(BOB);
    expect(d.graine).toBeGreaterThanOrEqual(0);
    expect(d.graine).toBeLessThanOrEqual(4294967295);
    expect(d.elan).toBe(0);
    expect((await b.essai('anon', '', "select duel_commencer('ia', 'normal')")).ok).toBe(false);
    expect((await b.essai('authenticated', BOB, `select duel_commencer('ia', 'normal', null, '["<script>"]')`)).erreur).toMatch(/Grimoire invalide/);
    expect((await b.essai('authenticated', BOB, `select duel_commencer('ia', 'impossible')`)).erreur).toMatch(/Difficulté/);
  });

  it('le joueur ne peut PAS déclarer sa victoire lui-même (ni par l\'ancien chemin)', async () => {
    const [{ d }] = await commencer(BOB);
    await vieillir(d.id, 60);
    expect((await terminer('authenticated', BOB, d.id, 'joueur')).ok).toBe(false);
    expect((await b.essai('authenticated', BOB, "select pass_commencer_partie('ia', null, 'difficile')")).erreur).toMatch(/arbitrés par le serveur/);
    expect((await b.essai('authenticated', BOB, "select valider_niveau_histoire('pravorn-1')")).ok).toBe(false);
    expect((await b.essai('authenticated', BOB, "select histoire_commencer('pravorn-1')")).ok).toBe(false);
  });

  it('l\'arbitre (service_role) valide une victoire : XP, or selon la difficulté, élan, statistiques', async () => {
    const [{ d }] = await commencer(BOB);
    await vieillir(d.id, 120);
    const avant = (await b.sql(`select balance from wallets where discord_id = '222222'`))[0].balance;
    const r = await terminer('service_role', null, d.id, 'joueur');
    expect(r.lignes[0].r).toMatchObject({ xp: 100, or: 10, victoire: true, elan: 1 });
    expect((await b.sql(`select balance from wallets where discord_id = '222222'`))[0].balance).toBe(avant + 10);
    // Le même duel ne paie pas deux fois
    expect((await terminer('service_role', null, d.id, 'joueur')).lignes[0].r.raison).toBe('ticket');
    const [{ d: d2 }] = await commencer(BOB);
    expect(d2.elan).toBe(1);
  });

  it('un duel trop court, ou refusé par le rejeu, ne rapporte rien (et le refus est journalisé)', async () => {
    const [{ d }] = await commencer(BOB);
    expect((await terminer('service_role', null, d.id, 'joueur')).lignes[0].r.raison).toBe('court');
    const [{ d: d2 }] = await commencer(BOB);
    await vieillir(d2.id, 120);
    expect((await terminer('service_role', null, d2.id, 'invalide')).lignes[0].r.raison).toBe('invalide');
    expect((await b.sql(`select count(*)::int n from securite.journal where action = 'duel_refuse'`))[0].n).toBe(1);
  });

  it('mode Histoire : première victoire récompensée, la suivante non ; un niveau verrouillé est refusé', async () => {
    const [{ d }] = await commencer(BOB, "'histoire', null, 'pravorn-1', '[]'");
    await vieillir(d.id, 120);
    const r = (await terminer('service_role', null, d.id, 'joueur')).lignes[0].r;
    expect(r.victoire).toBe(true);
    expect(r.recompenses.deja).toBe(false);
    const [{ d: d2 }] = await commencer(BOB, "'histoire', null, 'pravorn-1', '[]'");
    await vieillir(d2.id, 120);
    expect((await terminer('service_role', null, d2.id, 'joueur')).lignes[0].r.recompenses.deja).toBe(true);
    const [{ d: d3 }] = await commencer(BOB, "'histoire', null, 'pravorn-4', '[]'");
    await vieillir(d3.id, 120);
    expect((await terminer('service_role', null, d3.id, 'joueur')).erreur).toMatch(/pas encore débloqué/);
  });
});

describe('économie', () => {
  it('24 Offrandes par jour au plus', async () => {
    await b.sql(`insert into player_booster_gratuit (discord_id, dernier, jour, nb)
                 values ('222222', now() - interval '1 hour', (now() at time zone 'Europe/Paris')::date, 24)
                 on conflict (discord_id) do update set dernier = excluded.dernier, jour = excluded.jour, nb = 24`);
    expect((await b.essai('authenticated', BOB, 'select ouvrir_booster_gratuit()')).erreur).toMatch(/24 Offrandes du jour/);
    const [{ e }] = await b.en('authenticated', BOB, 'select booster_gratuit_etat() as e');
    expect(e.restantes).toBe(0);
    expect(e.secondes).toBeGreaterThan(0);
    await b.sql(`update player_booster_gratuit set nb = 3 where discord_id = '222222'`);
    expect((await b.essai('authenticated', BOB, 'select ouvrir_booster_gratuit()')).ok).toBe(true);
  });

  it('l\'XP de recyclage est plafonnée à 1000 par jour, l\'or non', async () => {
    const xp = async () => (await b.sql(`select coalesce(sum(xp), 0)::int x from pass_progression where discord_id = '222222'`))[0].x;
    const avant = await xp();
    await b.sql(`select crediter_recyclage('222222', 50, 900, 'test'), crediter_recyclage('222222', 50, 900, 'test')`);
    expect(await xp()).toBe(avant + 1000);
  });

  it('un compte de moins de 24 h ne peut rien céder (fabrique de comptes)', async () => {
    await b.compte({ id: NEUF, fournisseur: 'email', meta: {} });
    const neuf = `e_${NEUF.replace(/-/g, '')}`;
    await b.sql(`update wallets set balance = 500 where discord_id = '${neuf}';
                 insert into player_cards (discord_id, card_id, source) values ('${neuf}', 5, 'recompense'), ('222222', 6, 'recompense')
                 on conflict (discord_id, card_id) do nothing;`);   // (Bob a pu tirer la carte 6 dans l'Offrande du test précédent)
    const r = await b.essai('authenticated', NEUF, `select ouvrir_contrat('222222', '{5}', '{}', 300, 0, '{}', '{}')`);
    expect(r.erreur).toMatch(/moins de 24 h/);
    // Recevoir reste possible : Bob (ancien) lui propose une carte
    expect((await b.essai('authenticated', BOB, `select ouvrir_contrat('${neuf}', '{6}', '{}', 0, 0, '{}', '{}')`)).ok).toBe(true);
  });
});

describe('salons du duel en ligne (Realtime)', () => {
  const lire = (uid, topic) => b.en('authenticated', uid, 'select count(*)::int n from realtime.messages', { topic });
  const ecrire = (uid, topic) => b.essai('authenticated', uid, `insert into realtime.messages (topic) values ('${topic}')`, { topic });

  it('seuls les membres écoutent et parlent ; seul l\'hôte écrit dans les canaux privés', async () => {
    await b.sql(`insert into realtime.messages (topic) values ('x')`);
    expect((await b.essai('authenticated', BOB, "select salon_entrer('ABCDE', false)")).erreur).toMatch(/n'existe pas/);
    expect((await b.en('authenticated', ALICE, "select salon_entrer('ABCDE', true) as s"))[0].s.hote).toBe(true);
    expect((await b.essai('authenticated', BOB, "select salon_entrer('ABCDE', true)")).erreur).toMatch(/déjà pris/);
    expect((await lire(BOB, 'duel-ABCDE'))[0].n).toBe(0);
    expect((await ecrire(BOB, 'duel-ABCDE')).ok).toBe(false);
    expect((await b.en('authenticated', BOB, "select salon_entrer('ABCDE') as s"))[0].s.hote).toBe(false);
    expect((await lire(BOB, 'duel-ABCDE'))[0].n).toBeGreaterThan(0);
    expect((await ecrire(BOB, 'duel-ABCDE')).ok).toBe(true);
    // Canaux privés : Bob écoute le sien, pas celui d'Alice ; seule Alice (l'hôte) y écrit
    expect((await lire(BOB, 'main-ABCDE-222222'))[0].n).toBeGreaterThan(0);
    expect((await lire(BOB, 'main-ABCDE-111111'))[0].n).toBe(0);
    expect((await ecrire(BOB, 'main-ABCDE-111111')).ok).toBe(false);
    expect((await ecrire(ALICE, 'main-ABCDE-222222')).ok).toBe(true);
    // Un salon dont on n'est pas membre
    expect((await lire(PIRATE, 'duel-ABCDE'))[0].n).toBe(0);
  });

  it('quatre joueurs au plus', async () => {
    await b.en('authenticated', ALICE, "select salon_entrer('QUATR', true)");
    await b.en('authenticated', BOB, "select salon_entrer('QUATR')");
    await b.en('authenticated', PIRATE, "select salon_entrer('QUATR')");
    await b.en('authenticated', NEUF, "select salon_entrer('QUATR')");
    const g = '77777777-7777-7777-7777-777777777777';
    expect((await b.essai('authenticated', g, "select salon_entrer('QUATR')")).erreur).toMatch(/complet/);
  });
});

describe('MJ, journal et suppression de compte', () => {
  it('grant_card : MJ seulement, journalisé ; double authentification exigée si le réglage est activé', async () => {
    expect((await b.essai('authenticated', ALICE, "select grant_card('222222', 2)")).ok).toBe(true);
    expect((await b.sql(`select count(*)::int n from securite.journal where action = 'mj_grant_card'`))[0].n).toBe(1);
    await b.sql(`update securite.reglages set valeur = 'true' where cle = 'mfa_mj'`);
    expect((await b.essai('authenticated', ALICE, "select grant_card('222222', 3)")).erreur).toMatch(/double authentification/);
    expect((await b.essai('authenticated', ALICE, "select grant_card('222222', 3)", { jwt: { aal: 'aal2' } })).ok).toBe(true);
    await b.sql(`update securite.reglages set valeur = 'false' where cle = 'mfa_mj'`);
    // Le bot (sans compte) garde le droit de donner des cartes
    expect((await b.essai('service_role', null, "select grant_card('222222', 4)")).ok).toBe(true);
  });

  it('suppression de compte : seulement après une connexion récente', async () => {
    const id = '99999999-9999-9999-9999-999999999999';
    await b.compte({ id, fournisseur: 'discord', meta: { provider_id: '999999', full_name: 'Partant' } });
    const vieux = { amr: [{ method: 'oauth', timestamp: maintenant() - 3600 }] };
    expect((await b.essai('authenticated', id, "select supprimer_mon_compte('SUPPRIMER')", { jwt: vieux })).erreur).toMatch(/^REAUTH/);
    expect((await b.essai('authenticated', id, "select supprimer_mon_compte('SUPPRIMER')", { jwt: jetonRecent })).ok).toBe(true);
    expect(await b.sql(`select * from players where discord_id = '999999'`)).toHaveLength(0);
    expect(await b.sql('select * from auth.users where id = $1', [id])).toHaveLength(0);
  });
});

describe('limites de débit de l\'API', () => {
  const requete = (role, sub, chemin, ip = '1.2.3.4') => b.essai(role, sub, `select set_config('request.jwt.claims', '${JSON.stringify(sub ? { role, sub } : { role })}', false),
    set_config('request.path', '${chemin}', false), set_config('request.headers', '${JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` })}', false),
    securite.limiter_requete()`);

  it('au-delà de la limite d\'une fonction, la requête est refusée (429)', async () => {
    for (let i = 0; i < 20; i++) expect((await requete('authenticated', BOB, '/rpc/duel_commencer')).ok).toBe(true);
    const r = await requete('authenticated', BOB, '/rpc/duel_commencer');
    expect(r.erreur).toMatch(/Trop de demandes/);
    // Les autres joueurs et les autres fonctions ne sont pas touchés
    expect((await requete('authenticated', ALICE, '/rpc/duel_commencer')).ok).toBe(true);
    expect((await requete('authenticated', BOB, '/rpc/mes_succes')).ok).toBe(true);
  });

  it('les visiteurs sont comptés par adresse IP ; le bot (service_role) jamais', async () => {
    for (let i = 0; i < 10; i++) await requete('anon', null, '/rpc/signaler_erreur', '5.6.7.8');
    expect((await requete('anon', null, '/rpc/signaler_erreur', '5.6.7.8')).erreur).toMatch(/Trop de demandes/);
    expect((await requete('anon', null, '/rpc/signaler_erreur', '9.9.9.9')).ok).toBe(true);
    for (let i = 0; i < 30; i++) expect((await requete('service_role', null, '/rpc/signaler_erreur')).ok).toBe(true);
  });

  it('une panne du compteur ne bloque jamais le jeu', async () => {
    await b.sql('alter table securite.quotas rename to quotas_cache');
    expect((await requete('authenticated', BOB, '/rpc/duel_commencer')).ok).toBe(true);
    await b.sql('alter table securite.quotas_cache rename to quotas');
  });
});
