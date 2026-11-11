const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const ioc = require('socket.io-client');
const {
    creaServer, scegliCarta, assegnaRuoli, pulisciNome, pulisciCodice,
    pulisciModalita, idGiocatoreValido, generaNomeCasuale
} = require('../server');

const GRACE_MS = 300;
const COUNTDOWN_MS = 60;
const DB_TEST = [
    { parola: 'Cane', infiltrato: ['Lupo'] },
    { parola: 'Gatto', infiltrato: ['Tigre'] },
    { parola: 'Mare', infiltrato: ['Lago'] }
];

// ---------- utilità ----------
let contatoreId = 0;
const nuovoId = () => `test-player-${Date.now()}-${++contatoreId}`;
const pausa = ms => new Promise(r => setTimeout(r, ms));

async function avviaServer(opzioni = {}) {
    const s = creaServer({ silenzioso: true, graceMs: GRACE_MS, countdownMs: COUNTDOWN_MS, dbClassico: DB_TEST, dbClash: DB_TEST, ...opzioni });
    await new Promise(r => s.server.listen(0, r));
    s.url = `http://localhost:${s.server.address().port}`;
    return s;
}

function attendi(socket, evento, ms = 2000) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => { socket.off(evento, h); reject(new Error(`timeout in attesa di "${evento}"`)); }, ms);
        const h = (dati) => { clearTimeout(t); resolve(dati); };
        socket.once(evento, h);
    });
}

// Raccoglie tutti gli eventi di un tipo per un certo tempo
function raccogli(socket, evento) {
    const lista = [];
    socket.on(evento, d => lista.push(d));
    return lista;
}

async function connetti(url, playerId = nuovoId()) {
    const c = ioc(url, { auth: { playerId }, forceNew: true, transports: ['websocket'], reconnection: false });
    c.playerId = playerId;
    c.sessione = await attendi(c, 'sessione');
    return c;
}

async function creaLobby(c, modalita = 'classica', nome = 'Host') {
    const p = attendi(c, 'lobby_creata');
    c.emit('create_lobby', { modalita, nome });
    return p;
}

async function entra(c, codice, nome) {
    const p = attendi(c, 'lobby_unita');
    c.emit('join_lobby', { codice, nome });
    return p;
}

async function avviaPartita(host, giocatori) {
    const ruoli = giocatori.map(g => attendi(g, 'partita_iniziata'));
    host.emit('start_game');
    return Promise.all(ruoli);
}

