// Simulazioni di partite complete con le liste di parole vere:
// lobby piccole e grandi, più round, molte lobby insieme, uscite e rientri a metà partita.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ioc = require('socket.io-client');
const { creaServer, assegnaRuoli } = require('../server');

const leggi = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const DB = { classica: leggi('words.json'), clash: leggi('words_clash.json') };

const GRACE_MS = 400;
const COUNTDOWN_MS = 40;
let contatore = 0;
const nuovoId = () => `sim-${process.pid}-${++contatore}-abcdef`;
const pausa = ms => new Promise(r => setTimeout(r, ms));

function attendi(socket, evento, ms = 4000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => { socket.off(evento, h); reject(new Error(`timeout "${evento}" (${socket.nome})`)); }, ms);
        const h = d => { clearTimeout(t); resolve(d); };
        socket.once(evento, h);
    });
}

let srv;
before(async () => {
    srv = creaServer({ silenzioso: true, graceMs: GRACE_MS, countdownMs: COUNTDOWN_MS });
    await new Promise(r => srv.server.listen(0, r));
    srv.url = `http://localhost:${srv.server.address().port}`;
});
after(() => { srv.io.close(); srv.server.close(); });

const aperti = [];
async function connetti(nome, playerId = nuovoId()) {
    const c = ioc(srv.url, { auth: { playerId }, forceNew: true, transports: ['websocket'], reconnection: false });
    c.playerId = playerId;
    c.nome = nome;
    c.eventi = [];
    c.onAny((ev, d) => c.eventi.push([ev, d]));
    c.sessione = await attendi(c, 'sessione');
    aperti.push(c);
    return c;
}
after(() => aperti.forEach(c => c.connected && c.disconnect()));

// Crea una lobby con n giocatori; restituisce { codice, giocatori } (giocatori[0] è l'host)
async function creaLobbyCon(n, modalita = 'classica') {
    const host = await connetti('Host');
    const p = attendi(host, 'lobby_creata');
    host.emit('create_lobby', { modalita, nome: 'Host' });
    const { codice } = await p;
    const giocatori = [host];
    for (let i = 1; i < n; i++) {
        const g = await connetti(`G${i}`);
        const r = attendi(g, 'lobby_unita');
        g.emit('join_lobby', { codice, nome: `Giocatore${i}` });
        const esito = await r;
        assert.equal(esito.success, true, esito.messaggio);
        giocatori.push(g);
    }
    return { codice, giocatori, host };
}

async function giocaRound(host, giocatori) {
    const countdown = giocatori.map(g => attendi(g, 'avvia_countdown'));
    const ruoli = giocatori.map(g => attendi(g, 'partita_iniziata'));
    host.emit('start_game');
    await Promise.all(countdown);
    return Promise.all(ruoli);
}

async function tornaLobby(host, giocatori) {
    const ritorni = giocatori.map(g => attendi(g, 'torna_alla_lobby'));
    host.emit('reset_lobby');
    return Promise.all(ritorni);
}

// Controlla che un round sia valido e restituisce la parola dei civili
function verificaRound(ruoli, modalita, infiltrato) {
    const impostori = ruoli.filter(r => r.ruolo === 'IMPOSTORE');
    const infiltrati = ruoli.filter(r => r.ruolo === 'INFILTRATO');
    const civili = ruoli.filter(r => r.ruolo === 'CIVILE');
    assert.equal(impostori.length, 1, 'deve esserci esattamente un impostore');
    assert.equal(infiltrati.length, infiltrato ? 1 : 0, 'numero di infiltrati errato');
    assert.equal(civili.length, ruoli.length - 1 - infiltrati.length);
    assert.ok(civili.length >= 1, 'serve almeno un civile');
    assert.equal(ruoli.filter(r => r.iniziaTu).length, 1, 'deve iniziare esattamente una persona');

    const parole = new Set(civili.map(c => c.testoPrincipale));
    assert.equal(parole.size, 1, 'tutti i civili devono avere la stessa parola');
    const parola = civili[0].testoPrincipale;
    const carta = DB[modalita].find(v => v.parola === parola);
    assert.ok(carta, `"${parola}" non è nella lista ${modalita}`);
    if (infiltrato) {
        const pi = infiltrati[0].testoPrincipale;
        assert.ok(carta.infiltrato.includes(pi), `"${pi}" non è un'alternativa di "${parola}"`);
        assert.notEqual(pi, parola);
    }
    assert.equal(impostori[0].testoPrincipale, "SEI L'IMPOSTORE");
    for (const r of ruoli) assert.ok(r.colore && r.tipoLogo && r.testoSecondario);
    return parola;
}

