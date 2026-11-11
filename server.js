const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');

// --- CONFIGURAZIONE ---
const MODALITA_VALIDE = ['classica', 'clash'];
const MAX_GIOCATORI_PER_STANZA = 20;
const MAX_STANZE = 2000;
const LUNGHEZZA_MAX_NOME = 12;

// --- CARICAMENTO DATABASE ---
// Ogni file viene caricato separatamente: se uno è rotto, l'altro continua a funzionare.
function caricaParole(nomeFile, fallback) {
    try {
        const dati = JSON.parse(fs.readFileSync(path.join(__dirname, nomeFile), 'utf8'));
        if (!Array.isArray(dati)) throw new Error('il file non contiene una lista');
        const valide = dati.filter(c =>
            c && typeof c.parola === 'string' && c.parola.trim() &&
            Array.isArray(c.infiltrato) &&
            c.infiltrato.some(p => typeof p === 'string' && p.trim())
        ).map(c => ({
            parola: c.parola.trim(),
            infiltrato: c.infiltrato.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
        }));
        if (valide.length === 0) throw new Error('nessuna parola valida');
        return valide;
    } catch (e) {
        console.error(`[ERRORE DB] ${nomeFile}: ${e.message}. Uso fallback.`);
        return fallback;
    }
}

// --- FUNZIONI DI SUPPORTO (pure, testabili) ---
function generaNomeCasuale() {
    const nomi = ["Squalo", "Tigre", "Drago", "Ninja", "Fantasma", "Alieno", "Pirata", "Orso", "Falco"];
    const aggettivi = ["Rosso", "Blu", "Verde", "Veloce", "Magico", "Freddo", "Grande", "Piccolo"];
    let nome;
    // Rigenera finché il nome sta nel limite, così non viene mai troncato a metà parola
    do {
        nome = `${nomi[Math.floor(Math.random() * nomi.length)]} ${aggettivi[Math.floor(Math.random() * aggettivi.length)]}`;
    } while (nome.length > LUNGHEZZA_MAX_NOME);
    return nome;
}

function pulisciNome(valore) {
    if (typeof valore !== 'string') return null;
    // Rimuove caratteri di controllo e spazi multipli
    const nome = valore.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().substring(0, LUNGHEZZA_MAX_NOME).trim();
    return nome.length > 0 ? nome : null;
}

function pulisciCodice(valore) {
    if (typeof valore !== 'string') return null;
    const codice = valore.trim().toUpperCase();
    return /^[A-Z]{4}$/.test(codice) ? codice : null;
}

function pulisciModalita(valore) {
    return MODALITA_VALIDE.includes(valore) ? valore : 'classica';
}

function idGiocatoreValido(valore) {
    return typeof valore === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(valore);
}

// Sceglie una carta non ancora uscita in questa stanza; quando le ha usate tutte ricomincia.
function scegliCarta(database, usate) {
    if (usate.size >= database.length) usate.clear();
    const disponibili = [];
    for (let i = 0; i < database.length; i++) if (!usate.has(i)) disponibili.push(i);
    const indice = disponibili[Math.floor(Math.random() * disponibili.length)];
    usate.add(indice);
    return database[indice];
}

