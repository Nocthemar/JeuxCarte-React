//#region src/data/regles.js
var TRAIT_PAR_NOM = {
	"vultoff": "tenace",
	"elfe des neiges doree": "esquive",
	"elfe des neiges": "esquive",
	"astris, reine de pravorn": "inspiration",
	"gardes de pravorn": "garde",
	"gardes d'aelkor": "provocation",
	"gardes d'erynedhal": "rapide",
	"garde des elfes": "rapide",
	"mange-cœur": "drain",
	"garde de pravorn": "interception",
	"garde d'aelkor": "riposte",
	"garde d'erynedhal": "percee",
	"slime": "tenace",
	"veilleuse ecarlate": "drain"
};
var VEINE_PAR_NOM = {
	"kaeliss": ["sang", "Veine du Sang"],
	"dalek": ["reve", "Veine du Rêve"],
	"seigneur des marais": ["racine", "Veine inconnue"],
	"maitre du jeu": ["destin", "Pouvoir du Destin"],
	"les veines": ["trone", "Les Douze Veines"]
};
var CAP_VEINE = {
	trone: "inspiration",
	chaine: "provocation",
	forge: "bouclier",
	racine: "soin",
	esprit: "soin",
	bete: "charge",
	sang: "drain",
	maree: "riposte",
	tombeau: "riposte",
	ombre: "esquive",
	regard: "percee",
	reve: "interception",
	destin: "bouclier"
};
var BASE = {
	commune: {
		c: 2,
		a: 2,
		d: 1,
		h: 3
	},
	eveillee: {
		c: 3,
		a: 3,
		d: 2,
		h: 4
	},
	mythique: {
		c: 4,
		a: 3,
		d: 3,
		h: 6
	},
	legendaire: {
		c: 5,
		a: 5,
		d: 4,
		h: 9
	},
	transcendante: {
		c: 6,
		a: 6,
		d: 5,
		h: 12,
		act: 2,
		condition: "allie"
	}
};
var UNIQUE_PAR_NOM = {
	"kaeliss": "kaeliss",
	"dalek": "dalek",
	"maitre du jeu": "maitre",
	"elfe des neiges doree": "blizzard",
	"garde de pravorn": "sentinelle",
	"gardes de pravorn": "rangs",
	"gardes d'erynedhal": "vigie",
	"garde des elfes": "vigie",
	"garde d'erynedhal": "neige",
	"garde d'aelkor": "armure",
	"gardes d'aelkor": "marteaux",
	"vultoff": "sanstete",
	"les veines": "entites",
	"astris, reine de pravorn": "reine"
};
var TERRAINS = {
	pravorn: {
		nom: "Lices de Pravorn",
		texte: "Terre de tournois : les unités avec Charge ont +1 Attaque."
	},
	erynedhal: {
		nom: "Neiges d’Erynedhal",
		texte: "Le froid engourdit les bras : un jet de 1 ou 2 est un échec critique."
	},
	aelkor: {
		nom: "Bibliothèques d’Aelkor",
		texte: "La magie y coule à flots : les sorts et les objets coûtent 1 énergie de moins."
	},
	vharos: {
		nom: "Remparts de Vharos",
		texte: "Une forteresse : toutes les unités ont +1 Défense."
	},
	marais: {
		nom: "Marais de Brume",
		texte: "La vase ralentit tout : Charge ne fait plus effet, chaque unité attend son tour."
	},
	ruines: {
		nom: "Ruines hantées",
		texte: "Les morts murmurent : quand une unité meurt, son camp pioche une carte."
	}
};
var TERRAINS_IDS = Object.keys(TERRAINS);
var JETS = [
	{
		q: "echec",
		jet: "1 naturel",
		label: "Échec critique",
		texte: "Raté, et l’attaquant est exposé : -2 Défense jusqu’à son prochain tour."
	},
	{
		q: "faible",
		jet: "2 à 4, sous le seuil",
		label: "Raté",
		texte: "Aucun dégât."
	},
	{
		q: "eraflure",
		jet: "5 ou plus, sous le seuil",
		label: "Éraflure",
		texte: "Le coup passe de justesse : 1 dégât."
	},
	{
		q: "normal",
		jet: "seuil atteint",
		label: "Touché",
		texte: "Dégâts = Attaque."
	},
	{
		q: "solide",
		jet: "seuil + 5",
		label: "Coup solide",
		texte: "+1 dégât."
	},
	{
		q: "critique",
		jet: "20 naturel",
		label: "Critique !",
		texte: "Touche toujours, dégâts doublés."
	}
];
var DESTIN = [
	{
		min: 1,
		max: 1,
		q: "malediction",
		label: "Malédiction",
		texte: "Ton héros subit 3 dégâts."
	},
	{
		min: 2,
		max: 2,
		q: "trahison",
		label: "Trahison",
		texte: "Une de tes unités, au hasard, subit 2 dégâts."
	},
	{
		min: 3,
		max: 3,
		q: "brouillard",
		label: "Brouillard",
		texte: "Une carte de ta main, au hasard, part au Tombeau."
	},
	{
		min: 4,
		max: 4,
		q: "presage",
		label: "Mauvais présage",
		texte: "Ton prochain jet d’attaque a -3."
	},
	{
		min: 5,
		max: 6,
		q: "soin",
		label: "Soin",
		texte: "Ton héros récupère 4 PV."
	},
	{
		min: 7,
		max: 7,
		q: "eclair",
		label: "Éclair",
		texte: "Une unité adverse, au hasard, subit 3 dégâts."
	},
	{
		min: 8,
		max: 9,
		q: "pioche",
		label: "Pioche",
		texte: "Tu pioches 2 cartes."
	},
	{
		min: 10,
		max: 10,
		q: "fortune",
		label: "Fortune",
		texte: "Tu gagnes 2 énergie ce tour."
	},
	{
		min: 11,
		max: 11,
		q: "souffle",
		label: "Second souffle",
		texte: "Tu gagnes 1 action ce tour."
	},
	{
		min: 12,
		max: 13,
		q: "renfort",
		label: "Renfort",
		texte: "Un Milicien de la Couronne (2/1/2) rejoint tes rangs."
	},
	{
		min: 14,
		max: 14,
		q: "armure",
		label: "Armure bénie",
		texte: "Tes unités gagnent +1 Défense pour de bon."
	},
	{
		min: 15,
		max: 15,
		q: "tempete",
		label: "Tempête",
		texte: "Toutes les unités adverses subissent 1 dégât."
	},
	{
		min: 16,
		max: 16,
		q: "prophetie",
		label: "Prophétie",
		texte: "Ton prochain jet d’attaque a +5."
	},
	{
		min: 17,
		max: 17,
		q: "benediction",
		label: "Bénédiction",
		texte: "Tes unités gagnent +1/+1."
	},
	{
		min: 18,
		max: 18,
		q: "chatiment",
		label: "Châtiment",
		texte: "Le héros adverse subit 3 dégâts."
	},
	{
		min: 19,
		max: 19,
		q: "elan",
		label: "Élan héroïque",
		texte: "Tes unités qui ont déjà agi peuvent agir à nouveau ce tour."
	},
	{
		min: 20,
		max: 20,
		q: "grace",
		label: "Grâce divine",
		texte: "Tes unités gagnent +2/+2 et ton héros récupère 3 PV."
	}
];
var DIFFICULTES = {
	facile: {
		pv: 16,
		texte: "L’Ombre oublie parfois ses cartes, frappe au hasard et a moins de vie."
	},
	normal: {
		pv: 20,
		texte: "L’Ombre joue ses meilleures cartes et choisit ses cibles."
	},
	difficile: {
		pv: 24,
		texte: "L’Ombre tente plus souvent le Destin et a plus de vie."
	}
};
//#endregion
//#region src/data/cartes.js
var SORTS = [
	{
		id: "s-forge",
		n: "Étincelle de la Forge",
		c: 1,
		t: "s",
		fx: "unit",
		v: 2,
		veine: "forge",
		d: "Inflige 2 dégâts à une unité adverse."
	},
	{
		id: "s-ombre",
		n: "Morsure de l'Ombre",
		c: 2,
		t: "s",
		fx: "face",
		v: 3,
		veine: "ombre",
		d: "Inflige 3 dégâts au héros adverse."
	},
	{
		id: "s-racine",
		n: "Sève de la Racine",
		c: 2,
		t: "s",
		fx: "heal",
		v: 5,
		veine: "racine",
		d: "Rend 5 PV à ton héros."
	},
	{
		id: "s-trone",
		n: "Serment du Trône",
		c: 2,
		t: "s",
		fx: "buff",
		v: 2,
		veine: "trone",
		d: "Donne +2/+2 à une de tes unités."
	},
	{
		id: "s-regard",
		n: "Vision du Regard",
		c: 3,
		t: "s",
		fx: "draw",
		v: 2,
		veine: "regard",
		d: "Pioche 2 cartes."
	},
	{
		id: "s-sang",
		n: "Saignée",
		c: 4,
		t: "s",
		fx: "unit",
		v: 5,
		veine: "sang",
		d: "Inflige 5 dégâts à une unité adverse."
	},
	{
		id: "s-maree",
		n: "Raz-de-Marée",
		c: 5,
		t: "s",
		fx: "aoe",
		v: 2,
		veine: "maree",
		d: "Inflige 2 dégâts à toutes les unités adverses."
	}
];
var TROUPES = [
	{
		id: "t-ecuyer",
		n: "Écuyer de la Couronne",
		c: 1,
		t: "u",
		a: 1,
		d: 1,
		h: 2,
		caps: ["rapide"],
		veine: "trone",
		icone: "epee"
	},
	{
		id: "t-garde",
		n: "Garde du Pont",
		c: 2,
		t: "u",
		a: 1,
		d: 3,
		h: 3,
		caps: ["garde"],
		veine: "forge",
		icone: "bouclier"
	},
	{
		id: "t-archer",
		n: "Archer des Remparts",
		c: 2,
		t: "u",
		a: 2,
		d: 1,
		h: 2,
		caps: ["percee"],
		veine: "regard",
		icone: "arc"
	},
	{
		id: "t-loup",
		n: "Loup des Cendres",
		c: 2,
		t: "u",
		a: 3,
		d: 1,
		h: 1,
		caps: ["charge"],
		veine: "ombre",
		icone: "croc"
	},
	{
		id: "t-chevalier",
		n: "Chevalier errant",
		c: 3,
		t: "u",
		a: 3,
		d: 2,
		h: 3,
		caps: ["tenace"],
		veine: "trone",
		icone: "epee"
	},
	{
		id: "t-cavalier",
		n: "Cavalier de la Marche",
		c: 3,
		t: "u",
		a: 3,
		d: 1,
		h: 2,
		caps: ["charge"],
		veine: "maree",
		icone: "lance"
	},
	{
		id: "t-sentinelle",
		n: "Sentinelle de pierre",
		c: 4,
		t: "u",
		a: 2,
		d: 4,
		h: 5,
		caps: ["provocation"],
		veine: "racine",
		icone: "bouclier"
	},
	{
		id: "t-lancier",
		n: "Lancier des Ruines",
		c: 4,
		t: "u",
		a: 4,
		d: 2,
		h: 4,
		caps: ["riposte"],
		veine: "sang",
		icone: "lance"
	}
];
var MILICIEN = {
	id: "milicien",
	n: "Milicien de la Couronne",
	c: 1,
	t: "u",
	a: 2,
	d: 1,
	h: 2,
	caps: [],
	veine: null,
	icone: "epee"
};
var CARTES_BASE = [...TROUPES, ...SORTS].sort((a, b) => a.c - b.c);
var OBJETS = [
	{
		id: "o-potion",
		n: "Potion de soin",
		c: 1,
		t: "s",
		fx: "heal",
		v: 4,
		image: "img/Equipement/Potion de soin.webp",
		d: "Rend 4 PV à ton héros."
	},
	{
		id: "o-trousse",
		n: "Trousse de soins",
		c: 3,
		t: "s",
		fx: "heal",
		v: 8,
		image: "img/Equipement/Trousse de soins.webp",
		d: "Rend 8 PV à ton héros."
	},
	{
		id: "o-endu",
		n: "Tonique d'endurance",
		c: 2,
		t: "s",
		fx: "ready",
		v: 1,
		image: "img/Equipement/Tonique d’endurance.webp",
		d: "Une de tes unités peut attaquer une fois de plus ce tour."
	},
	{
		id: "o-rage",
		n: "Tonique de rage",
		c: 2,
		t: "s",
		fx: "rage",
		v: 3,
		image: "img/Equipement/Tonique de rage.webp",
		d: "Une de tes unités gagne +3 attaque mais perd 1 vie."
	},
	{
		id: "o-talisman",
		n: "Talisman du Dé",
		c: 1,
		t: "s",
		fx: "talisman",
		v: 5,
		image: "img/Equipement/Talisman du Dé.webp",
		d: "+5 à ton prochain jet de d20."
	},
	{
		id: "o-coffre",
		n: "Nécessaire d'aventurier",
		c: 1,
		t: "s",
		fx: "coffre",
		v: 1,
		image: "img/Equipement/Nécessaire d’aventurier.webp",
		d: "Ouvre un coffre : pioche 1 carte et regagne 1 énergie."
	},
	{
		id: "o-jeton",
		n: "Jeton du marchand",
		c: 0,
		t: "s",
		fx: "jeton",
		v: 2,
		image: "img/Equipement/Jeton du marchand.webp",
		d: "Ta prochaine carte coûte 2 de moins."
	}
];
//#endregion
//#region src/moteur/hasard.js
var nouvelleGraine = () => Math.floor(Math.random() * 2 ** 32) >>> 0;
function pas(graine) {
	const suivante = graine + 1831565813 | 0;
	let t = Math.imul(suivante ^ suivante >>> 15, 1 | suivante);
	t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
	return {
		graine: suivante >>> 0,
		valeur: ((t ^ t >>> 14) >>> 0) / 4294967296
	};
}
function hasard(etat) {
	if (etat.tirages?.length) return etat.tirages.shift();
	const { graine, valeur } = pas(etat.graine >>> 0);
	etat.graine = graine;
	return valeur;
}
function generateur(graine) {
	const etat = { graine: graine >>> 0 };
	return () => hasard(etat);
}
var d20 = (h) => 1 + Math.floor(h() * 20);
var auHasard = (liste, h) => liste[Math.floor(h() * liste.length)];
function melanger(liste, h) {
	const l = [...liste];
	for (let i = l.length - 1; i > 0; i--) {
		const j = Math.floor(h() * (i + 1));
		[l[i], l[j]] = [l[j], l[i]];
	}
	return l;
}
//#endregion
//#region src/moteur/cartes.js
var actionsDuTour = (tour) => tour >= 5 ? 3 : 2;
var puissance = (p) => p === "∞" ? 120 : Number.isFinite(Number(p)) ? Number(p) : 50;
var sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function uniteDepuisCarte(carte) {
	const rarete = BASE[carte.rarity] ? carte.rarity : "commune";
	const b = BASE[rarete];
	let { c, a, d, h } = b;
	if (carte.rank === 1) {
		a += 1;
		h += 1;
	} else if (carte.rank === 2) h += 1;
	const attaques = [carte.attack_1, carte.attack_2].filter((x) => x?.nom);
	const moyenne = attaques.length ? attaques.reduce((s, x) => s + puissance(x.puissance), 0) / attaques.length : 50;
	if (moyenne >= 80) {
		a += 1;
		h = Math.max(1, h - 1);
	} else if (moyenne <= 35) {
		a = Math.max(1, a - 1);
		d += 1;
	}
	const veines = attaques.map((x) => x.veine).filter(Boolean);
	const cle = sansAccents(carte.name);
	const [veineDetenue = null, veineNom = null] = VEINE_PAR_NOM[cle] ?? [];
	const trait = veineDetenue ? CAP_VEINE[veineDetenue] : TRAIT_PAR_NOM[cle] ?? null;
	if (!["commune", "eveillee"].includes(rarete) && veines.length > 1 && CAP_VEINE[veines[0]] === CAP_VEINE[veines[1]]) d += 1;
	const unique = UNIQUE_PAR_NOM[cle] ?? (rarete === "legendaire" ? "presence" : rarete === "transcendante" ? "fracas" : null);
	return {
		id: `c${carte.id}`,
		n: carte.name,
		c,
		t: "u",
		a,
		d,
		h,
		caps: trait ? [trait] : [],
		veine: veines[0] ?? null,
		act: b.act ?? 1,
		condition: b.condition ?? null,
		unique,
		carte,
		veineNom
	};
}
var cleObjet = (nom) => String(nom).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").trim().toLowerCase();
var objetDepuisNom = (nom) => OBJETS.find((o) => cleObjet(o.n) === cleObjet(nom)) ?? null;
var estObjet = (c) => !!c && OBJETS.some((o) => o.id === c.id);
var estTranscendante = (c) => c?.carte?.rarity === "transcendante";
var estLegendaire = (c) => c?.carte?.rarity === "legendaire";
var copiesMax = (c) => estTranscendante(c) || estLegendaire(c) ? 1 : 2;
function peutAjouter(liste, c) {
	if (!c || liste.length >= 20) return false;
	if (liste.filter((x) => x.id === c.id).length >= copiesMax(c)) return false;
	if (estObjet(c) && liste.filter(estObjet).length >= 4) return false;
	if (estTranscendante(c) && liste.filter(estTranscendante).length >= 1) return false;
	return true;
}
function grimoire(cartes = []) {
	const liste = [];
	const ajouter = (c) => {
		if (!peutAjouter(liste, c)) return false;
		liste.push(c);
		return true;
	};
	cartes.forEach(ajouter);
	for (let tour = 0; tour < 2 && liste.length < 20; tour++) for (const c of CARTES_BASE) ajouter(c);
	return liste;
}
var construireDeck = (cartes, h) => melanger(grimoire(cartes), h);
function coutDe(camp, carte) {
	if (carte.fx === "jeton") return carte.c;
	let cout = carte.c - (camp.reduction ?? 0);
	if (carte.t === "s" && camp.terrainId === "aelkor") cout -= 1;
	return Math.max(0, cout);
}
var actionsDe = (carte) => carte?.act ?? 1;
var capsDe = (x) => x?.caps ?? [];
var aCap = (x, k) => capsDe(x).includes(k);
var rollInfo = (q) => JETS.find((j) => j.q === q);
var destinInfo = (de) => DESTIN.find((j) => de >= j.min && de <= j.max);
function attaqueJouee(def, de) {
	const liste = [def?.carte?.attack_1, def?.carte?.attack_2].filter((x) => x?.nom);
	if (!liste.length) return null;
	const [faible, forte = faible] = [...liste].sort((x, y) => puissance(x.puissance) - puissance(y.puissance));
	const choisie = de >= 15 ? forte : faible;
	return {
		nom: choisie.nom,
		veine: choisie.veine ?? null
	};
}
//#endregion
//#region src/moteur/base.js
var autre = (qui) => qui === "joueur" ? "adverse" : "joueur";
var unites = (camp) => camp.terrain.filter(Boolean);
var trouver = (camp, uid) => camp.terrain.find((u) => u?.uid === uid) ?? null;
var placeLibre = (camp) => camp.terrain.findIndex((u) => !u);
var libre = (p, qui) => p.actif === qui && !p.fini && !p.camps[qui].meditation;
function instancier(p, def) {
	p.compteurUid = (p.compteurUid ?? 0) + 1;
	return {
		uid: p.compteurUid,
		def,
		n: def.n,
		a: def.a,
		d: def.d ?? 1,
		h: def.h,
		hMax: def.h,
		caps: [...capsDe(def)],
		prete: aCap(def, "charge"),
		aAttaque: false,
		defend: false,
		expose: false,
		gele: 0,
		bloquee: false,
		bouclier: aCap(def, "bouclier"),
		esquiveUtilisee: false,
		interceptionUtilisee: false,
		capaciteUtilisee: false
	};
}
function piocher(camp, n = 1) {
	const res = {
		piochees: [],
		brulees: [],
		epuisement: 0
	};
	for (let i = 0; i < n; i++) {
		if (!camp.deck.length) {
			camp.epuisement += 1;
			camp.pv -= camp.epuisement;
			res.epuisement += camp.epuisement;
			continue;
		}
		const carte = camp.deck.shift();
		if (camp.main.length >= 7) {
			res.brulees.push(carte);
			camp.tombeau.push(carte);
		} else {
			camp.main.push(carte);
			res.piochees.push(carte);
		}
	}
	return res;
}
function attaqueDe(p, qui, u) {
	const inspirants = unites(p.camps[qui]).filter((x) => x !== u && aCap(x, "inspiration")).length;
	const terrain = p?.terrainId === "pravorn" && aCap(u, "charge") ? 1 : 0;
	return Math.max(0, u.a + inspirants + terrain);
}
function defenseDe(u, p = null) {
	const terrain = p?.terrainId === "vharos" ? 1 : 0;
	return Math.max(0, u.d + (u.defend ? 2 : 0) - (u.expose ? 2 : 0) + terrain);
}
function seuilDe(p, cible) {
	if (cible.heros) return 10;
	const t = trouver(p.camps[cible.camp], cible.uid);
	return 8 + (t ? defenseDe(t, p) : 0);
}
function chanceDeToucher(p, qui, u, cible) {
	const besoin = seuilDe(p, cible) - attaqueDe(p, qui, u) - (p.camps[qui].bonusDe ?? 0);
	return Math.min(.95, Math.max(.05, (21 - besoin) / 20));
}
var peutAttaquer = (u) => !!u && u.prete && !u.aAttaque && !u.bloquee && u.a > 0;
var peutDefendre = (u) => !!u && u.prete && (!u.aAttaque || aCap(u, "rapide")) && !u.bloquee && !u.defend;
function encaisser(u, degats) {
	u.h -= degats;
	if (u.h > 0 || !aCap(u, "tenace") || u.tenaceUtilisee) return false;
	u.h = 1;
	u.tenaceUtilisee = true;
	return true;
}
var memeCible = (x, y) => x.camp === y.camp && (x.heros ? y.heros : x.uid === y.uid);
function nettoyer(p) {
	const morts = [];
	for (const qui of ["joueur", "adverse"]) {
		const camp = p.camps[qui];
		let tombes = 0;
		camp.terrain = camp.terrain.map((u) => {
			if (u && u.h <= 0) {
				morts.push(u.uid);
				tombes += 1;
				if (u.def && u.def.id !== MILICIEN.id) camp.tombeau.push(u.def);
				return null;
			}
			return u;
		});
		if (!tombes) continue;
		if (p.terrainId === "ruines") piocher(camp, tombes);
	}
	const joueurTombe = p.camps.joueur.pv <= 0;
	const adverseTombe = p.camps.adverse.pv <= 0;
	if (joueurTombe && adverseTombe) p.fini = "egalite";
	else if (joueurTombe) p.fini = "adverse";
	else if (adverseTombe) p.fini = "joueur";
	return morts;
}
function blesser(p, campCible, t, degats, ev, source) {
	if (!t || degats <= 0) return 0;
	if (t.bouclier) {
		t.bouclier = false;
		ev.touches.push({
			camp: campCible,
			uid: t.uid,
			texte: "Bouclier !",
			etat: true
		});
		return 0;
	}
	const tenace = encaisser(t, degats);
	if (source) p.camps[source].stats.degats += degats;
	ev.touches.push({
		camp: campCible,
		uid: t.uid,
		valeur: degats
	});
	if (tenace) ev.touches.push({
		camp: campCible,
		uid: t.uid,
		texte: "Tenace !",
		etat: true
	});
	return degats;
}
function soignerHeros(camp, v, qui, ev) {
	const avant = camp.pv;
	camp.pv = Math.min(camp.pvMax, camp.pv + v);
	ev.touches.push({
		camp: qui,
		heros: true,
		valeur: camp.pv - avant,
		soin: true
	});
}
//#endregion
//#region src/moteur/destin.js
function appliquerDestin(p, qui, de, ev) {
	const camp = p.camps[qui];
	const adv = autre(qui);
	const info = destinInfo(de);
	const h = () => hasard(p);
	switch (info.q) {
		case "malediction":
			camp.pv -= 3;
			ev.touches.push({
				camp: qui,
				heros: true,
				valeur: 3
			});
			break;
		case "trahison": {
			const u = auHasard(unites(camp), h);
			if (u) blesser(p, qui, u, 2, ev, null);
			break;
		}
		case "brouillard":
			if (camp.main.length) {
				const [carte] = camp.main.splice(Math.floor(h() * camp.main.length), 1);
				camp.tombeau.push(carte);
				ev.touches.push({
					camp: qui,
					heros: true,
					texte: `${carte.n} part au Tombeau`,
					etat: true
				});
			}
			break;
		case "presage":
			camp.bonusDe = (camp.bonusDe ?? 0) - 3;
			ev.touches.push({
				camp: qui,
				heros: true,
				texte: "-3 au prochain jet",
				etat: true
			});
			break;
		case "eclair": {
			const u = auHasard(unites(p.camps[adv]), h);
			if (u) blesser(p, adv, u, 3, ev, qui);
			break;
		}
		case "fortune":
			camp.energie = Math.min(12, camp.energie + 2);
			ev.touches.push({
				camp: qui,
				heros: true,
				texte: "+2 énergie",
				buff: true
			});
			break;
		case "souffle":
			camp.actions += 1;
			ev.touches.push({
				camp: qui,
				heros: true,
				texte: "+1 action",
				buff: true
			});
			break;
		case "armure":
			unites(camp).forEach((u) => {
				u.d += 1;
				ev.touches.push({
					camp: qui,
					uid: u.uid,
					texte: "+1 Défense",
					buff: true
				});
			});
			break;
		case "tempete":
			unites(p.camps[adv]).forEach((u) => blesser(p, adv, u, 1, ev, qui));
			break;
		case "prophetie":
			camp.bonusDe = (camp.bonusDe ?? 0) + 5;
			ev.touches.push({
				camp: qui,
				heros: true,
				texte: "+5 au prochain jet",
				buff: true
			});
			break;
		case "chatiment":
			p.camps[adv].pv -= 3;
			camp.stats.degats += 3;
			ev.touches.push({
				camp: adv,
				heros: true,
				valeur: 3
			});
			break;
		case "elan":
			unites(camp).filter((u) => u.aAttaque && !u.bloquee).forEach((u) => {
				u.aAttaque = false;
				u.defend = false;
				u.prete = true;
				ev.touches.push({
					camp: qui,
					uid: u.uid,
					texte: "De nouveau prête !",
					buff: true
				});
			});
			break;
		case "soin":
			soignerHeros(camp, 4, qui, ev);
			break;
		case "pioche":
			ev.pioche = piocher(camp, 2);
			break;
		case "renfort": {
			const place = placeLibre(camp);
			if (place >= 0) {
				const u = instancier(p, MILICIEN);
				camp.terrain[place] = u;
				ev.renfort = u.uid;
			} else ev.complet = true;
			break;
		}
		case "benediction":
		case "grace": {
			const bonus = info.q === "grace" ? 2 : 1;
			unites(camp).forEach((u) => {
				u.a += bonus;
				u.h += bonus;
				u.hMax += bonus;
				ev.touches.push({
					camp: qui,
					uid: u.uid,
					valeur: bonus,
					buff: true
				});
			});
			if (info.q === "grace") soignerHeros(camp, 3, qui, ev);
			break;
		}
	}
	return info;
}
//#endregion
//#region src/moteur/uniques.js
var UNIQUES = {
	kaeliss: {
		nom: "Cœur Immuable",
		texte: "À son arrivée, ton héros récupère 4 PV.",
		arrivee(p, qui, u, ev) {
			soignerHeros(p.camps[qui], 4, qui, ev);
		},
		actif: {
			nom: "Maître du Flot",
			cout: 3,
			cible: "ennemi",
			texte: "3 énergie : inflige 2 dégâts à une unité adverse ; Kaéliss récupère autant de PV.",
			effet(p, qui, u, cible, ev) {
				const t = trouver(p.camps[autre(qui)], cible.uid);
				const inflige = blesser(p, autre(qui), t, 2, ev, qui);
				if (inflige <= 0) return;
				const avant = u.h;
				u.h = Math.min(u.hMax, u.h + inflige);
				if (u.h > avant) ev.touches.push({
					camp: qui,
					uid: u.uid,
					valeur: u.h - avant,
					soin: true
				});
			}
		}
	},
	dalek: {
		nom: "Seigneur des Rêves",
		texte: "À son arrivée, endort l’unité adverse la plus forte : elle ne pourra ni attaquer ni défendre à son prochain tour.",
		arrivee(p, qui, u, ev) {
			const t = [...unites(p.camps[autre(qui)])].sort((x, y) => y.a - x.a)[0];
			if (t) {
				t.gele = 1;
				ev.touches.push({
					camp: autre(qui),
					uid: t.uid,
					texte: "Endormie",
					etat: true
				});
			}
		},
		actif: {
			nom: "Marcheur d’Esprit",
			cout: 2,
			cible: "ennemi",
			utile: (p, qui) => unites(p.camps[autre(qui)]).some((t) => !t.gele && t.a >= 3),
			texte: "2 énergie : endort une unité adverse : elle ne pourra ni attaquer ni défendre à son prochain tour.",
			effet(p, qui, u, cible, ev) {
				const t = trouver(p.camps[autre(qui)], cible.uid);
				if (t) {
					t.gele = 1;
					ev.touches.push({
						camp: autre(qui),
						uid: t.uid,
						texte: "Endormie",
						etat: true
					});
				}
			}
		}
	},
	maitre: {
		nom: "Coup du Sort",
		texte: "À son arrivée, lance un Jet du Destin gratuit : deux d20, le meilleur est gardé.",
		arrivee(p, qui, u, ev) {
			const h = () => hasard(p);
			const de = Math.max(d20(h), d20(h));
			ev.destin = {
				de,
				info: destinInfo(de)
			};
			appliquerDestin(p, qui, de, ev);
		},
		actif: {
			nom: "Plume du Codex",
			cout: 2,
			cible: null,
			utile: (p, qui) => !p.camps[qui].prochainCritique && unites(p.camps[qui]).some((x) => peutAttaquer(x) && x.a >= 3),
			texte: "2 énergie : ton prochain jet d’attaque est un 20 naturel.",
			effet(p, qui, u, cible, ev) {
				p.camps[qui].prochainCritique = true;
				ev.touches.push({
					camp: qui,
					heros: true,
					texte: "Prochain jet : 20 !",
					buff: true
				});
			}
		}
	},
	blizzard: {
		nom: "Blizzard d’Erynedhal",
		texte: "À son arrivée, gèle toutes les unités adverses : elles ne pourront ni attaquer ni défendre à leur prochain tour.",
		arrivee(p, qui, u, ev) {
			unites(p.camps[autre(qui)]).forEach((t) => {
				t.gele = 1;
				ev.touches.push({
					camp: autre(qui),
					uid: t.uid,
					texte: "Gelée",
					etat: true
				});
			});
		}
	},
	sentinelle: {
		nom: "Sentinelle de Pravorn",
		texte: "À son arrivée, prend la Garde : tant qu’il est en jeu, ton héros ne peut pas être attaqué.",
		arrivee(p, qui, u, ev) {
			if (!u.caps.includes("garde")) u.caps.push("garde");
			ev.touches.push({
				camp: qui,
				uid: u.uid,
				texte: "Garde",
				buff: true
			});
		}
	},
	rangs: {
		nom: "Rangs serrés",
		texte: "À son arrivée, tes autres unités gagnent +1 Défense pour de bon.",
		arrivee(p, qui, u, ev) {
			unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => {
				x.d += 1;
				ev.touches.push({
					camp: qui,
					uid: x.uid,
					texte: "+1 Défense",
					buff: true
				});
			});
		}
	},
	neige: {
		nom: "Pas dans la neige",
		texte: "À son arrivée, gagne Esquive : la première attaque qui la vise à chaque tour adverse lance deux d20 et garde le plus bas.",
		arrivee(p, qui, u, ev) {
			if (!u.caps.includes("esquive")) u.caps.push("esquive");
			ev.touches.push({
				camp: qui,
				uid: u.uid,
				texte: "Esquive",
				buff: true
			});
		}
	},
	vigie: {
		nom: "Vigie d’Erynedhal",
		texte: "À son arrivée, gèle l’unité adverse la plus forte : elle ne pourra ni attaquer ni défendre à son prochain tour.",
		arrivee(p, qui, u, ev) {
			const t = [...unites(p.camps[autre(qui)])].sort((x, y) => y.a - x.a)[0];
			if (t) {
				t.gele = 1;
				ev.touches.push({
					camp: autre(qui),
					uid: t.uid,
					texte: "Gelée",
					etat: true
				});
			}
		}
	},
	armure: {
		nom: "Armure naine",
		texte: "À son arrivée, gagne Bouclier : les premiers dégâts qu’il subit sont annulés.",
		arrivee(p, qui, u, ev) {
			u.bouclier = true;
			if (!u.caps.includes("bouclier")) u.caps.push("bouclier");
			ev.touches.push({
				camp: qui,
				uid: u.uid,
				texte: "Bouclier",
				buff: true
			});
		}
	},
	marteaux: {
		nom: "Marteaux d’Aelkor",
		texte: "À son arrivée, tes autres unités gagnent +1 Attaque pour de bon.",
		arrivee(p, qui, u, ev) {
			unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => {
				x.a += 1;
				ev.touches.push({
					camp: qui,
					uid: x.uid,
					texte: "+1 Attaque",
					buff: true
				});
			});
		}
	},
	sanstete: {
		nom: "Le Sans-Tête",
		texte: "À son arrivée, inflige 3 dégâts au héros adverse ; ton héros récupère autant de PV.",
		arrivee(p, qui, u, ev) {
			p.camps[autre(qui)].pv -= 3;
			p.camps[qui].stats.degats += 3;
			ev.touches.push({
				camp: autre(qui),
				heros: true,
				valeur: 3
			});
			soignerHeros(p.camps[qui], 3, qui, ev);
		},
		actif: {
			nom: "Sentence du Sans-Tête",
			cout: 2,
			cible: "ennemi",
			texte: "2 énergie : inflige 2 dégâts à une unité adverse ; si elle tombe, ton héros récupère 2 PV.",
			effet(p, qui, u, cible, ev) {
				const t = trouver(p.camps[autre(qui)], cible.uid);
				if (blesser(p, autre(qui), t, 2, ev, qui) > 0 && t.h <= 0) soignerHeros(p.camps[qui], 2, qui, ev);
			}
		}
	},
	entites: {
		nom: "Éveil des Entités",
		texte: "À son arrivée, tes autres unités gagnent +1 Attaque et +1 Défense pour de bon, et ton héros récupère 4 PV.",
		arrivee(p, qui, u, ev) {
			unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => {
				x.a += 1;
				x.d += 1;
				ev.touches.push({
					camp: qui,
					uid: x.uid,
					texte: "+1 / +1",
					buff: true
				});
			});
			soignerHeros(p.camps[qui], 4, qui, ev);
		}
	},
	reine: {
		nom: "Appel de la Couronne",
		texte: "À son arrivée, un Milicien de la Couronne (2 / 1 / 2) rejoint ta rangée s’il reste une place.",
		arrivee(p, qui, u, ev) {
			const camp = p.camps[qui];
			const place = placeLibre(camp);
			if (place < 0) return;
			const m = instancier(p, MILICIEN);
			camp.terrain[place] = m;
			ev.renfort = m.uid;
		}
	},
	presence: {
		nom: "Présence",
		texte: "À son arrivée, tes autres unités gagnent +1 Attaque pour de bon.",
		arrivee(p, qui, u, ev) {
			unites(p.camps[qui]).filter((x) => x !== u).forEach((x) => {
				x.a += 1;
				ev.touches.push({
					camp: qui,
					uid: x.uid,
					texte: "+1 Attaque",
					buff: true
				});
			});
		}
	},
	fracas: {
		nom: "Entrée fracassante",
		texte: "À son arrivée, inflige 2 dégâts à toutes les unités adverses.",
		arrivee(p, qui, u, ev) {
			unites(p.camps[autre(qui)]).forEach((t) => blesser(p, autre(qui), t, 2, ev, qui));
		}
	}
};
//#endregion
//#region src/moteur/partie.js
function creerCamp(nom, deck) {
	return {
		nom,
		pv: 20,
		pvMax: 20,
		energie: 0,
		energieMax: 0,
		actions: 0,
		actionsMax: 0,
		destinUtilise: false,
		deck,
		main: [],
		tombeau: [],
		terrain: Array(5).fill(null),
		epuisement: 0,
		defausseUtilisee: false,
		mediterUtilise: false,
		meditation: null,
		stats: {
			jets: 0,
			critiques: 0,
			echecs: 0,
			cartes: 0,
			degats: 0,
			destins: 0
		},
		toursJoues: 0
	};
}
function creerPartie(deckJoueur, deckAdverse, nomJoueur, nomAdverse, premier, options = {}) {
	const p = {
		graine: (options.graine ?? nouvelleGraine()) >>> 0,
		compteurUid: 0
	};
	const h = () => hasard(p);
	const terrainId = TERRAINS[options.terrain] ? options.terrain : auHasard(TERRAINS_IDS, h);
	Object.assign(p, {
		camps: {
			joueur: creerCamp(nomJoueur, melanger(deckJoueur, h)),
			adverse: creerCamp(nomAdverse, melanger(deckAdverse, h))
		},
		actif: premier,
		tour: 0,
		fini: null,
		terrainId,
		renvoi: {
			joueur: false,
			adverse: false
		},
		jets: []
	});
	p.camps.joueur.terrainId = p.camps.adverse.terrainId = terrainId;
	if (options.pvAdverse > 0) p.camps.adverse.pv = p.camps.adverse.pvMax = options.pvAdverse;
	if (options.energieBonusAdverse > 0) p.camps.adverse.energieBonus = options.energieBonusAdverse;
	piocher(p.camps[premier], 3);
	piocher(p.camps[autre(premier)], 4);
	return p;
}
var renvoiFini = (p) => !!p.renvoi && p.renvoi.joueur && p.renvoi.adverse;
function renvoyerMain(p, qui, indices = []) {
	if (!p.renvoi || p.renvoi[qui] || p.fini) return null;
	const camp = p.camps[qui];
	const renvoyees = [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < camp.main.length).sort((x, y) => y - x).map((i) => camp.main.splice(i, 1)[0]);
	camp.deck = melanger([...camp.deck, ...renvoyees], () => hasard(p));
	const pioche = piocher(camp, renvoyees.length);
	p.renvoi[qui] = true;
	return {
		type: "renvoi",
		qui,
		n: renvoyees.length,
		pioche
	};
}
var PERSONNEL = [
	"nom",
	"deck",
	"main",
	"energie",
	"energieMax",
	"energieBonus",
	"actions",
	"actionsMax",
	"destinUtilise",
	"defausseUtilisee",
	"mediterUtilise",
	"meditation",
	"epuisement",
	"stats"
];
var extraire = (camp) => Object.fromEntries(PERSONNEL.map((k) => [k, camp[k]]));
var charger = (camp, m) => PERSONNEL.forEach((k) => {
	camp[k] = m[k];
});
function passerLaMain(camp, i) {
	if (!camp.membres || i === camp.membreActif) return;
	camp.membres[camp.membreActif] = extraire(camp);
	camp.membreActif = i;
	charger(camp, camp.membres[i]);
}
function renvoyerMainMembre(p, qui, i, indices = []) {
	const camp = p.camps[qui];
	if (!camp.membres || !p.renvoiSieges || p.renvoiSieges[qui][i] !== false || p.fini) return null;
	const actif = camp.membreActif;
	passerLaMain(camp, i);
	p.renvoi[qui] = false;
	const ev = renvoyerMain(p, qui, indices);
	passerLaMain(camp, actif);
	p.renvoiSieges[qui][i] = true;
	p.renvoi[qui] = p.renvoiSieges[qui].every(Boolean);
	return ev && {
		...ev,
		membre: i
	};
}
function debutTour(p) {
	const qui = p.actif;
	const camp = p.camps[qui];
	if (camp.membres) {
		if (camp.aJoue) passerLaMain(camp, (camp.membreActif + 1) % camp.membres.length);
		camp.aJoue = true;
	}
	if (qui === "joueur" || p.tour === 0) p.tour += 1;
	camp.toursJoues = (camp.toursJoues ?? 0) + 1;
	camp.energieMax = Math.min(10, camp.energieMax + 1);
	camp.energie = Math.min(10, camp.energieMax + (camp.energieBonus ?? 0));
	camp.actionsMax = actionsDuTour(camp.toursJoues);
	camp.actions = camp.actionsMax;
	camp.destinUtilise = false;
	camp.defausseUtilisee = false;
	camp.mediterUtilise = false;
	unites(camp).forEach((u) => {
		u.prete = true;
		u.aAttaque = false;
		u.defend = false;
		u.expose = false;
		u.capaciteUtilisee = false;
		u.bloquee = u.gele > 0;
		u.gele = 0;
	});
	unites(p.camps[autre(qui)]).forEach((u) => {
		u.esquiveUtilisee = false;
		u.interceptionUtilisee = false;
	});
	const ev = {
		type: "tour",
		qui,
		pioche: piocher(camp, 1),
		touches: []
	};
	unites(camp).filter((u) => aCap(u, "soin")).forEach(() => {
		const blessee = unites(camp).filter((x) => x.h < x.hMax).sort((x, y) => y.hMax - y.h - (x.hMax - x.h))[0];
		if (blessee) {
			const avant = blessee.h;
			blessee.h = Math.min(blessee.hMax, blessee.h + 2);
			ev.touches.push({
				camp: qui,
				uid: blessee.uid,
				valeur: blessee.h - avant,
				soin: true
			});
		} else soignerHeros(camp, 2, qui, ev);
	});
	if (ev.pioche.epuisement) ev.fatigue = ev.pioche.epuisement;
	nettoyer(p);
	return ev;
}
function finTour(p) {
	p.actif = autre(p.actif);
}
function peutJouer(p, qui, index) {
	const camp = p.camps[qui];
	const carte = camp.main[index];
	if (!carte || !libre(p, qui) || coutDe(camp, carte) > camp.energie || actionsDe(carte) > camp.actions) return false;
	if (carte.t === "u") {
		if (carte.condition === "allie" && !unites(camp).length) return false;
		return placeLibre(camp) >= 0;
	}
	if (carte.fx === "unit") return unites(p.camps[autre(qui)]).length > 0;
	if (carte.fx === "buff" || carte.fx === "rage") return unites(camp).length > 0;
	if (carte.fx === "ready") return unites(camp).some((u) => u.aAttaque && u.a > 0 && !u.bloquee);
	return true;
}
function ciblesSort(p, qui, carte) {
	if (carte.fx === "unit") return unites(p.camps[autre(qui)]).map((u) => ({
		camp: autre(qui),
		uid: u.uid
	}));
	if (carte.fx === "buff" || carte.fx === "rage") return unites(p.camps[qui]).map((u) => ({
		camp: qui,
		uid: u.uid
	}));
	if (carte.fx === "ready") return unites(p.camps[qui]).filter((u) => u.aAttaque && u.a > 0 && !u.bloquee).map((u) => ({
		camp: qui,
		uid: u.uid
	}));
	return null;
}
function jouer(p, qui, index, cible = null) {
	if (!peutJouer(p, qui, index)) return null;
	const camp = p.camps[qui];
	const carte = camp.main[index];
	const cibles = carte.t === "s" ? ciblesSort(p, qui, carte) : null;
	if (cibles && !cibles.some((c) => cible && memeCible(c, cible))) return null;
	camp.main.splice(index, 1);
	camp.energie -= coutDe(camp, carte);
	camp.actions -= actionsDe(carte);
	if (carte.fx !== "jeton") camp.reduction = 0;
	camp.stats.cartes += 1;
	const ev = {
		type: carte.t === "u" ? "pose" : "sort",
		qui,
		carte,
		cible,
		index,
		touches: []
	};
	if (carte.t === "u") {
		const place = placeLibre(camp);
		const u = instancier(p, carte);
		if (p.terrainId === "marais") u.prete = false;
		camp.terrain[place] = u;
		ev.uid = u.uid;
		ev.place = place;
		const unique = UNIQUES[carte.unique];
		if (unique?.arrivee) {
			ev.effet = {
				nom: unique.nom,
				texte: unique.texte
			};
			unique.arrivee(p, qui, u, ev);
		}
		ev.morts = nettoyer(p);
		return ev;
	}
	cast(p, qui, carte, cible, ev);
	camp.tombeau.push(carte);
	ev.morts = nettoyer(p);
	return ev;
}
function cast(p, qui, carte, cible, ev) {
	const camp = p.camps[qui];
	const adverse = p.camps[autre(qui)];
	switch (carte.fx) {
		case "unit":
			blesser(p, autre(qui), trouver(adverse, cible.uid), carte.v, ev, qui);
			break;
		case "face":
			adverse.pv -= carte.v;
			camp.stats.degats += carte.v;
			ev.touches.push({
				camp: autre(qui),
				heros: true,
				valeur: carte.v
			});
			break;
		case "heal":
			soignerHeros(camp, carte.v, qui, ev);
			break;
		case "buff": {
			const u = trouver(camp, cible.uid);
			u.a += carte.v;
			u.h += carte.v;
			u.hMax += carte.v;
			ev.touches.push({
				camp: qui,
				uid: u.uid,
				valeur: carte.v,
				buff: true
			});
			break;
		}
		case "draw":
			ev.pioche = piocher(camp, carte.v);
			break;
		case "ready": {
			const u = trouver(camp, cible.uid);
			u.aAttaque = false;
			u.defend = false;
			u.prete = true;
			ev.touches.push({
				camp: qui,
				uid: u.uid,
				texte: "Encore une attaque !",
				buff: true
			});
			break;
		}
		case "rage": {
			const u = trouver(camp, cible.uid);
			u.a += carte.v;
			u.h = Math.max(1, u.h - 1);
			ev.touches.push({
				camp: qui,
				uid: u.uid,
				texte: `+${carte.v} attaque`,
				buff: true
			});
			break;
		}
		case "talisman":
			camp.bonusDe = (camp.bonusDe ?? 0) + carte.v;
			ev.touches.push({
				camp: qui,
				heros: true,
				texte: `+${carte.v} au prochain d20`,
				buff: true
			});
			break;
		case "coffre":
			ev.pioche = piocher(camp, 1);
			camp.energie = camp.energie >= 10 ? camp.energie + 1 : Math.min(10, camp.energie + 1);
			ev.touches.push({
				camp: qui,
				heros: true,
				texte: "+1 énergie",
				buff: true
			});
			break;
		case "jeton":
			camp.reduction = (camp.reduction ?? 0) + carte.v;
			ev.touches.push({
				camp: qui,
				heros: true,
				texte: `Prochaine carte -${carte.v}`,
				buff: true
			});
			break;
		case "aoe": unites(adverse).forEach((u) => blesser(p, autre(qui), u, carte.v, ev, qui));
	}
}
function defendre(p, qui, uid) {
	const camp = p.camps[qui];
	const u = trouver(camp, uid);
	if (!libre(p, qui) || camp.actions < 1 || !peutDefendre(u)) return null;
	camp.actions -= 1;
	u.defend = true;
	u.aAttaque = true;
	return {
		type: "defense",
		qui,
		uid,
		n: u.n
	};
}
var capaciteActive = (u) => UNIQUES[u?.def?.unique]?.actif ?? null;
function peutActiver(p, qui, uid) {
	const camp = p.camps[qui];
	const u = trouver(camp, uid);
	const act = capaciteActive(u);
	if (!act || !libre(p, qui) || u.capaciteUtilisee || u.bloquee || camp.energie < act.cout) return false;
	return act.cible !== "ennemi" || unites(p.camps[autre(qui)]).length > 0;
}
function ciblesCapacite(p, qui, uid) {
	const act = capaciteActive(trouver(p.camps[qui], uid));
	if (act?.cible === "ennemi") return unites(p.camps[autre(qui)]).map((u) => ({
		camp: autre(qui),
		uid: u.uid
	}));
	if (act?.cible === "allie") return unites(p.camps[qui]).map((u) => ({
		camp: qui,
		uid: u.uid
	}));
	return null;
}
function activer(p, qui, uid, cible = null) {
	if (!peutActiver(p, qui, uid)) return null;
	const camp = p.camps[qui];
	const u = trouver(camp, uid);
	const act = capaciteActive(u);
	const cibles = ciblesCapacite(p, qui, uid);
	if (cibles && !cibles.some((c) => cible && memeCible(c, cible))) return null;
	camp.energie -= act.cout;
	u.capaciteUtilisee = true;
	const ev = {
		type: "capacite",
		qui,
		uid,
		cible,
		nom: act.nom,
		texte: act.texte,
		n: u.n,
		veine: u.def.veine,
		touches: []
	};
	act.effet(p, qui, u, cible, ev);
	ev.morts = nettoyer(p);
	return ev;
}
var peutDefausser = (p, qui) => {
	const camp = p.camps[qui];
	return libre(p, qui) && !camp.defausseUtilisee && camp.energie >= 1 && camp.main.length > 0;
};
function defausser(p, qui, index) {
	if (!peutDefausser(p, qui)) return null;
	const camp = p.camps[qui];
	const carte = camp.main[index];
	if (!carte) return null;
	camp.main.splice(index, 1);
	camp.energie -= 1;
	camp.defausseUtilisee = true;
	camp.tombeau.push(carte);
	const ev = {
		type: "defausse",
		qui,
		carte,
		pioche: piocher(camp, 1)
	};
	ev.morts = nettoyer(p);
	return ev;
}
var peutMediter = (p, qui) => {
	const camp = p.camps[qui];
	return libre(p, qui) && !camp.mediterUtilise && camp.energie >= 1 && camp.deck.length > 0;
};
function mediter(p, qui) {
	if (!peutMediter(p, qui)) return null;
	const camp = p.camps[qui];
	camp.energie -= 1;
	camp.mediterUtilise = true;
	camp.meditation = camp.deck.slice(0, 3);
	return {
		type: "mediter",
		qui,
		cartes: camp.meditation
	};
}
function placerSous(p, qui, index = null) {
	const camp = p.camps[qui];
	if (!camp.meditation || p.actif !== qui) return null;
	let carte = null;
	if (Number.isInteger(index) && index >= 0 && index < camp.meditation.length) {
		[carte] = camp.deck.splice(index, 1);
		camp.deck.push(carte);
	}
	camp.meditation = null;
	return {
		type: "placer",
		qui,
		sous: !!carte
	};
}
function ciblesAttaque(p, qui, uid = null) {
	const adv = autre(qui);
	const ennemis = unites(p.camps[adv]);
	const perce = uid != null && aCap(trouver(p.camps[qui], uid), "percee");
	const provoc = perce ? [] : ennemis.filter((u) => aCap(u, "provocation"));
	const liste = (provoc.length ? provoc : ennemis).map((u) => ({
		camp: adv,
		uid: u.uid
	}));
	const garde = !perce && ennemis.some((u) => aCap(u, "garde"));
	if (!provoc.length && !garde) liste.push({
		camp: adv,
		heros: true
	});
	return liste;
}
function attaquer(p, qui, uid, cible) {
	const camp = p.camps[qui];
	const adv = autre(qui);
	const adverse = p.camps[adv];
	const u = trouver(camp, uid);
	if (!libre(p, qui) || camp.actions < 1 || !peutAttaquer(u)) return null;
	if (!cible || !ciblesAttaque(p, qui, uid).some((c) => memeCible(c, cible))) return null;
	camp.actions -= 1;
	u.aAttaque = true;
	const ev = {
		type: "attaque",
		qui,
		uid,
		cible,
		n: u.n,
		touches: [],
		riposte: 0
	};
	const h = () => hasard(p);
	if (cible.heros && !aCap(u, "percee")) {
		const garde = unites(adverse).find((x) => aCap(x, "interception") && !x.interceptionUtilisee);
		if (garde) {
			garde.interceptionUtilisee = true;
			ev.interception = {
				uid: garde.uid,
				n: garde.n
			};
			cible = {
				camp: adv,
				uid: garde.uid
			};
			ev.cible = cible;
		}
	}
	const t = cible.heros ? null : trouver(adverse, cible.uid);
	let des = [d20(h)];
	if (t && aCap(t, "esquive") && !t.esquiveUtilisee) {
		t.esquiveUtilisee = true;
		des.push(d20(h));
		ev.esquive = true;
	}
	let de = Math.min(...des);
	if (camp.prochainCritique) {
		de = 20;
		des = [20];
		camp.prochainCritique = false;
	}
	const bonus = camp.bonusDe ?? 0;
	camp.bonusDe = 0;
	const atk = attaqueDe(p, qui, u);
	const seuil = seuilDe(p, cible);
	const total = de + atk + bonus;
	const q = de === 1 || de === 2 && p.terrainId === "erynedhal" ? "echec" : de === 20 ? "critique" : total >= seuil + 5 ? "solide" : total >= seuil ? "normal" : de >= 5 ? "eraflure" : "faible";
	const info = rollInfo(q);
	Object.assign(ev, {
		de,
		des,
		bonus,
		atk,
		total,
		seuil,
		info,
		attaque: attaqueJouee(u.def, de)
	});
	camp.stats.jets += 1;
	if (q === "critique") camp.stats.critiques += 1;
	if (q === "echec") camp.stats.echecs += 1;
	let degats = q === "critique" ? atk * 2 : q === "solide" ? atk + 1 : q === "normal" ? atk : q === "eraflure" ? Math.min(1, atk) : 0;
	if (q === "echec") {
		u.expose = true;
		ev.expose = true;
	}
	if (degats > 0) {
		if (cible.heros) {
			adverse.pv -= degats;
			camp.stats.degats += degats;
		} else if (t.bouclier) {
			t.bouclier = false;
			ev.bouclier = true;
			degats = 0;
		} else {
			if (encaisser(t, degats)) ev.tenace = {
				camp: adv,
				uid: t.uid
			};
			camp.stats.degats += degats;
		}
	}
	ev.degats = degats;
	if (degats > 0 && aCap(u, "drain")) {
		const avant = camp.pv;
		camp.pv = Math.min(camp.pvMax, camp.pv + degats);
		ev.drain = camp.pv - avant;
	}
	if (t && t.h > 0 && (aCap(t, "riposte") || t.defend) && t.a > 0) {
		const coup = attaqueDe(p, adv, t);
		if (u.bouclier) {
			u.bouclier = false;
			ev.bouclierAttaquant = true;
		} else {
			if (encaisser(u, coup)) ev.tenaceAttaquant = {
				camp: qui,
				uid: u.uid
			};
			ev.riposte = coup;
		}
	}
	const esquive = des.length > 1 ? `Esquive : ${des.join(" et ")} · ` : "";
	p.jets.unshift({
		qui,
		de,
		q,
		label: info.label,
		quoi: `${u.n} attaque`,
		detail: `${esquive}${total} contre ${seuil}`
	});
	p.jets.length = Math.min(p.jets.length, 8);
	ev.morts = nettoyer(p);
	return ev;
}
var peutDestin = (p, qui) => libre(p, qui) && !p.camps[qui].destinUtilise && p.camps[qui].energie >= 2;
function destin(p, qui) {
	if (!peutDestin(p, qui)) return null;
	const camp = p.camps[qui];
	camp.energie -= 2;
	camp.destinUtilise = true;
	camp.stats.destins += 1;
	camp.stats.jets += 1;
	let de = d20(() => hasard(p));
	if (camp.bonusDe) {
		de = Math.max(1, Math.min(20, de + camp.bonusDe));
		camp.bonusDe = 0;
	}
	if (de === 20) camp.stats.critiques += 1;
	if (de === 1) camp.stats.echecs += 1;
	const ev = {
		type: "destin",
		qui,
		de,
		touches: []
	};
	ev.info = appliquerDestin(p, qui, de, ev);
	ev.uid = ev.renfort;
	p.jets.unshift({
		qui,
		de,
		q: ev.info.q,
		label: ev.info.label,
		quoi: "Jet du Destin",
		destin: true
	});
	p.jets.length = Math.min(p.jets.length, 8);
	ev.morts = nettoyer(p);
	return ev;
}
//#endregion
//#region src/moteur/ia.js
var CHANCE_DESTIN = {
	facile: .15,
	normal: .4,
	difficile: .6
};
function choixRenvoiIA(camp) {
	return camp.main.map((c, i) => c.c >= 5 ? i : -1).filter((i) => i >= 0);
}
function valeurAttaque(p, qui, u, cible) {
	const adv = autre(qui);
	const chance = chanceDeToucher(p, qui, u, cible);
	const atk = attaqueDe(p, qui, u);
	if (cible.heros) {
		const pv = p.camps[adv].pv;
		return chance * atk * (pv <= atk ? 6 : pv <= 8 ? 1.6 : 1.1);
	}
	const t = trouver(p.camps[adv], cible.uid);
	const tue = !t.bouclier && t.h <= atk;
	let v = chance * (tue ? 3 + t.a * 1.5 + t.hMax * .4 + (capsDe(t).length + (t.def.unique ? 2 : 0)) : t.bouclier ? .5 : atk * .7);
	if ((aCap(t, "riposte") || t.defend) && (!tue || chance < 1)) {
		const coup = attaqueDe(p, adv, t);
		v -= (1 - chance * (tue ? 1 : 0)) * (coup >= u.h ? 2 + u.a * 1.5 : coup * .5);
	}
	return v;
}
function ai(p, qui = "adverse", difficulte = "normal") {
	const camp = p.camps[qui];
	const adv = p.camps[autre(qui)];
	const ennemis = unites(adv);
	const facile = difficulte === "facile";
	const h = () => hasard(p);
	if (camp.meditation) {
		const loin = camp.meditation.map((c, i) => ({
			c,
			i
		})).filter(({ c }) => c.c > Math.min(10, camp.energieMax + 2)).sort((x, y) => y.c.c - x.c.c)[0];
		return {
			type: "placer",
			index: loin ? loin.i : null
		};
	}
	if (camp.actions > 0) {
		const fatal = camp.main.findIndex((c, i) => c.fx === "face" && c.v >= adv.pv && peutJouer(p, qui, i));
		if (fatal >= 0) return {
			type: "jouer",
			index: fatal
		};
		const ordre = camp.main.map((c, i) => ({
			c,
			i
		})).filter(({ i }) => peutJouer(p, qui, i)).sort((x, y) => y.c.c - x.c.c);
		const oublie = facile && h() < .25;
		for (const { c, i } of oublie ? [] : ordre) {
			if (c.t === "u") return {
				type: "jouer",
				index: i
			};
			if (c.fx === "unit") {
				const cible = ennemis.filter((u) => u.h <= c.v && !u.bouclier).sort((x, y) => y.a - x.a)[0] ?? (c.v >= 4 ? [...ennemis].sort((x, y) => y.a - x.a)[0] : null);
				if (cible) return {
					type: "jouer",
					index: i,
					cible: {
						camp: autre(qui),
						uid: cible.uid
					}
				};
				continue;
			}
			if (c.fx === "buff" || c.fx === "rage") return {
				type: "jouer",
				index: i,
				cible: {
					camp: qui,
					uid: [...unites(camp)].sort((x, y) => y.a + y.h - (x.a + x.h))[0].uid
				}
			};
			if (c.fx === "ready") {
				if (camp.actions < 2) continue;
				return {
					type: "jouer",
					index: i,
					cible: {
						camp: qui,
						uid: unites(camp).filter((x) => x.aAttaque && x.a > 0 && !x.bloquee).sort((x, y) => y.a - x.a)[0].uid
					}
				};
			}
			if (c.fx === "talisman" && (camp.bonusDe || !unites(camp).some(peutAttaquer) || camp.actions < 2)) continue;
			if (c.fx === "jeton" && (camp.reduction || !camp.main.some((x) => x !== c && x.c > camp.energie && x.c - c.v <= camp.energie))) continue;
			if (c.fx === "aoe" && ennemis.length < 2) continue;
			if (c.fx === "heal" && camp.pv > camp.pvMax - c.v) continue;
			if (c.fx === "draw" && camp.main.length > 5) continue;
			return {
				type: "jouer",
				index: i
			};
		}
		if (!facile) for (const u of unites(camp)) {
			if (!peutActiver(p, qui, u.uid)) continue;
			if (capaciteActive(u).utile && !capaciteActive(u).utile(p, qui, u)) continue;
			const cibles = ciblesCapacite(p, qui, u.uid);
			if (!cibles) return {
				type: "capacite",
				uid: u.uid
			};
			const t = cibles.map((c) => trouver(adv, c.uid)).sort((x, y) => (y.h <= 3) - (x.h <= 3) || y.a - x.a)[0];
			if (t) return {
				type: "capacite",
				uid: u.uid,
				cible: {
					camp: autre(qui),
					uid: t.uid
				}
			};
		}
		if (peutDestin(p, qui) && camp.pv > 3 && h() < (CHANCE_DESTIN[difficulte] ?? .4)) return { type: "destin" };
		const pretes = unites(camp).filter(peutAttaquer).sort((x, y) => y.a - x.a);
		let meilleure = null;
		for (const u of pretes) {
			const cibles = ciblesAttaque(p, qui, u.uid);
			if (facile) return {
				type: "attaque",
				uid: u.uid,
				cible: cibles[Math.floor(h() * cibles.length)]
			};
			for (const cible of cibles) {
				const v = valeurAttaque(p, qui, u, cible);
				if (!meilleure || v > meilleure.v) meilleure = {
					v,
					uid: u.uid,
					cible
				};
			}
		}
		if (meilleure && meilleure.v > .4) return {
			type: "attaque",
			uid: meilleure.uid,
			cible: meilleure.cible
		};
		if (!facile) {
			const menace = ennemis.reduce((s, u) => s + u.a, 0);
			const aGarder = unites(camp).filter(peutDefendre).sort((x, y) => y.h + y.d - (x.h + x.d))[0];
			if (aGarder && menace > 0 && (menace >= camp.pv / 2 || ennemis.some((e) => e.a >= aGarder.h))) return {
				type: "defendre",
				uid: aGarder.uid
			};
		}
		if (meilleure && meilleure.v > 0) return {
			type: "attaque",
			uid: meilleure.uid,
			cible: meilleure.cible
		};
	}
	if (!facile && peutDefausser(p, qui) && !camp.main.some((c, i) => peutJouer(p, qui, i))) {
		const lourde = camp.main.map((c, i) => ({
			c,
			i
		})).filter(({ c }) => c.c > camp.energieMax + 2).sort((x, y) => y.c.c - x.c.c)[0];
		if (lourde) return {
			type: "defausser",
			index: lourde.i
		};
	}
	if (!facile && peutMediter(p, qui) && camp.deck.length >= 3) return { type: "mediter" };
	return null;
}
//#endregion
//#region src/moteur/actions.js
function commencerTour(p) {
	const ev = debutTour(p);
	if (p.equipes) ev.membre = p.camps[ev.qui].membreActif;
	return ev;
}
function executer(p, a) {
	const qui = a?.qui;
	if (qui !== "joueur" && qui !== "adverse") return null;
	switch (a.type) {
		case "renvoi": {
			if (renvoiFini(p)) return null;
			const indices = Array.isArray(a.indices) ? a.indices : [];
			const ev = a.membre != null ? renvoyerMainMembre(p, qui, a.membre, indices) : renvoyerMain(p, qui, indices);
			if (!ev) return null;
			return renvoiFini(p) ? [ev, commencerTour(p)] : [ev];
		}
		case "fin":
			if (p.fini || !renvoiFini(p) || p.actif !== qui || p.camps[qui].meditation) return null;
			finTour(p);
			return [commencerTour(p)];
		case "abandon":
			if (p.fini) return null;
			p.fini = autre(qui);
			return [{
				type: "abandon",
				qui,
				...a.raison ? { raison: a.raison } : {}
			}];
		case "ia": {
			if (p.fini || !renvoiFini(p) || p.actif !== qui) return null;
			const choix = ai(p, qui, a.difficulte ?? "normal");
			if (!choix) {
				finTour(p);
				return [{
					...commencerTour(p),
					ia: { type: "fin" }
				}];
			}
			const evs = executer(p, {
				...choix,
				qui
			});
			return evs && evs.map((ev) => ({
				...ev,
				ia: choix
			}));
		}
		default: {
			if (!renvoiFini(p)) return null;
			let ev = null;
			if (a.type === "jouer") ev = jouer(p, qui, a.index, a.cible ?? null);
			else if (a.type === "attaque") ev = attaquer(p, qui, a.uid, a.cible);
			else if (a.type === "destin") ev = destin(p, qui);
			else if (a.type === "defendre") ev = defendre(p, qui, a.uid);
			else if (a.type === "capacite") ev = activer(p, qui, a.uid, a.cible ?? null);
			else if (a.type === "defausser") ev = defausser(p, qui, a.index);
			else if (a.type === "mediter") ev = mediter(p, qui);
			else if (a.type === "placer") ev = placerSous(p, qui, a.index ?? null);
			return ev ? [ev] : null;
		}
	}
}
function appliquerAction(etat, action) {
	const p = structuredClone(etat);
	delete p.evenements;
	const evenements = executer(p, action);
	if (!evenements) return {
		...etat,
		evenements: [{
			type: "refus",
			qui: action?.qui ?? null
		}]
	};
	p.evenements = evenements;
	return p;
}
//#endregion
//#region src/moteur/ombre.js
var RANGS = [
	"base",
	"commune",
	"eveillee",
	"mythique",
	"legendaire",
	"transcendante"
];
var CARTES_PAR_ELAN = 2;
function rangDe(c) {
	if (estObjet(c)) return null;
	const r = RANGS.indexOf(c.carte?.rarity);
	return r > 0 ? r : 0;
}
function grimoireOmbre(grimoireJoueur, catalogue, elan, h) {
	const modele = grimoireJoueur.map((c) => ({
		c,
		rang: rangDe(c)
	}));
	const n = Math.abs(elan) * CARTES_PAR_ELAN;
	const cartesDuModele = melanger(modele.filter((m) => m.rang !== null), h);
	if (elan > 0) for (const m of cartesDuModele.slice(0, n)) m.rang = Math.min(RANGS.length - 1, m.rang + 1);
	else if (elan < 0) for (const m of cartesDuModele.sort((x, y) => y.rang - x.rang).slice(0, n)) if (m.rang > 0) m.rang -= 1;
	else m.moinsChere = true;
	const cartes = [];
	const libre = (c) => peutAjouter(cartes, c);
	const carteBase = (cout, genre, moinsChere = false) => {
		const pool = CARTES_BASE.filter((x) => libre(x) && x.t === genre);
		const voisines = moinsChere ? pool.filter((x) => x.c < cout).sort((a, b) => b.c - a.c).filter((x, _, l) => x.c === l[0].c) : pool.filter((x) => Math.abs(x.c - cout) <= 1);
		return auHasard(voisines.length ? voisines : pool.length ? pool : CARTES_BASE.filter(libre), h);
	};
	const carteDuRang = (rang, cout, genre) => {
		for (let ecart = 0; ecart < RANGS.length; ecart++) for (const r of ecart ? [rang - ecart, rang + ecart] : [rang]) {
			if (r < 0 || r >= RANGS.length) continue;
			if (r === 0) {
				const b = carteBase(cout, genre);
				if (b) return b;
				continue;
			}
			const choix = catalogue.filter((u) => u.carte?.rarity === RANGS[r] && libre(u));
			if (choix.length) return auHasard(choix, h);
		}
		return null;
	};
	for (const { c, rang, moinsChere } of modele) {
		const memeCarte = rangDe(c) === rang && !moinsChere && libre(c);
		const carte = rang === null ? auHasard(OBJETS.filter(libre), h) : rang === 0 ? memeCarte ? c : carteBase(c.c, c.t, moinsChere) : carteDuRang(rang, c.c, c.t);
		if (carte) cartes.push(carte);
	}
	return melanger(grimoire(cartes), h);
}
var pvElan = (elan) => elan;
//#endregion
//#region src/moteur/solo.js
var NOM_OMBRE = "L'Ombre du Codex";
var ACTIONS_JOUEUR = /* @__PURE__ */ new Set([
	"renvoi",
	"jouer",
	"attaque",
	"defendre",
	"capacite",
	"destin",
	"defausser",
	"mediter",
	"placer",
	"fin",
	"abandon"
]);
var cleNom = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").trim().toLowerCase();
function deckHistoire(noms, catalogue, h) {
	const unites = [];
	const objets = [];
	for (const nom of noms ?? []) {
		const k = cleNom(nom);
		const u = catalogue.find((x) => cleNom(x.n) === k) ?? TROUPES.find((x) => cleNom(x.n) === k);
		if (u) {
			unites.push(u);
			continue;
		}
		const o = objetDepuisNom(nom);
		if (o) objets.push(o);
	}
	return construireDeck([...unites, ...objets].flatMap((c) => [c, c]), h);
}
function preparerSolo({ cartes, catalogue, difficulte, niveau = null, elan = 0, graine, nom = "Toi" }) {
	const h = generateur(graine ^ 2654435769);
	const monGrimoire = grimoire(cartes);
	const deckAdverse = niveau ? deckHistoire(niveau.deck, catalogue, h) : grimoireOmbre(monGrimoire, catalogue, elan, h);
	const premier = h() < .5 ? "joueur" : "adverse";
	const options = niveau ? {
		pvAdverse: niveau.pv,
		energieBonusAdverse: niveau.energieBonus,
		terrain: niveau.terrain,
		graine
	} : {
		pvAdverse: DIFFICULTES[difficulte].pv + pvElan(elan),
		graine
	};
	const e = creerPartie(melanger(monGrimoire, h), deckAdverse, nom, niveau ? niveau.adversaire : NOM_OMBRE, premier, options);
	return appliquerAction(e, {
		type: "renvoi",
		qui: "adverse",
		indices: choixRenvoiIA(e.camps.adverse)
	});
}
var ombreAFini = (e) => !!e.fini || e.evenements?.[0]?.ia?.type === "fin" || e.evenements?.[0]?.type === "refus";
function* tourOmbre(e, difficulte) {
	let etat = e;
	for (let i = 0; i < 30; i++) {
		etat = appliquerAction(etat, {
			type: "ia",
			qui: "adverse",
			difficulte
		});
		yield etat;
		if (ombreAFini(etat)) return;
	}
	yield appliquerAction(etat, {
		type: "fin",
		qui: "adverse"
	});
}
function actionJournal(a) {
	const x = { type: a.type };
	for (const k of [
		"index",
		"uid",
		"cible",
		"indices",
		"raison"
	]) if (a[k] !== void 0) x[k] = a[k];
	return x;
}
function rejouerSolo(depart, journal, difficulte) {
	let e = depart;
	for (const brute of journal) {
		if (e.fini) break;
		e = appliquerAction(e, {
			...actionJournal(brute),
			qui: "joueur"
		});
		if (!e.fini && e.actif === "adverse") for (const suivant of tourOmbre(e, difficulte)) e = suivant;
	}
	return e;
}
//#endregion
//#region src/lib/grimoire.js
var cleCarte = (c) => c.carte ? `u${c.carte.id}` : c.id;
function reserve(persos, objetsInventaire) {
	const objets = [...new Map(objetsInventaire.map((o) => [o.id, o])).values()];
	return {
		persos,
		troupes: TROUPES,
		sorts: SORTS,
		objets,
		toutes: [
			...persos,
			...TROUPES,
			...SORTS,
			...objets
		]
	};
}
function cartesChoisies(choix, toutes) {
	const cartes = [];
	for (const cle of choix ?? []) {
		const c = toutes.find((x) => cleCarte(x) === cle);
		if (peutAjouter(cartes, c)) cartes.push(c);
	}
	return cartes;
}
//#endregion
//#region src/data/histoire.js
var CHAPITRES = [{
	id: "pravorn",
	nom: "Pravorn",
	sousTitre: "Le royaume du Grand Tournoi",
	description: "Le plus vaste royaume du continent. De la route du Nord jusqu'aux lices de la capitale, prouve ta valeur pour défier le Champion du Grand Tournoi.",
	image: "img/Histoire/pravorn.svg",
	ratio: "16 / 9",
	niveaux: [
		{
			id: "pravorn-1",
			nom: "La route du Nord",
			x: 9,
			y: 80,
			adversaire: "Un écuyer égaré",
			deck: [
				"Écuyer de la Couronne",
				"Archer des Remparts",
				"Garde du Pont",
				"Potion de soin"
			],
			difficulte: "facile",
			est_boss: false,
			recompenses: {
				or: 15,
				xp: 200
			}
		},
		{
			id: "pravorn-2",
			nom: "Le pont gardé",
			x: 23,
			y: 60,
			adversaire: "La garde du pont",
			deck: [
				"Garde de Pravorn",
				"Garde du Pont",
				"Archer des Remparts",
				"Écuyer de la Couronne",
				"Potion de soin"
			],
			difficulte: "facile",
			est_boss: false,
			recompenses: {
				or: 18,
				xp: 200
			}
		},
		{
			id: "pravorn-3",
			nom: "Le camp des mercenaires",
			x: 37,
			y: 76,
			adversaire: "Une bande de mercenaires",
			deck: [
				"Loup des Cendres",
				"Cavalier de la Marche",
				"Chevalier errant",
				"Archer des Remparts",
				"Tonique de rage"
			],
			difficulte: "normal",
			est_boss: false,
			recompenses: {
				or: 20,
				xp: 200
			}
		},
		{
			id: "pravorn-4",
			nom: "Les marais du Sud",
			x: 50,
			y: 54,
			adversaire: "Les bêtes des marais",
			deck: [
				"Slime",
				"Loup des Cendres",
				"Cavalier de la Marche",
				"Garde du Pont",
				"Tonique d'endurance"
			],
			difficulte: "normal",
			est_boss: false,
			recompenses: {
				or: 24,
				xp: 200
			}
		},
		{
			id: "pravorn-5",
			nom: "Les remparts de la capitale",
			x: 63,
			y: 70,
			adversaire: "Le capitaine des remparts",
			deck: [
				"Gardes de Pravorn",
				"Garde de Pravorn",
				"Sentinelle de pierre",
				"Lancier des Ruines",
				"Talisman du Dé"
			],
			difficulte: "normal",
			est_boss: false,
			recompenses: {
				or: 27,
				xp: 200
			}
		},
		{
			id: "pravorn-6",
			nom: "Les lices du tournoi",
			x: 74,
			y: 44,
			adversaire: "Un chevalier de tournoi",
			deck: [
				"Chevalier errant",
				"Cavalier de la Marche",
				"Lancier des Ruines",
				"Sentinelle de pierre",
				"Jeton du marchand"
			],
			difficulte: "normal",
			est_boss: false,
			recompenses: {
				or: 30,
				xp: 200
			}
		},
		{
			id: "pravorn-boss",
			nom: "Le Grand Tournoi",
			x: 88,
			y: 22,
			adversaire: "Le Champion du Grand Tournoi",
			deck: [
				"Lancier des Ruines",
				"Sentinelle de pierre",
				"Chevalier errant",
				"Cavalier de la Marche",
				"Trousse de soins"
			],
			difficulte: "difficile",
			est_boss: true,
			pv: 26,
			recompenses: {
				or: 100,
				xp: 500,
				carte: true
			}
		}
	]
}, {
	id: "vharos",
	nom: "Vharos",
	sousTitre: "Les terres du Pacte de l’Ombre",
	description: "Bientôt : vampires, loups-garous et factions rivales.",
	image: "",
	ratio: "16 / 9",
	niveaux: []
}];
function trouverNiveau(id) {
	for (const chapitre of CHAPITRES) {
		const index = chapitre.niveaux.findIndex((n) => n.id === id);
		if (index >= 0) return {
			chapitre,
			niveau: chapitre.niveaux[index],
			index
		};
	}
	return null;
}
var jouable = (c) => c?.image && c.description !== "Carte d'exemple";
function journalValide(journal) {
	if (!Array.isArray(journal) || journal.length > 3e3) return false;
	return journal.every((a) => a && typeof a === "object" && !Array.isArray(a) && ACTIONS_JOUEUR.has(a.type));
}
var invalide = (raison, plus = {}) => ({
	resultat: "invalide",
	details: {
		raison,
		...plus
	}
});
function arbitrer({ duel, catalogueBrut, possedeesBrutes, journal, nom = "Toi" }) {
	if (!journalValide(journal)) return invalide("journal");
	let niveau = null;
	let difficulte = duel.difficulte;
	if (duel.mode === "histoire") {
		const trouve = trouverNiveau(duel.niveau_id);
		if (!trouve) return invalide("niveau");
		niveau = trouve.niveau;
		difficulte = niveau.difficulte;
	}
	if (!DIFFICULTES[difficulte]) return invalide("difficulte");
	try {
		const catalogue = (catalogueBrut ?? []).filter(jouable).map(uniteDepuisCarte);
		const collection = (possedeesBrutes ?? []).filter(jouable).map(uniteDepuisCarte);
		const objets = (duel.objets ?? []).map(objetDepuisNom).filter(Boolean);
		const fin = rejouerSolo(preparerSolo({
			cartes: cartesChoisies(duel.grimoire ?? [], reserve(collection, objets).toutes),
			catalogue,
			difficulte,
			niveau,
			elan: duel.mode === "ia" ? duel.elan ?? 0 : 0,
			graine: Number(duel.graine),
			nom
		}), journal, difficulte);
		if (!fin.fini) return invalide("inachevee", {
			tour: fin.tour,
			actions: journal.length
		});
		const abandon = fin.fini === "adverse" && fin.evenements?.[0]?.type === "abandon";
		return {
			resultat: fin.fini,
			details: {
				tour: fin.tour,
				actions: journal.length,
				...abandon ? { abandon: true } : {}
			}
		};
	} catch (e) {
		return invalide("rejeu", { erreur: String(e?.message ?? e).slice(0, 200) });
	}
}
//#endregion
//#region serveur/arbitre.js
var URL_SB = Deno.env.get("SUPABASE_URL");
var CLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var ORIGINES = (Deno.env.get("ORIGINES") ?? "https://nocthemar.github.io,http://localhost:5173,http://localhost:4173").split(",").map((o) => o.trim()).filter(Boolean);
function entetes(origine) {
	return {
		"Access-Control-Allow-Origin": ORIGINES.includes(origine) ? origine : ORIGINES[0],
		"Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
		"Content-Type": "application/json; charset=utf-8",
		"X-Content-Type-Options": "nosniff"
	};
}
var reponse = (corps, statut, origine) => new Response(JSON.stringify(corps), {
	status: statut,
	headers: entetes(origine)
});
var cleServeur = () => ({
	apikey: CLE,
	...CLE?.startsWith("eyJ") ? { Authorization: `Bearer ${CLE}` } : {}
});
async function base(chemin, options = {}) {
	const r = await fetch(`${URL_SB}/rest/v1/${chemin}`, {
		...options,
		headers: {
			...cleServeur(),
			"Content-Type": "application/json",
			...options.headers ?? {}
		}
	});
	const texte = await r.text();
	if (!r.ok) throw new Error(`${r.status} ${texte.slice(0, 200)}`);
	return texte ? JSON.parse(texte) : null;
}
async function compte(jeton) {
	if (!jeton) return null;
	const r = await fetch(`${URL_SB}/auth/v1/user`, { headers: {
		apikey: CLE,
		Authorization: `Bearer ${jeton}`
	} });
	if (!r.ok) return null;
	return (await r.json())?.id ?? null;
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
Deno.serve(async (req) => {
	const origine = req.headers.get("origin") ?? "";
	if (req.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: entetes(origine)
	});
	if (req.method !== "POST") return reponse({ erreur: "Méthode non autorisée." }, 405, origine);
	if (origine && !ORIGINES.includes(origine)) return reponse({ erreur: "Origine non autorisée." }, 403, origine);
	try {
		const uid = await compte((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
		if (!uid) return reponse({ erreur: "Connecte-toi d’abord." }, 401, origine);
		const texte = await req.text();
		if (texte.length > 4e5) return reponse({ erreur: "Partie trop longue." }, 413, origine);
		let corps;
		try {
			corps = JSON.parse(texte);
		} catch {
			return reponse({ erreur: "Requête illisible." }, 400, origine);
		}
		if (!UUID.test(String(corps?.duel ?? ""))) return reponse({ erreur: "Duel inconnu." }, 400, origine);
		const [joueur] = await base(`players?user_id=eq.${uid}&select=discord_id,username`);
		if (!joueur) return reponse({ erreur: "Profil introuvable." }, 403, origine);
		const [duel] = await base(`duels?id=eq.${corps.duel}&select=*`);
		if (!duel || duel.discord_id !== joueur.discord_id) return reponse({ erreur: "Duel inconnu." }, 404, origine);
		if (duel.termine_le) return reponse({
			xp: 0,
			raison: "ticket"
		}, 200, origine);
		const catalogueBrut = await base("cards?is_available=eq.true&order=id.asc&select=*");
		const ids = (duel.cartes ?? []).filter((x) => Number.isInteger(Number(x))).join(",");
		const { resultat, details } = arbitrer({
			duel,
			catalogueBrut,
			possedeesBrutes: ids ? await base(`cards?id=in.(${ids})&select=*`) : [],
			journal: corps.journal,
			nom: joueur.username ?? "Toi"
		});
		let fin;
		try {
			fin = await base("rpc/duel_terminer", {
				method: "POST",
				body: JSON.stringify({
					p_duel: duel.id,
					p_resultat: resultat,
					p_details: details
				})
			});
		} catch (e) {
			const message = /"message":"([^"]{1,200})"/.exec(String(e.message))?.[1];
			if (message) return reponse({
				resultat,
				erreur: message
			}, 409, origine);
			throw e;
		}
		return reponse({
			resultat,
			...fin
		}, 200, origine);
	} catch (e) {
		console.error("arbitre", e);
		return reponse({ erreur: "L’arbitre n’a pas pu valider ce duel." }, 500, origine);
	}
});
//#endregion