// ---------------- lobby di varie dimensioni ----------------
describe('partite complete con lobby di dimensioni diverse', () => {
    const casi = [
        { n: 2, infiltrato: false, modalita: 'classica' },
        { n: 3, infiltrato: false, modalita: 'clash' },
        { n: 3, infiltrato: true, modalita: 'classica' },
        { n: 4, infiltrato: true, modalita: 'clash' },
        { n: 6, infiltrato: false, modalita: 'classica' },
        { n: 10, infiltrato: true, modalita: 'classica' },
        { n: 15, infiltrato: true, modalita: 'clash' },
        { n: 20, infiltrato: true, modalita: 'classica' },
    ];
    for (const { n, infiltrato, modalita } of casi) {
        test(`${n} giocatori, modalità ${modalita}, infiltrato ${infiltrato ? 'sì' : 'no'}: 5 round di fila`, async () => {
            const { giocatori, host } = await creaLobbyCon(n, modalita);
            if (infiltrato) {
                const agg = giocatori.map(g => attendi(g, 'aggiorna_impostazioni'));
                host.emit('toggle_infiltrato');
                for (const a of await Promise.all(agg)) assert.equal(a.infiltratoAbilitato, true);
            }
            const paroleUscite = [];
            const impostoriVisti = new Set();
            for (let round = 0; round < 5; round++) {
                const ruoli = await giocaRound(host, giocatori);
                paroleUscite.push(verificaRound(ruoli, modalita, infiltrato));
                impostoriVisti.add(ruoli.findIndex(r => r.ruolo === 'IMPOSTORE'));
                const ritorni = await tornaLobby(host, giocatori);
                for (const r of ritorni) assert.equal(r.listaNomi.length, n, 'dopo il round mancano giocatori');
            }
            assert.equal(new Set(paroleUscite).size, 5, `parole ripetute: ${paroleUscite}`);
            if (n >= 3) assert.ok(impostoriVisti.size >= 2 || n === 2, 'l\'impostore è sempre lo stesso giocatore');
            giocatori.forEach(g => g.disconnect());
        });
    }

    test('20 è il massimo: il 21° giocatore riceve "Lobby piena!"', async () => {
        const { codice, giocatori } = await creaLobbyCon(20);
        const extra = await connetti('Extra');
        const r = attendi(extra, 'lobby_unita');
        extra.emit('join_lobby', { codice, nome: 'Extra' });
        const esito = await r;
        assert.equal(esito.success, false);
        assert.equal(esito.messaggio, 'Lobby piena!');
        [...giocatori, extra].forEach(g => g.disconnect());
    });

    test('con l\'infiltrato attivo servono almeno 3 giocatori', async () => {
        const { giocatori, host } = await creaLobbyCon(2);
        host.emit('toggle_infiltrato');
        await attendi(host, 'aggiorna_impostazioni');
        const err = attendi(host, 'errore');
        host.emit('start_game');
        assert.match((await err).messaggio, /almeno 3/);
        giocatori.forEach(g => g.disconnect());
    });

    test('da solo non si può iniziare', async () => {
        const { giocatori, host } = await creaLobbyCon(1);
        const err = attendi(host, 'errore');
        host.emit('start_game');
        assert.match((await err).messaggio, /almeno 2/);
        giocatori.forEach(g => g.disconnect());
    });

    test('solo l\'host può avviare, cambiare impostazioni e tornare in lobby', async () => {
        const { giocatori, host } = await creaLobbyCon(4);
        const intruso = giocatori[2];
        intruso.emit('start_game');
        intruso.emit('toggle_infiltrato');
        await pausa(150);
        assert.ok(!giocatori.some(g => g.eventi.some(([e]) => e === 'avvia_countdown' || e === 'aggiorna_impostazioni')));
        await giocaRound(host, giocatori);
        intruso.emit('reset_lobby');
        await pausa(150);
        assert.ok(!giocatori.some(g => g.eventi.some(([e]) => e === 'torna_alla_lobby')));
        giocatori.forEach(g => g.disconnect());
    });
});