// Assegna ruoli: un impostore, opzionalmente un infiltrato, il resto civili.
// Chi inizia è pesato: impostore 1 biglietto, infiltrato 3, civili 5.
function assegnaRuoli(numeroGiocatori, infiltratoAbilitato, carta) {
    const indici = [...Array(numeroGiocatori).keys()];
    const indiceImpostore = indici.splice(Math.floor(Math.random() * indici.length), 1)[0];

    let indiceInfiltrato = -1;
    // Serve almeno un civile oltre all'infiltrato, altrimenti il ruolo non ha senso
    if (infiltratoAbilitato && indici.length >= 2) {
        indiceInfiltrato = indici.splice(Math.floor(Math.random() * indici.length), 1)[0];
    }

    const biglietti = [];
    for (let i = 0; i < numeroGiocatori; i++) {
        const quanti = i === indiceImpostore ? 1 : (i === indiceInfiltrato ? 3 : 5);
        for (let k = 0; k < quanti; k++) biglietti.push(i);
    }
    const indiceChiInizia = biglietti[Math.floor(Math.random() * biglietti.length)];

    const parolaCivile = carta.parola;
    const parolaInfiltrato = carta.infiltrato[Math.floor(Math.random() * carta.infiltrato.length)];

    const ruoli = [];
    for (let i = 0; i < numeroGiocatori; i++) {
        const dati = { iniziaTu: i === indiceChiInizia };
        if (i === indiceImpostore) {
            Object.assign(dati, { ruolo: "IMPOSTORE", testoPrincipale: "SEI L'IMPOSTORE", testoSecondario: "Non farti scoprire!", colore: "#d32f2f", tipoLogo: "impostore" });
        } else if (i === indiceInfiltrato) {
            Object.assign(dati, { ruolo: "INFILTRATO", testoPrincipale: parolaInfiltrato, testoSecondario: "Parola dell'Infiltrato", colore: "#fbc02d", tipoLogo: "infiltrato" });
        } else {
            Object.assign(dati, { ruolo: "CIVILE", testoPrincipale: parolaCivile, testoSecondario: "Parola Segreta", colore: "#2e7d32", tipoLogo: "detective" });
        }
        ruoli.push(dati);
    }
    return ruoli;
}

