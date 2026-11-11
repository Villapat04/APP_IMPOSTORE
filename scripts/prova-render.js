// Prova manuale sul server pubblicato: node scripts/prova-render.js https://indirizzo.onrender.com
// Crea poche lobby (al massimo ~30 giocatori simulati), gioca alcuni round e chiude tutto.
const ioc = require('socket.io-client');
const URL = process.argv[2] || 'https://impostore-2uto.onrender.com';
const pausa = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
const aperti = [];

function attendi(s, ev, ms = 15000) {
    return new Promise((ok, ko) => {
        const t = setTimeout(() => ko(new Error(`timeout "${ev}" per ${s.nome}`)), ms);
        s.once(ev, d => { clearTimeout(t); ok(d); });
    });
}
async function connetti(nome, playerId = `prova-${Date.now()}-${++n}`) {
    const s = ioc(URL, { auth: { playerId }, forceNew: true, transports: ['websocket'], reconnection: false });
    s.nome = nome; s.playerId = playerId;
    const t0 = Date.now();
    s.sessione = await attendi(s, 'sessione');
    s.msConnessione = Date.now() - t0;
    aperti.push(s);
    return s;
}
async function lobby(num, modalita) {
    const host = await connetti('Host');
    const p = attendi(host, 'lobby_creata');
    host.emit('create_lobby', { modalita, nome: 'TestHost' });
    const { codice } = await p;
    const gioc = [host];
    await Promise.all(Array.from({ length: num - 1 }, async (_, i) => {
        const g = await connetti(`G${i + 1}`);
        const r = attendi(g, 'lobby_unita');
        g.emit('join_lobby', { codice, nome: `Test${i + 1}` });
        const e = await r;
        if (!e.success) throw new Error(e.messaggio);
        gioc.push(g);
    }));
    return { codice, host, gioc, modalita };
}
async function round(l) {
    const t0 = Date.now();
    const ruoli = l.gioc.map(g => attendi(g, 'partita_iniziata'));
    l.host.emit('start_game');
    const r = await Promise.all(ruoli);
    const ms = Date.now() - t0;
    const imp = r.filter(x => x.ruolo === 'IMPOSTORE').length;
    const inf = r.filter(x => x.ruolo === 'INFILTRATO').length;
    const civ = new Set(r.filter(x => x.ruolo === 'CIVILE').map(x => x.testoPrincipale));
    const inizia = r.filter(x => x.iniziaTu).length;
    const ok = imp === 1 && civ.size === 1 && inizia === 1 && inf === (l.infiltrato ? 1 : 0);
    const ritorni = l.gioc.map(g => attendi(g, 'torna_alla_lobby'));
    l.host.emit('reset_lobby');
    await Promise.all(ritorni);
    return { ok, parola: [...civ][0], ms, inf };
}

(async () => {
    const esito = [];
    const log = (...a) => { console.log(...a); };
    try {
        const t0 = Date.now();
        const lob = await Promise.all([lobby(3, 'classica'), lobby(8, 'clash'), lobby(20, 'classica')]);
        log(`3 lobby create (3, 8, 20 giocatori) in ${Date.now() - t0} ms`);
        const conn = aperti.map(s => s.msConnessione).sort((a, b) => a - b);
        log(`connessione giocatori: mediana ${conn[conn.length >> 1]} ms, max ${conn.at(-1)} ms`);

        // infiltrato nella lobby da 8 e da 20
        for (const l of [lob[1], lob[2]]) {
            const p = attendi(l.host, 'aggiorna_impostazioni');
            l.host.emit('toggle_infiltrato');
            l.infiltrato = (await p).infiltratoAbilitato;
        }

        for (let k = 0; k < 3; k++) {
            const res = await Promise.all(lob.map(round));
            res.forEach((r, i) => esito.push(r.ok));
            log(`round ${k + 1}: ` + res.map((r, i) => `${lob[i].gioc.length}gioc ${r.ok ? 'OK' : 'ERRORE'} "${r.parola}" (${r.ms} ms, di cui 3500 countdown)`).join(' | '));
        }

        // rientro dopo disconnessione a metà partita
        const l = lob[2];
        const ruoli = l.gioc.map(g => attendi(g, 'partita_iniziata'));
        l.host.emit('start_game');
        const r = await Promise.all(ruoli);
        const caduto = l.gioc[7];
        caduto.disconnect();
        await pausa(1500);
        const back = await connetti('Rientro', caduto.playerId);
        const stesso = JSON.stringify(back.sessione.stato?.ruolo) === JSON.stringify(r[7]);
        esito.push(stesso);
        log(`disconnessione + rientro dopo 1,5 s: ${stesso ? 'OK, stesso ruolo' : 'ERRORE'}`);

        // uscita dell'host durante la partita
        const nuovoHost = l.gioc[1];
        const promo = attendi(nuovoHost, 'promozione_host');
        l.host.emit('leave_lobby');
        await promo;
        esito.push(true);
        log('uscita host: nuovo host promosso OK');

        // latenza andata/ritorno con un evento semplice
        const lat = [];
        for (let i = 0; i < 10; i++) {
            const t = Date.now();
            const p = attendi(lob[0].host, 'aggiorna_impostazioni');
            lob[0].host.emit('toggle_infiltrato');
            await p; lat.push(Date.now() - t);
        }
        lat.sort((a, b) => a - b);
        log(`latenza evento: mediana ${lat[5]} ms, max ${lat[9]} ms`);
    } catch (e) {
        esito.push(false);
        console.error('ERRORE:', e.message);
    } finally {
        aperti.forEach(s => { s.emit('leave_lobby'); s.disconnect(); });
        await pausa(500);
        const ok = esito.filter(Boolean).length;
        console.log(`\nRISULTATO: ${ok}/${esito.length} controlli superati`);
        process.exit(esito.every(Boolean) ? 0 : 1);
    }
})();