// ---------------- tante lobby in contemporanea ----------------
describe('molte lobby contemporaneamente', () => {
    test('40 lobby da 2 a 8 giocatori giocano insieme senza mescolare parole o eventi', async () => {
        const lobby = [];
        for (let i = 0; i < 40; i++) {
            const modalita = i % 2 ? 'clash' : 'classica';
            lobby.push({ modalita, ...(await creaLobbyCon(2 + (i % 7), modalita)) });
        }
        const codici = new Set(lobby.map(l => l.codice));
        assert.equal(codici.size, 40, 'codici lobby duplicati');

        for (let round = 0; round < 2; round++) {
            const risultati = await Promise.all(lobby.map(l => giocaRound(l.host, l.giocatori)));
            risultati.forEach((ruoli, i) => {
                verificaRound(ruoli, lobby[i].modalita, false);
                assert.equal(ruoli.length, lobby[i].giocatori.length);
            });
            await Promise.all(lobby.map(l => tornaLobby(l.host, l.giocatori)));
        }
        // Ogni giocatore ha ricevuto esattamente 2 ruoli: nessun evento da altre lobby
        for (const l of lobby) for (const g of l.giocatori) {
            assert.equal(g.eventi.filter(([e]) => e === 'partita_iniziata').length, 2, `${l.codice}/${g.nome}`);
        }
        lobby.forEach(l => l.giocatori.forEach(g => g.disconnect()));
        await pausa(GRACE_MS + 200);
        for (const c of codici) assert.equal(srv.stanze[c], undefined, `la lobby ${c} non è stata eliminata`);
    });
});

// ---------------- imprevisti durante la partita ----------------
describe('imprevisti durante la partita', () => {
    test('10 giocatori: uno perde la connessione a metà partita e rientra con lo stesso ruolo', async () => {
        const { giocatori, host } = await creaLobbyCon(10);
        const ruoli = await giocaRound(host, giocatori);
        const caduto = giocatori[5];
        caduto.disconnect();
        const lista = await attendi(host, 'giocatore_entrato');
        assert.equal(lista.giocatori[5].connesso, false, 'il giocatore caduto dovrebbe risultare disconnesso');

        const rientrato = await connetti('G5-rientro', caduto.playerId);
        assert.equal(rientrato.sessione.stato.status, 'playing');
        assert.deepEqual(rientrato.sessione.stato.ruolo, ruoli[5]);
        giocatori[5] = rientrato;

        // La partita continua: round successivo con tutti e 10
        await tornaLobby(host, giocatori);
        verificaRound(await giocaRound(host, giocatori), 'classica', false);
        giocatori.forEach(g => g.disconnect());
    });

    test('l\'host esce durante la partita: un altro diventa host e può far ripartire', async () => {
        const { giocatori, host } = await creaLobbyCon(8);
        await giocaRound(host, giocatori);
        const nuovoHost = giocatori[1];
        const promo = attendi(nuovoHost, 'promozione_host');
        const usciti = giocatori.slice(1).map(g => attendi(g, 'giocatore_uscito'));
        host.emit('leave_lobby');
        await promo;
        const avvisi = await Promise.all(usciti);
        assert.ok(avvisi.every(a => a.nome === 'Host'));

        const rimasti = giocatori.slice(1);
        const ritorni = await tornaLobby(nuovoHost, rimasti);
        assert.equal(ritorni[0].listaNomi.length, 7);
        verificaRound(await giocaRound(nuovoHost, rimasti), 'classica', false);
        rimasti.forEach(g => g.disconnect());
        host.disconnect();
    });

    test('l\'impostore abbandona: tutti ricevono l\'avviso con eraImpostore = true', async () => {
        const { giocatori, host } = await creaLobbyCon(5);
        const ruoli = await giocaRound(host, giocatori);
        const iImp = ruoli.findIndex(r => r.ruolo === 'IMPOSTORE');
        const altri = giocatori.filter((_, i) => i !== iImp);
        const avvisi = altri.map(g => attendi(g, 'giocatore_uscito'));
        giocatori[iImp].emit('leave_lobby');
        for (const a of await Promise.all(avvisi)) assert.equal(a.eraImpostore, true);
        giocatori.forEach(g => g.disconnect());
    });

    test('un nuovo amico entra tra un round e l\'altro e gioca il round dopo', async () => {
        const { codice, giocatori, host } = await creaLobbyCon(3);
        await giocaRound(host, giocatori);
        const nuovo = await connetti('Nuovo');
        const r = attendi(nuovo, 'lobby_unita');
        nuovo.emit('join_lobby', { codice, nome: 'Nuovo' });
        assert.equal((await r).messaggio, 'Partita già in corso!');

        await tornaLobby(host, giocatori);
        const r2 = attendi(nuovo, 'lobby_unita');
        nuovo.emit('join_lobby', { codice, nome: 'Nuovo' });
        assert.equal((await r2).success, true);
        giocatori.push(nuovo);
        const ruoli = await giocaRound(host, giocatori);
        assert.equal(ruoli.length, 4);
        verificaRound(ruoli, 'classica', false);
        giocatori.forEach(g => g.disconnect());
    });

    test('un giocatore che non rientra entro il tempo di grazia viene tolto dalla lobby', async () => {
        const { giocatori, host } = await creaLobbyCon(4);
        giocatori[3].disconnect();
        await pausa(GRACE_MS + 200);
        const ruoli = await giocaRound(host, giocatori.slice(0, 3));
        assert.equal(ruoli.length, 3);
        assert.equal(giocatori[3].eventi.filter(([e]) => e === 'partita_iniziata').length, 0);
        giocatori.forEach(g => g.disconnect());
    });

    test('nomi uguali vengono numerati e i nomi lunghi tagliati a 12 caratteri', async () => {
        const host = await connetti('Host');
        const p = attendi(host, 'lobby_creata');
        host.emit('create_lobby', { modalita: 'classica', nome: 'Luca' });
        const { codice } = await p;
        const nomi = [];
        for (const nome of ['Luca', 'luca', 'Luca', 'UnNomeDavveroLunghissimo']) {
            const g = await connetti(nome);
            const r = attendi(g, 'lobby_unita');
            g.emit('join_lobby', { codice, nome });
            nomi.push(await r);
        }
        const lista = nomi.at(-1).listaNomi;
        assert.equal(new Set(lista.map(n => n.toLowerCase())).size, lista.length, `nomi duplicati: ${lista}`);
        assert.ok(lista.every(n => n.length <= 12), `nome troppo lungo: ${lista}`);
    });
});