// ---------- funzioni pure ----------
describe('funzioni di supporto', () => {
    test('pulisciNome accetta solo stringhe valide e tronca a 12 caratteri', () => {
        assert.equal(pulisciNome('  Mario  '), 'Mario');
        assert.equal(pulisciNome('NomeLunghissimoDavvero'), 'NomeLunghiss');
        assert.equal(pulisciNome('a\u0000b\nc'), 'abc');
        assert.equal(pulisciNome('   '), null);
        assert.equal(pulisciNome(''), null);
        assert.equal(pulisciNome(42), null);
        assert.equal(pulisciNome({}), null);
        assert.equal(pulisciNome(null), null);
    });

    test('pulisciCodice accetta solo 4 lettere', () => {
        assert.equal(pulisciCodice('abcd'), 'ABCD');
        assert.equal(pulisciCodice(' WXYZ '), 'WXYZ');
        assert.equal(pulisciCodice('ABC'), null);
        assert.equal(pulisciCodice('AB1D'), null);
        assert.equal(pulisciCodice({ toUpperCase: 1 }), null);
        assert.equal(pulisciCodice(undefined), null);
    });

    test('pulisciModalita ricade su "classica" per valori sconosciuti', () => {
        assert.equal(pulisciModalita('clash'), 'clash');
        assert.equal(pulisciModalita('classica'), 'classica');
        assert.equal(pulisciModalita('hack'), 'classica');
        assert.equal(pulisciModalita({}), 'classica');
    });

    test('idGiocatoreValido', () => {
        assert.ok(idGiocatoreValido('550e8400-e29b-41d4-a716-446655440000'));
        assert.ok(!idGiocatoreValido('corto'));
        assert.ok(!idGiocatoreValido('<script>alert(1)</script>'));
        assert.ok(!idGiocatoreValido(123));
    });

    test('generaNomeCasuale non supera mai 12 caratteri', () => {
        for (let i = 0; i < 500; i++) assert.ok(generaNomeCasuale().length <= 12);
    });

    test('scegliCarta non ripete parole finché non le ha usate tutte', () => {
        const usate = new Set();
        const viste = new Set();
        for (let i = 0; i < DB_TEST.length; i++) viste.add(scegliCarta(DB_TEST, usate).parola);
        assert.equal(viste.size, DB_TEST.length);
        // al giro successivo ricomincia senza errori
        assert.ok(scegliCarta(DB_TEST, usate));
        assert.equal(usate.size, 1);
    });

    test('assegnaRuoli: esattamente un impostore, civili con la stessa parola', () => {
        for (let n = 2; n <= 12; n++) {
            for (let prova = 0; prova < 30; prova++) {
                const ruoli = assegnaRuoli(n, false, DB_TEST[0]);
                assert.equal(ruoli.length, n);
                assert.equal(ruoli.filter(r => r.ruolo === 'IMPOSTORE').length, 1);
                assert.equal(ruoli.filter(r => r.ruolo === 'INFILTRATO').length, 0);
                assert.ok(ruoli.filter(r => r.ruolo === 'CIVILE').every(r => r.testoPrincipale === 'Cane'));
                assert.equal(ruoli.filter(r => r.iniziaTu).length, 1);
            }
        }
    });

    test('assegnaRuoli con infiltrato: un infiltrato solo se resta almeno un civile', () => {
        for (let prova = 0; prova < 50; prova++) {
            const tre = assegnaRuoli(3, true, DB_TEST[0]);
            assert.equal(tre.filter(r => r.ruolo === 'INFILTRATO').length, 1);
            assert.equal(tre.filter(r => r.ruolo === 'CIVILE').length, 1);
            assert.equal(tre.find(r => r.ruolo === 'INFILTRATO').testoPrincipale, 'Lupo');
            const due = assegnaRuoli(2, true, DB_TEST[0]);
            assert.equal(due.filter(r => r.ruolo === 'INFILTRATO').length, 0);
        }
    });

    test('assegnaRuoli: chi inizia è pesato (l\'impostore inizia di rado)', () => {
        let iniziaImpostore = 0;
        const N = 4000;
        for (let i = 0; i < N; i++) {
            const ruoli = assegnaRuoli(4, false, DB_TEST[0]);
            if (ruoli.find(r => r.iniziaTu).ruolo === 'IMPOSTORE') iniziaImpostore++;
        }
        // atteso 1/16 ≈ 6%; con pesi uguali sarebbe 25%
        assert.ok(iniziaImpostore / N < 0.12, `impostore inizia nel ${(100 * iniziaImpostore / N).toFixed(1)}% dei casi`);
    });
});

// ---------- HTTP ----------
describe('HTTP', () => {
    let s;
    before(async () => { s = await avviaServer(); });
    after(() => new Promise(r => s.io.close(r)));

    const get = (percorso) => new Promise((resolve, reject) => {
        http.get(s.url + percorso, res => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }).on('error', reject);
    });

    test('/health risponde "ok" senza cache', async () => {
        const r = await get('/health');
        assert.equal(r.status, 200);
        assert.equal(r.body, 'ok');
        assert.match(r.headers['cache-control'], /no-store/);
    });

    test('/ serve la pagina del gioco', async () => {
        const r = await get('/');
        assert.equal(r.status, 200);
        assert.match(r.body, /Trova l'Impostore/);
        assert.match(r.body, /serviceWorker\.register/);
    });

    test('file statici e service worker sono raggiungibili', async () => {
        for (const f of ['/manifest.json', '/icon-192.png', '/icon-512.png', '/logo_imposter.png', '/logo_detective.png', '/logo_infiltrato.png', '/service-worker.js', '/socket.io/socket.io.js']) {
            const r = await get(f);
            assert.equal(r.status, 200, `${f} -> ${r.status}`);
        }
        const sw = await get('/service-worker.js');
        assert.match(sw.headers['cache-control'], /no-cache/);
    });

    test('ogni file precaricato dal service worker esiste', async () => {
        const sw = (await get('/service-worker.js')).body;
        const lista = sw.match(/const FILE_STATICI = \[([\s\S]*?)\]/)[1].match(/'([^']+)'/g).map(x => x.slice(1, -1));
        assert.ok(lista.length > 0);
        for (const f of lista) assert.equal((await get(f)).status, 200, `${f} manca`);
    });
});

