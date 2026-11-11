const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const leggi = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const parole = leggi('words.json');
const clash = leggi('words_clash.json');

// Nomi italiani ufficiali delle carte di Clash Royale (aggiornati a novembre 2026).
// Fonte: elenco carte in italiano di deckshop.pro e note di aggiornamento Supercell.
const CARTE_UFFICIALI = [
    'Principino', 'Goblinstein', 'Monaco', 'Minatore colossale', 'Regina degli arcieri', 'Fuorilegge boss',
    "Cavaliere d'oro", 'Re degli scheletri', 'Estrattore di elisir', 'Specchio', 'Clonazione', 'Tornado',
    'Cannone a rotelle', 'Nihil', 'Pescatore', 'Strega madre', 'Macchina goblin', 'Imperatrice degli spiriti',
    'Consegna Royale', 'Golem di elisir', 'Maledizione goblin', 'Furia', 'Trivella goblin', 'Boia', 'Boscaiolo',
    'Strega notturna', 'Ronin', 'Mascalzoni', 'Spirito della cura', 'Cespuglio sospetto', 'Bocciatore',
    'Gigante elettrico', 'Fuorilegge', 'Arciere magico', 'Mastino lavico', 'Arciere pirotecnico', 'Terremoto',
    'Goblin demolitore', 'Spaccamuro', 'Drago elettrico', 'Stregone di ghiaccio', 'Fantasma Royale', 'Fenice',
    'Cimitero', 'Il Tronco', 'Minatore', 'Principessa', 'Stregone elettrico', 'Drago infernale',
    'Domatrice di arieti', 'Scintilla', 'Gran cavaliere', 'Tesla', 'Orda di sgherri', 'Barbari scelti', 'Fornace',
    'Scaricuccioli', 'Cacciatore', 'Arco-X', 'Golem', 'Berserker', 'Gang di goblin', "Barile d'ossa",
    'Goblin cerbottaniere', 'Capanna dei barbari', 'Barile barbarico', 'Veleno', 'Gigantessa delle rune',
    'Gigante goblin', 'Spirito del ghiaccio', 'Palla di neve gigante', 'Golem del ghiaccio', 'Guaritrice guerriera',
    'Groviglio', 'Congelamento', 'Scheletro gigante', 'Fulmine', 'Gigante Royale', 'Reclute Royale',
    'Maiali Royale', 'Tre moschettieri', 'Principe nero', 'Mongolfiera', 'Principe', 'Barile goblin', 'Guardie',
    'Orda di scheletri', 'Cucciolo di drago', 'Strega', 'P.E.K.K.A', 'Pipistrelli', 'Scarica', 'Mortaio',
    'Macchina volante', 'Domatore di cinghiali', 'Gigante sgherro', 'Razzo', 'Spirito elettrico',
    'Spirito del fuoco', "Draghi d'ossa", 'Torre bombardiera', 'Torre infernale', 'Stregone', 'Cannone',
    'Barbari', 'Megasgherro', 'Ariete da battaglia', 'Scheletri', 'Bombarolo', 'Lapide', 'Valchiria', 'Goblin',
    'Goblin lancieri', 'Gabbia per goblin', 'Capanna goblin', 'Arcieri', 'Frecce', 'Cavaliere', 'Sgherri',
    'Sfera infuocata', 'Mini P.E.K.K.A', 'Moschettiere', 'Gigante'
];

function controlliComuni(nome, lista, minimo) {
    describe(nome, () => {
        test(`contiene almeno ${minimo} voci`, () => {
            assert.ok(lista.length >= minimo, `solo ${lista.length} voci`);
        });

        test('ogni voce ha id, parola e almeno 3 parole per l\'infiltrato', () => {
            for (const v of lista) {
                assert.equal(typeof v.id, 'number', JSON.stringify(v));
                assert.equal(typeof v.parola, 'string');
                assert.ok(v.parola.trim().length > 0);
                assert.ok(Array.isArray(v.infiltrato) && v.infiltrato.length >= 3, `${v.parola}: troppe poche alternative`);
                for (const i of v.infiltrato) assert.ok(typeof i === 'string' && i.trim().length > 0, v.parola);
            }
        });

        test('id e parole non sono duplicati', () => {
            const ids = lista.map(v => v.id);
            assert.equal(new Set(ids).size, ids.length, 'id duplicati');
            const p = lista.map(v => v.parola.toLowerCase());
            const dup = p.filter((x, i) => p.indexOf(x) !== i);
            assert.deepEqual(dup, [], 'parole duplicate');
        });

        test('la parola dell\'infiltrato non è mai uguale a quella dei civili', () => {
            for (const v of lista) {
                const inf = v.infiltrato.map(x => x.toLowerCase());
                assert.ok(!inf.includes(v.parola.toLowerCase()), v.parola);
                assert.equal(new Set(inf).size, inf.length, `${v.parola}: alternative ripetute`);
            }
        });

        test('nessun carattere rovinato dalla codifica', () => {
            const testo = JSON.stringify(lista);
            assert.ok(!/Ã.|Â|�/.test(testo), 'trovati caratteri con codifica errata');
        });
    });
}

controlliComuni('words.json', parole, 400);
controlliComuni('words_clash.json', clash, 100);

describe('words_clash.json usa i nomi ufficiali italiani', () => {
    const ufficiali = new Set(CARTE_UFFICIALI);

    test('ogni parola e ogni alternativa è una carta reale', () => {
        const sconosciute = new Set();
        for (const v of clash) {
            if (!ufficiali.has(v.parola)) sconosciute.add(v.parola);
            for (const i of v.infiltrato) if (!ufficiali.has(i)) sconosciute.add(i);
        }
        assert.deepEqual([...sconosciute], []);
    });

    test('ci sono tutte le carte, comprese le più recenti', () => {
        const presenti = new Set(clash.map(v => v.parola));
        const mancanti = CARTE_UFFICIALI.filter(c => !presenti.has(c));
        assert.deepEqual(mancanti, []);
        for (const nuova of ['Ronin', 'Gigante sgherro', 'Imperatrice degli spiriti', 'Groviglio', 'Gigantessa delle rune', 'Nihil', 'Principino', 'Goblinstein', 'Macchina goblin', 'Fuorilegge boss']) {
            assert.ok(presenti.has(nuova), nuova);
        }
    });
});