// ---------------- parole ----------------
describe('rotazione delle parole', () => {
    test('modalità Clash: 123 round di fila escono tutte le carte senza ripetizioni, poi si ricomincia', async () => {
        const { giocatori, host } = await creaLobbyCon(3, 'clash');
        const uscite = [];
        for (let i = 0; i < DB.clash.length + 3; i++) {
            const ruoli = await giocaRound(host, giocatori);
            uscite.push(verificaRound(ruoli, 'clash', false));
            await tornaLobby(host, giocatori);
        }
        const primoGiro = uscite.slice(0, DB.clash.length);
        assert.equal(new Set(primoGiro).size, DB.clash.length, 'nel primo giro ci sono ripetizioni');
        assert.equal(new Set(uscite.slice(DB.clash.length)).size, 3);
        giocatori.forEach(g => g.disconnect());
    });
});

// ---------------- equità statistica ----------------
describe('equità dei ruoli (simulazione di 60.000 partite)', () => {
    const carta = { parola: 'Pizza', infiltrato: ['Pasta', 'Focaccia', 'Calzone'] };

    for (const [n, infiltrato] of [[4, false], [6, true], [10, true]]) {
        test(`${n} giocatori, infiltrato ${infiltrato ? 'sì' : 'no'}: ogni posto ha le stesse probabilità di essere impostore`, () => {
            const PROVE = 20000;
            const contaImp = Array(n).fill(0), contaInf = Array(n).fill(0);
            const inizia = { IMPOSTORE: 0, INFILTRATO: 0, CIVILE: 0 };
            for (let k = 0; k < PROVE; k++) {
                const ruoli = assegnaRuoli(n, infiltrato, carta);
                ruoli.forEach((r, i) => {
                    if (r.ruolo === 'IMPOSTORE') contaImp[i]++;
                    if (r.ruolo === 'INFILTRATO') contaInf[i]++;
                    if (r.iniziaTu) inizia[r.ruolo]++;
                });
            }
            const atteso = PROVE / n;
            for (const c of contaImp) assert.ok(Math.abs(c - atteso) < atteso * 0.1, `impostore sbilanciato: ${contaImp}`);
            if (infiltrato) for (const c of contaInf) assert.ok(Math.abs(c - atteso) < atteso * 0.1, `infiltrato sbilanciato: ${contaInf}`);

            // Chi inizia: biglietti impostore 1, infiltrato 3, civile 5 ciascuno
            const civili = n - 1 - (infiltrato ? 1 : 0);
            const tot = 1 + (infiltrato ? 3 : 0) + 5 * civili;
            const pImp = inizia.IMPOSTORE / PROVE;
            assert.ok(Math.abs(pImp - 1 / tot) < 0.01, `l'impostore inizia nel ${(pImp * 100).toFixed(1)}% dei casi, atteso ${(100 / tot).toFixed(1)}%`);
        });
    }
});
