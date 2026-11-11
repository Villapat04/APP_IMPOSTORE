# Graph Report - APP_IMPOSTORE  (2026-11-11)

## Corpus Check
- 9 files · ~151,257 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 139 nodes · 177 edges · 12 communities (10 shown, 2 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `362625e9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lobby Client Flow
- Package Config
- Server Core
- PWA Manifest & Icons
- Game Start & Roles
- Host Management
- Join By Code
- Detective Logo
- Impostore Logo
- Infiltrato Logo
- Service Worker Cache
- Error Handling

## God Nodes (most connected - your core abstractions)
1. `creaServer()` - 19 edges
2. `mostraSchermata()` - 8 edges
3. `socket.on('partita_iniziata') handler` - 7 edges
4. `socket.on('lobby_unita') handler` - 6 edges
5. `aggiornaInterfacciaHost()` - 6 edges
6. `tornaInLobby()` - 5 edges
7. `rimuoviGiocatore()` - 5 edges
8. `attendi()` - 5 edges
9. `creaLobby()` - 5 edges
10. `datiLista()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `avviaServer()` --calls--> `creaServer()`  [EXTRACTED]
  test/server.test.js → server.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Player roles assigned at round start** — index_role_impostore, index_role_infiltrato, index_role_detective [EXTRACTED 1.00]
- **Game round flow: start_game -> countdown -> role reveal -> reset** — index_iniziapartita, index_evt_start_game, index_on_avvia_countdown, index_on_partita_iniziata, index_resetlobby, index_on_torna_alla_lobby [INFERRED 0.85]
- **Lobby create/join flow** — index_vaialmenudigioco, index_crealobby, index_uniscitiallalobby, index_on_lobby_creata, index_on_lobby_unita, index_aggiornalista [INFERRED 0.85]

## Communities (12 total, 2 thin omitted)

### Community 0 - "Lobby Client Flow"
Cohesion: 0.09
Nodes (28): aggiornaInterfacciaHost(), aggiornaLista(), Client state (codiceLobbyAttuale, isHost, modalitaSelezionata), creaLobby(), esciDallaLobby(), Socket event create_lobby, Socket event imposta_nome, Socket event join_lobby (+20 more)

### Community 1 - "Package Config"
Cohesion: 0.09
Nodes (21): author, dependencies, express, socket.io, description, devDependencies, socket.io-client, engines (+13 more)

### Community 2 - "Server Core"
Cohesion: 0.13
Nodes (19): assegnaRuoli(), caricaParole(), creaServer(), annullaCountdown(), avviaRuoli(), datiLista(), inviaLista(), rimuoviGiocatore() (+11 more)

### Community 3 - "PWA Manifest & Icons"
Cohesion: 0.12
Nodes (16): index.html (Trova l'Impostore client), Socket.io client connection, Impostore PWA App Icon (192px), Detective Disguise Motif (orange deerstalker-style cap, glowing cyan round glasses, shield badge), Hidden Identity / Social Deduction Theme, Impostore PWA App Icon (512px), Detective Disguise Motif (orange deerstalker-style cap, glowing round glasses), Shield Emblem Frame (+8 more)

### Community 4 - "Game Start & Roles"
Cohesion: 0.17
Nodes (11): Socket event start_game, Socket event toggle_infiltrato, socket.on('aggiorna_impostazioni') handler, socket.on('avvia_countdown') countdown logic, socket.on('partita_iniziata') handler, Overlay Countdown 3-2-1, Ruolo Detective (civile), Ruolo Impostore (+3 more)

### Community 5 - "Host Management"
Cohesion: 0.25
Nodes (6): attendi(), avviaPartita(), connetti(), creaLobby(), DB_TEST, entra()

### Community 6 - "Join By Code"
Cohesion: 0.20
Nodes (3): CARTE_UFFICIALI, clash, parole

### Community 7 - "Detective Logo"
Cohesion: 0.67
Nodes (3): Game Branding Visual Style (flat icon, orange/navy/cyan palette), Detective / Investigator Theme (finding the impostor), Detective Logo (orange deerstalker-style cap, glowing round glasses, shield emblem)

### Community 8 - "Impostore Logo"
Cohesion: 0.67
Nodes (3): Disguised character: fedora hiding eyes, sly grin, cigarette, Impostor role / hidden identity theme, Impostore logo (incognito figure in fedora)

### Community 9 - "Infiltrato Logo"
Cohesion: 1.00
Nodes (3): Grinning beanie-wearing character with hidden eyes and toothpick, Infiltrato role (sneaky infiltrator), Logo Infiltrato (role icon)

## Knowledge Gaps
- **22 isolated node(s):** `Socket event imposta_nome`, `Modalita Clash Royale`, `Modalita Classica`, `Schermata Lobby (codice stanza, lista giocatori)`, `Menu Partita Classica` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 67 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Socket.io client connection` connect `PWA Manifest & Icons` to `Server Core`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `socket.on('lobby_unita') handler` (e.g. with `Socket event join_lobby` and `socket.on('torna_alla_lobby') handler`) actually correct?**
  _`socket.on('lobby_unita') handler` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Socket event imposta_nome`, `Modalita Clash Royale`, `Modalita Classica` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lobby Client Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.09359605911330049 - nodes in this community are weakly interconnected._
- **Why does `creaServer()` connect `Server Core` to `Host Management`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Should `Package Config` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `Server Core` be split into smaller, more focused modules?**
  _Cohesion score 0.12923076923076923 - nodes in this community are weakly interconnected._