// ---------- gioco via Socket.IO ----------
describe('lobby e partita', () => {
    let s;
    let client = [];
    let erroriConsole;
    const consoleErrorOriginale = console.error;

    beforeEach(async () => {
        s = await avviaServer();
        client = [];
        erroriConsole = [];
        console.error = (...a) => erroriConsole.push(a.join(' '));
    });
    afterEach(async () => {
        console.error = consoleErrorOriginale;
        client.forEach(c => c.disconnect());
        await new Promise(r => s.io.close(r));
    });
    const nuovo = async (id) => { const c = await connetti(s.url, id); client.push(c); return c; };

    test('alla connessione arriva la sessione vuota', async () => {
        const c = await nuovo();
        assert.equal(c.sessione.playerId, c.playerId);
        assert.equal(c.sessione.stato, null);
    });

    test('un id non valido viene sostituito da uno generato dal server', async () => {
        const c = await nuovo('<bad>');
        assert.notEqual(c.sessione.playerId, '<bad>');
        assert.ok(idGiocatoreValido(c.sessione.playerId));
    });

    test('creare una lobby restituisce un codice di 4 lettere e l\'host', async () => {
        const c = await nuovo();
        const d = await creaLobby(c, 'clash', 'Anna');
        assert.match(d.codice, /^[A-Z]{4}$/);
        assert.equal(d.isHost, true);
        assert.equal(d.modalita, 'clash');
        assert.deepEqual(d.listaNomi, ['Anna']);
        assert.equal(d.hostIndex, 0);
    });

    test('compatibilità: create_lobby accetta ancora la stringa della modalità', async () => {
        const c = await nuovo();
        const p = attendi(c, 'lobby_creata');
        c.emit('create_lobby', 'clash');
        assert.equal((await p).modalita, 'clash');
    });

    test('entrare con un codice aggiorna la lista per tutti', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host, 'classica', 'Anna');
        const ospite = await nuovo();
        const aggiornamento = attendi(host, 'giocatore_entrato');
        const d = await entra(ospite, codice, 'Bruno');
        assert.equal(d.success, true);
        assert.equal(d.isHost, false);
        assert.deepEqual(d.listaNomi, ['Anna', 'Bruno']);
        assert.deepEqual((await aggiornamento).listaNomi, ['Anna', 'Bruno']);
    });

    test('il codice è accettato anche minuscolo', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const ospite = await nuovo();
        assert.equal((await entra(ospite, codice.toLowerCase(), 'Bruno')).success, true);
    });

    test('si può entrare in una lobby di un\'altra modalità (prende la modalità della lobby)', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host, 'clash');
        const ospite = await nuovo();
        const p = attendi(ospite, 'lobby_unita');
        ospite.emit('join_lobby', { codice, nome: 'Bruno', modalitaRichiesta: 'classica' });
        const d = await p;
        assert.equal(d.success, true);
        assert.equal(d.modalita, 'clash');
    });

    test('codice inesistente o non valido', async () => {
        const c = await nuovo();
        assert.equal((await entra(c, 'ZZZZ', 'X')).messaggio, 'Codice non trovato!');
        assert.equal((await entra(c, '12', 'X')).messaggio, 'Codice non valido!');
    });

    test('doppio join non duplica il giocatore', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const ospite = await nuovo();
        await entra(ospite, codice, 'Bruno');
        const d = await entra(ospite, codice, 'Bruno');
        assert.deepEqual(d.listaNomi, ['Host', 'Bruno']);
    });

    test('nomi uguali ricevono un numero', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host, 'classica', 'Marco');
        const b = await nuovo();
        const c = await nuovo();
        await entra(b, codice, 'marco');
        const d = await entra(c, codice, 'Marco');
        assert.deepEqual(d.listaNomi, ['Marco', 'marco 2', 'Marco 3']);
    });

    test('i nomi con HTML arrivano come testo, troncati a 12 caratteri', async () => {
        const c = await nuovo();
        const d = await creaLobby(c, 'classica', '<img src=x onerror=alert(1)>');
        assert.equal(d.listaNomi[0], '<img src=x o');
    });

    test('payload malformati non fanno crashare il server né generano eccezioni', async () => {
        const c = await nuovo();
        const brutti = [undefined, null, 0, 42, '', 'x', true, [], {}, { codice: {} }, { codice: ['ABCD'] },
            { codice: 'ABCD', nome: { a: 1 } }, { modalita: { toUpperCase: 1 } }, 'A'.repeat(100000), { nome: 'N'.repeat(5000) }];
        const eventi = ['imposta_nome', 'create_lobby', 'join_lobby', 'toggle_infiltrato', 'start_game', 'reset_lobby', 'leave_lobby', 'evento_inventato'];
        for (const e of eventi) for (const b of brutti) c.emit(e, b);
        // Anche senza argomenti
        for (const e of eventi) c.emit(e);
        await pausa(200);
        assert.deepEqual(erroriConsole, [], 'nessuna eccezione deve essere stata intercettata');
        // Il server risponde ancora
        const d = await creaLobby(c, 'classica', 'Ancora vivo');
        assert.equal(d.success, true);
    });

    test('solo l\'host può avviare, attivare l\'infiltrato e resettare', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const ospite = await nuovo();
        await entra(ospite, codice, 'Bruno');
        const countdown = raccogli(host, 'avvia_countdown');
        const impostazioni = raccogli(host, 'aggiorna_impostazioni');
        ospite.emit('start_game', codice);
        ospite.emit('toggle_infiltrato', codice);
        await pausa(150);
        assert.equal(countdown.length, 0);
        assert.equal(impostazioni.length, 0);
    });

    test('servono almeno 2 giocatori (3 con infiltrato)', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        let errore = attendi(host, 'errore');
        host.emit('start_game');
        assert.match((await errore).messaggio, /almeno 2/);

        const b = await nuovo();
        await entra(b, codice, 'B');
        const imp = attendi(host, 'aggiorna_impostazioni');
        host.emit('toggle_infiltrato');
        assert.equal((await imp).infiltratoAbilitato, true);
        errore = attendi(host, 'errore');
        host.emit('start_game');
        assert.match((await errore).messaggio, /almeno 3/);
    });

    test('partita completa: countdown, ruoli corretti, nessuno vede i ruoli altrui', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const altri = [await nuovo(), await nuovo(), await nuovo()];
        for (const [i, g] of altri.entries()) await entra(g, codice, `G${i}`);
        const tutti = [host, ...altri];
        const countdown = tutti.map(g => attendi(g, 'avvia_countdown'));
        const ruoli = await avviaPartita(host, tutti);
        await Promise.all(countdown);
        assert.equal(ruoli.filter(r => r.ruolo === 'IMPOSTORE').length, 1);
        const parole = new Set(ruoli.filter(r => r.ruolo === 'CIVILE').map(r => r.testoPrincipale));
        assert.equal(parole.size, 1);
        assert.equal(ruoli.filter(r => r.iniziaTu).length, 1);
        // ogni messaggio contiene solo il ruolo del destinatario
        for (const r of ruoli) assert.deepEqual(Object.keys(r).sort(), ['colore', 'iniziaTu', 'ruolo', 'testoPrincipale', 'testoSecondario', 'tipoLogo']);
    });

    test('partita con infiltrato', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const altri = [await nuovo(), await nuovo()];
        for (const g of altri) await entra(g, codice, 'G');
        host.emit('toggle_infiltrato');
        await attendi(host, 'aggiorna_impostazioni');
        const ruoli = await avviaPartita(host, [host, ...altri]);
        assert.deepEqual(ruoli.map(r => r.ruolo).sort(), ['CIVILE', 'IMPOSTORE', 'INFILTRATO']);
    });

    test('doppio "inizia partita" non assegna i ruoli due volte', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const b = await nuovo();
        await entra(b, codice, 'B');
        const ruoliB = raccogli(b, 'partita_iniziata');
        const countdownB = raccogli(b, 'avvia_countdown');
        host.emit('start_game');
        host.emit('start_game');
        host.emit('start_game');
        await pausa(COUNTDOWN_MS + 250);
        assert.equal(countdownB.length, 1);
        assert.equal(ruoliB.length, 1);
    });

    test('non si entra in una partita in corso', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const b = await nuovo();
        await entra(b, codice, 'B');
        await avviaPartita(host, [host, b]);
        const c = await nuovo();
        assert.equal((await entra(c, codice, 'C')).messaggio, 'Partita già in corso!');
    });

    test('"Gioca ancora" riporta tutti in lobby e le parole non si ripetono', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const b = await nuovo();
        await entra(b, codice, 'B');
        const paroleViste = new Set();
        for (let round = 0; round < DB_TEST.length; round++) {
            const ruoli = await avviaPartita(host, [host, b]);
            const civile = ruoli.find(r => r.ruolo === 'CIVILE');
            paroleViste.add(civile.testoPrincipale);
            const lobby = attendi(b, 'torna_alla_lobby');
            host.emit('reset_lobby');
            assert.equal((await lobby).codice, codice);
        }
        assert.equal(paroleViste.size, DB_TEST.length);
    });

    test('uscire dalla lobby: l\'host passa al giocatore successivo', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host, 'classica', 'Anna');
        const b = await nuovo();
        await entra(b, codice, 'Bruno');
        const promozione = attendi(b, 'promozione_host');
        const lista = attendi(b, 'giocatore_entrato');
        host.emit('leave_lobby');
        assert.equal((await promozione).isHost, true);
        const l = await lista;
        assert.deepEqual(l.listaNomi, ['Bruno']);
        assert.equal(l.hostIndex, 0);
        // il nuovo host può avviare
        const c = await nuovo();
        await entra(c, codice, 'Carla');
        const cd = attendi(c, 'avvia_countdown');
        b.emit('start_game');
        await cd;
    });

    test('la stanza vuota viene cancellata', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        host.emit('leave_lobby');
        await pausa(100);
        assert.equal(s.stanze[codice], undefined);
        assert.equal(Object.keys(s.stanzaDi).length, 0);
    });

    test('creare una nuova lobby fa uscire dalla precedente', async () => {
        const host = await nuovo();
        const { codice: primo } = await creaLobby(host);
        const { codice: secondo } = await creaLobby(host);
        assert.notEqual(primo, secondo);
        assert.equal(s.stanze[primo], undefined);
    });

    test('TELEFONO BLOCCATO: chi si disconnette e torna entro il tempo di grazia ritrova lobby e ruolo', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const idB = nuovoId();
        const b = await nuovo(idB);
        await entra(b, codice, 'Bruno');
        const [, ruoloB] = await avviaPartita(host, [host, b]);

        const listaDisconnesso = attendi(host, 'giocatore_entrato');
        b.disconnect();
        const l = await listaDisconnesso;
        assert.equal(l.giocatori[1].connesso, false, 'deve risultare disconnesso');

        await pausa(GRACE_MS / 3);
        const b2 = await nuovo(idB);
        assert.ok(b2.sessione.stato, 'la sessione deve essere ripristinata');
        assert.equal(b2.sessione.stato.codice, codice);
        assert.equal(b2.sessione.stato.status, 'playing');
        assert.deepEqual(b2.sessione.stato.ruolo, ruoloB);

        await pausa(GRACE_MS + 100);
        assert.equal(s.stanze[codice].giocatori.length, 2, 'non deve essere stato rimosso');
        assert.equal(s.stanze[codice].giocatori[1].connesso, true);
    });

    test('ricaricare la pagina in lobby rimette nella lobby', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host, 'clash', 'Anna');
        const idHost = host.playerId;
        host.disconnect();
        const di_nuovo = await nuovo(idHost);
        assert.equal(di_nuovo.sessione.stato.codice, codice);
        assert.equal(di_nuovo.sessione.stato.isHost, true);
        assert.equal(di_nuovo.sessione.stato.modalita, 'clash');
    });

    test('chi non torna entro il tempo di grazia viene rimosso e l\'host passa a un altro', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host, 'classica', 'Anna');
        const b = await nuovo();
        await entra(b, codice, 'Bruno');
        const promozione = attendi(b, 'promozione_host', GRACE_MS + 1000);
        host.disconnect();
        await promozione;
        assert.deepEqual(s.stanze[codice].giocatori.map(g => g.nome), ['Bruno']);
    });

    test('se esce l\'impostore durante la partita gli altri vengono avvisati', async () => {
        const host = await nuovo();
        const { codice } = await creaLobby(host);
        const altri = [await nuovo(), await nuovo()];
        for (const g of altri) await entra(g, codice, 'G');
        const tutti = [host, ...altri];
        const ruoli = await avviaPartita(host, tutti);
        const iImp = ruoli.findIndex(r => r.ruolo === 'IMPOSTORE');
        const osservatore = tutti[(iImp + 1) % 3];
        const avviso = attendi(osservatore, 'giocatore_uscito');
        tutti[iImp].emit('leave_lobby');
        assert.equal((await avviso).eraImpostore, true);
    });

    test('se durante il countdown restano meno di 2 giocatori la partita viene annullata', async () => {
        const s2 = await avviaServer({ countdownMs: 400 });
        const host = await connetti(s2.url);
        const { codice } = await creaLobby(host);
        const b = await connetti(s2.url);
        await entra(b, codice, 'B');
        const lobby = attendi(host, 'torna_alla_lobby');
        const ruoli = raccogli(host, 'partita_iniziata');
        host.emit('start_game');
        await attendi(host, 'avvia_countdown');
        b.emit('leave_lobby');
        await lobby;
        await pausa(500);
        assert.equal(ruoli.length, 0);
        assert.equal(s2.stanze[codice].status, 'waiting');
        host.disconnect(); b.disconnect();
        await new Promise(r => s2.io.close(r));
    });

    test('stesso giocatore in due schede: la vecchia viene scollegata', async () => {
        const id = nuovoId();
        const a = await nuovo(id);
        const { codice } = await creaLobby(a);
        const sostituita = attendi(a, 'sessione_sostituita');
        const a2 = await nuovo(id);
        await sostituita;
        assert.equal(a2.sessione.stato.codice, codice);
        // la disconnessione della vecchia scheda non deve rimuovere il giocatore
        a.disconnect();
        await pausa(GRACE_MS + 100);
        assert.equal(s.stanze[codice].giocatori.length, 1);
        assert.equal(s.stanze[codice].giocatori[0].connesso, true);
    });

    test('molte lobby in parallelo hanno codici unici', async () => {
        const giocatori = await Promise.all(Array.from({ length: 30 }, () => nuovo()));
        const codici = await Promise.all(giocatori.map(g => creaLobby(g)));
        assert.equal(new Set(codici.map(c => c.codice)).size, 30);
    });
});

// ---------- caricamento database ----------
describe('caricamento parole', () => {
    test('il server carica i file reali e li valida', () => {
        const s = creaServer({ silenzioso: true });
        // non lancia eccezioni e restituisce un server funzionante
        assert.ok(s.server);
        s.io.close();
    });
});