// --- SERVER ---
function creaServer(opzioni = {}) {
    const graceMs = opzioni.graceMs ?? Number(process.env.GRACE_MS || 60000);
    const countdownMs = opzioni.countdownMs ?? Number(process.env.COUNTDOWN_MS || 3500);
    const dbClassico = opzioni.dbClassico || caricaParole('words.json', [{ parola: "Pizza", infiltrato: ["Pasta"] }]);
    const dbClash = opzioni.dbClash || caricaParole('words_clash.json', [{ parola: "Gigante", infiltrato: ["Golem"] }]);
    const log = opzioni.silenzioso ? () => {} : console.log;

    log(`[SERVER] Caricate ${dbClassico.length} parole Classiche e ${dbClash.length} Clash.`);

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    // Endpoint leggero per UptimeRobot: non scarica la pagina intera
    app.get('/health', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.type('text/plain').send('ok');
    });

    app.get(['/', '/index.html'], (req, res) => {
        res.set('Cache-Control', 'no-cache');
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    app.use(express.static(path.join(__dirname, 'public'), {
        setHeaders: (res, filePath) => {
            // Il service worker deve essere sempre ricontrollato, altrimenti gli aggiornamenti non arrivano
            if (filePath.endsWith('service-worker.js')) res.set('Cache-Control', 'no-cache');
        }
    }));

    const stanze = {};          // codice -> stanza
    const stanzaDi = {};        // playerId -> codice

    function generaCodice() {
        const caratteri = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let codice;
        do {
            codice = '';
            for (let i = 0; i < 4; i++) codice += caratteri.charAt(Math.floor(Math.random() * caratteri.length));
        } while (stanze[codice]);
        return codice;
    }

    function nomeUnico(stanza, nome, escludiId) {
        const usati = new Set(stanza.giocatori.filter(g => g.id !== escludiId).map(g => g.nome.toLowerCase()));
        if (!usati.has(nome.toLowerCase())) return nome;
        const base = nome.substring(0, LUNGHEZZA_MAX_NOME - 3).trim();
        for (let n = 2; ; n++) {
            const candidato = `${base} ${n}`;
            if (!usati.has(candidato.toLowerCase())) return candidato;
        }
    }

    function datiLista(stanza) {
        return {
            listaNomi: stanza.giocatori.map(g => g.nome),
            giocatori: stanza.giocatori.map(g => ({ nome: g.nome, host: g.id === stanza.hostId, connesso: g.connesso })),
            hostIndex: stanza.giocatori.findIndex(g => g.id === stanza.hostId)
        };
    }

    function inviaLista(stanza) {
        io.to(stanza.codice).emit('giocatore_entrato', datiLista(stanza));
    }

    function statoPer(stanza, playerId) {
        return {
            codice: stanza.codice,
            modalita: stanza.modalita,
            infiltratoAbilitato: stanza.infiltratoAbilitato,
            isHost: stanza.hostId === playerId,
            status: stanza.status,
            ruolo: stanza.status === 'playing' ? (stanza.ruoli[playerId] || null) : null,
            ...datiLista(stanza)
        };
    }

    function stanzaDelGiocatore(playerId) {
        const codice = stanzaDi[playerId];
        return codice ? stanze[codice] : null;
    }

    function annullaCountdown(stanza) {
        if (stanza.timerCountdown) clearTimeout(stanza.timerCountdown);
        stanza.timerCountdown = null;
    }

    function tornaInLobby(stanza) {
        annullaCountdown(stanza);
        stanza.status = 'waiting';
        stanza.ruoli = {};
        io.to(stanza.codice).emit('torna_alla_lobby', {
            codice: stanza.codice,
            infiltratoAbilitato: stanza.infiltratoAbilitato,
            modalita: stanza.modalita,
            ...datiLista(stanza)
        });
    }

    function rimuoviGiocatore(playerId) {
        const stanza = stanzaDelGiocatore(playerId);
        delete stanzaDi[playerId];
        if (!stanza) return;

        const indice = stanza.giocatori.findIndex(g => g.id === playerId);
        if (indice === -1) return;
        const [giocatore] = stanza.giocatori.splice(indice, 1);
        if (giocatore.timerUscita) clearTimeout(giocatore.timerUscita);

        const socketVecchio = giocatore.socketId && io.sockets.sockets.get(giocatore.socketId);
        if (socketVecchio) socketVecchio.leave(stanza.codice);

        if (stanza.giocatori.length === 0) {
            annullaCountdown(stanza);
            delete stanze[stanza.codice];
            return;
        }

        if (stanza.hostId === playerId) {
            // Il nuovo host è il primo giocatore connesso (o il primo in lista)
            const nuovoHost = stanza.giocatori.find(g => g.connesso) || stanza.giocatori[0];
            stanza.hostId = nuovoHost.id;
            if (nuovoHost.connesso) io.to(nuovoHost.socketId).emit('promozione_host', { isHost: true });
        }

        if (stanza.status !== 'waiting') {
            io.to(stanza.codice).emit('giocatore_uscito', {
                nome: giocatore.nome,
                eraImpostore: stanza.ruoli[playerId]?.ruolo === 'IMPOSTORE'
            });
            delete stanza.ruoli[playerId];
            // Se durante il countdown restano troppo pochi giocatori, si torna in lobby
            if (stanza.status === 'countdown' && stanza.giocatori.length < 2) {
                tornaInLobby(stanza);
                io.to(stanza.codice).emit('errore', { messaggio: 'Troppi giocatori sono usciti, partita annullata.' });
            }
        }

        inviaLista(stanza);
    }

    function avviaRuoli(stanza) {
        stanza.timerCountdown = null;
        if (stanze[stanza.codice] !== stanza || stanza.status !== 'countdown') return;
        if (stanza.giocatori.length < 2) {
            tornaInLobby(stanza);
            return;
        }

        const database = stanza.modalita === 'clash' ? dbClash : dbClassico;
        const usate = stanza.paroleUsate[stanza.modalita];
        const carta = scegliCarta(database, usate);
        const ruoli = assegnaRuoli(stanza.giocatori.length, stanza.infiltratoAbilitato, carta);

        stanza.status = 'playing';
        stanza.ruoli = {};
        stanza.giocatori.forEach((g, i) => {
            stanza.ruoli[g.id] = ruoli[i];
            if (g.connesso) io.to(g.socketId).emit('partita_iniziata', ruoli[i]);
        });
    }

    io.on('connection', (socket) => {
        const auth = socket.handshake.auth || {};
        const playerId = idGiocatoreValido(auth.playerId) ? auth.playerId : crypto.randomUUID();
        socket.data.playerId = playerId;
        socket.data.nome = pulisciNome(auth.nome) || generaNomeCasuale();

        // Registra un handler che non può far crashare il server
        const on = (evento, gestore) => {
            socket.on(evento, (...args) => {
                try {
                    gestore(...args);
                } catch (e) {
                    console.error(`[ERRORE] evento "${evento}":`, e);
                }
            });
        };

        // --- RIPRISTINO SESSIONE (telefono bloccato, rete persa, pagina ricaricata) ---
        const stanzaEsistente = stanzaDelGiocatore(playerId);
        const giocatoreEsistente = stanzaEsistente && stanzaEsistente.giocatori.find(g => g.id === playerId);
        if (giocatoreEsistente) {
            if (giocatoreEsistente.socketId && giocatoreEsistente.socketId !== socket.id) {
                const vecchio = io.sockets.sockets.get(giocatoreEsistente.socketId);
                if (vecchio) {
                    vecchio.data.sostituito = true;
                    vecchio.leave(stanzaEsistente.codice);
                    vecchio.emit('sessione_sostituita');
                }
            }
            if (giocatoreEsistente.timerUscita) clearTimeout(giocatoreEsistente.timerUscita);
            giocatoreEsistente.timerUscita = null;
            giocatoreEsistente.socketId = socket.id;
            giocatoreEsistente.connesso = true;
            socket.data.nome = giocatoreEsistente.nome;
            socket.join(stanzaEsistente.codice);
            socket.emit('sessione', { playerId, stato: statoPer(stanzaEsistente, playerId) });
            socket.to(stanzaEsistente.codice).emit('giocatore_entrato', datiLista(stanzaEsistente));
        } else {
            socket.emit('sessione', { playerId, stato: null });
        }

        on('imposta_nome', (nuovoNome) => {
            const nome = pulisciNome(nuovoNome);
            if (nome) socket.data.nome = nome;
        });

        on('create_lobby', (dati) => {
            // Accetta sia la vecchia forma ('classica') sia { modalita, nome }
            const opzioni = (dati && typeof dati === 'object') ? dati : { modalita: dati };
            const nome = pulisciNome(opzioni.nome);
            if (nome) socket.data.nome = nome;

            if (Object.keys(stanze).length >= MAX_STANZE) {
                socket.emit('errore', { messaggio: 'Server pieno, riprova tra poco.' });
                return;
            }

            if (stanzaDi[playerId]) rimuoviGiocatore(playerId);

            const codice = generaCodice();
            const modalita = pulisciModalita(opzioni.modalita);
            const stanza = {
                codice,
                hostId: playerId,
                giocatori: [{ id: playerId, nome: socket.data.nome, socketId: socket.id, connesso: true, timerUscita: null }],
                status: 'waiting',
                infiltratoAbilitato: false,
                modalita,
                paroleUsate: { classica: new Set(), clash: new Set() },
                ruoli: {},
                timerCountdown: null
            };
            stanze[codice] = stanza;
            stanzaDi[playerId] = codice;
            socket.join(codice);

            socket.emit('lobby_creata', {
                success: true,
                codice,
                isHost: true,
                infiltratoAbilitato: false,
                modalita,
                ...datiLista(stanza)
            });
        });

        on('toggle_infiltrato', () => {
            const stanza = stanzaDelGiocatore(playerId);
            if (!stanza || stanza.hostId !== playerId || stanza.status !== 'waiting') return;
            stanza.infiltratoAbilitato = !stanza.infiltratoAbilitato;
            io.to(stanza.codice).emit('aggiorna_impostazioni', { infiltratoAbilitato: stanza.infiltratoAbilitato });
        });

        on('join_lobby', (dati) => {
            const opzioni = (dati && typeof dati === 'object') ? dati : { codice: dati };
            const codice = pulisciCodice(opzioni.codice);
            const nome = pulisciNome(opzioni.nome);
            if (nome) socket.data.nome = nome;

            if (!codice) {
                socket.emit('lobby_unita', { success: false, messaggio: 'Codice non valido!' });
                return;
            }
            const stanza = stanze[codice];
            if (!stanza) {
                socket.emit('lobby_unita', { success: false, messaggio: 'Codice non trovato!' });
                return;
            }

            // Già dentro (doppio click o ripristino): rimanda solo lo stato
            if (stanza.giocatori.some(g => g.id === playerId)) {
                socket.join(codice);
                socket.emit('lobby_unita', { success: true, ...statoPer(stanza, playerId) });
                return;
            }

            if (stanza.status !== 'waiting') {
                socket.emit('lobby_unita', { success: false, messaggio: 'Partita già in corso!' });
                return;
            }
            if (stanza.giocatori.length >= MAX_GIOCATORI_PER_STANZA) {
                socket.emit('lobby_unita', { success: false, messaggio: 'Lobby piena!' });
                return;
            }

            if (stanzaDi[playerId]) rimuoviGiocatore(playerId);

            const nomeFinale = nomeUnico(stanza, socket.data.nome, playerId);
            stanza.giocatori.push({ id: playerId, nome: nomeFinale, socketId: socket.id, connesso: true, timerUscita: null });
            stanzaDi[playerId] = codice;
            socket.join(codice);

            socket.emit('lobby_unita', { success: true, ...statoPer(stanza, playerId) });
            socket.to(codice).emit('giocatore_entrato', datiLista(stanza));
        });

        on('start_game', () => {
            const stanza = stanzaDelGiocatore(playerId);
            if (!stanza || stanza.hostId !== playerId) return;
            if (stanza.status !== 'waiting') return; // blocca il doppio avvio

            const minGiocatori = stanza.infiltratoAbilitato ? 3 : 2;
            if (stanza.giocatori.length < minGiocatori) {
                socket.emit('errore', { messaggio: `Servono almeno ${minGiocatori} giocatori per iniziare.` });
                return;
            }

            stanza.status = 'countdown';
            io.to(stanza.codice).emit('avvia_countdown');
            stanza.timerCountdown = setTimeout(() => {
                try { avviaRuoli(stanza); } catch (e) { console.error('[ERRORE] avvio ruoli:', e); }
            }, countdownMs);
        });

        on('reset_lobby', () => {
            const stanza = stanzaDelGiocatore(playerId);
            if (!stanza || stanza.hostId !== playerId || stanza.status === 'waiting') return;
            tornaInLobby(stanza);
        });

        on('leave_lobby', () => {
            if (stanzaDi[playerId]) rimuoviGiocatore(playerId);
        });

        on('disconnect', () => {
            if (socket.data.sostituito) return;
            const stanza = stanzaDelGiocatore(playerId);
            const giocatore = stanza && stanza.giocatori.find(g => g.id === playerId);
            if (!giocatore || giocatore.socketId !== socket.id) return;

            // Non lo togliamo subito: può essere solo il telefono bloccato.
            giocatore.connesso = false;
            inviaLista(stanza);
            giocatore.timerUscita = setTimeout(() => {
                try {
                    if (!giocatore.connesso) rimuoviGiocatore(playerId);
                } catch (e) { console.error('[ERRORE] rimozione giocatore:', e); }
            }, graceMs);
        });
    });

    return { app, server, io, stanze, stanzaDi };
}

module.exports = { creaServer, caricaParole, scegliCarta, assegnaRuoli, pulisciNome, pulisciCodice, pulisciModalita, idGiocatoreValido, generaNomeCasuale };

if (require.main === module) {
    const { server } = creaServer();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`SERVER ATTIVO! Porta ${PORT}`);
    });
}
