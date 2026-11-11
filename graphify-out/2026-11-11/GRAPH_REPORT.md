# Graph Report - APP_IMPOSTORE  (2026-11-11)

## Corpus Check
- 14 files · ~143,492 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 102 nodes · 108 edges · 12 communities (10 shown, 2 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.83)
- Token cost: 394,426 input · 0 output

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
1. `mostraSchermata()` - 8 edges
2. `socket.on('partita_iniziata') handler` - 7 edges
3. `aggiornaInterfacciaHost()` - 6 edges
4. `socket.on('lobby_unita') handler` - 6 edges
5. `creaLobby()` - 5 edges
6. `aggiornaLista()` - 4 edges
7. `vaiAlMenuDiGioco()` - 4 edges
8. `socket.on('lobby_creata') handler` - 4 edges
9. `socket.on('torna_alla_lobby') handler` - 4 edges
10. `Client state (codiceLobbyAttuale, isHost, modalitaSelezionata)` - 4 edges

## Surprising Connections (you probably didn't know these)
- `esciDallaLobby()` --calls--> `mostraSchermata()`  [EXTRACTED]
  index.html → index.html  _Bridges community 0 → community 5_
- `socket.on('partita_iniziata') handler` --calls--> `mostraSchermata()`  [EXTRACTED]
  index.html → index.html  _Bridges community 0 → community 4_
- `uniscitiAllaLobby()` --references--> `Socket event join_lobby`  [EXTRACTED]
  index.html → index.html  _Bridges community 6 → community 0_
- `socket.on('partita_iniziata') handler` --calls--> `aggiornaInterfacciaHost()`  [EXTRACTED]
  index.html → index.html  _Bridges community 5 → community 4_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Game round flow: start_game -> countdown -> role reveal -> reset** — index_iniziapartita, index_evt_start_game, index_on_avvia_countdown, index_on_partita_iniziata, index_resetlobby, index_on_torna_alla_lobby [INFERRED 0.85]
- **Lobby create/join flow** — index_vaialmenudigioco, index_crealobby, index_uniscitiallalobby, index_on_lobby_creata, index_on_lobby_unita, index_aggiornalista [INFERRED 0.85]
- **Player roles assigned at round start** — index_role_impostore, index_role_infiltrato, index_role_detective [EXTRACTED 1.00]

## Communities (12 total, 2 thin omitted)

### Community 0 - "Lobby Client Flow"
Cohesion: 0.12
Nodes (20): aggiornaLista(), Client state (codiceLobbyAttuale, isHost, modalitaSelezionata), creaLobby(), Socket event create_lobby, Socket event imposta_nome, Socket event join_lobby, Socket event reset_lobby, Modalita Clash Royale (+12 more)

### Community 1 - "Package Config"
Cohesion: 0.11
Nodes (18): author, dependencies, express, socket.io, description, engines, node, keywords (+10 more)

### Community 2 - "Server Core"
Cohesion: 0.13
Nodes (9): index.html (Trova l'Impostore client), Socket.io client connection, app, dbClash, dbClassico, giocatoriConnessi, io, server (+1 more)

### Community 3 - "PWA Manifest & Icons"
Cohesion: 0.13
Nodes (14): Impostore PWA App Icon (192px), Detective Disguise Motif (orange deerstalker-style cap, glowing cyan round glasses, shield badge), Hidden Identity / Social Deduction Theme, Impostore PWA App Icon (512px), Detective Disguise Motif (orange deerstalker-style cap, glowing round glasses), Shield Emblem Frame, background_color, description (+6 more)

### Community 4 - "Game Start & Roles"
Cohesion: 0.17
Nodes (11): Socket event start_game, Socket event toggle_infiltrato, socket.on('aggiorna_impostazioni') handler, socket.on('avvia_countdown') countdown logic, socket.on('partita_iniziata') handler, Overlay Countdown 3-2-1, Ruolo Detective (civile), Ruolo Impostore (+3 more)

### Community 5 - "Host Management"
Cohesion: 0.50
Nodes (5): aggiornaInterfacciaHost(), esciDallaLobby(), Socket event leave_lobby, Lobby Host (capo stanza), socket.on('promozione_host') handler

### Community 6 - "Join By Code"
Cohesion: 0.67
Nodes (3): Codice Lobby (4 lettere), Menu Unisciti (inserisci codice), uniscitiAllaLobby()

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
- **22 isolated node(s):** `socket.on('aggiorna_impostazioni') handler`, `socket.on('errore') handler`, `Schermata Principale (name entry)`, `Menu Partita Classica`, `Menu Modalita Clash Royale` (+17 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 59 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `index.html (Trova l'Impostore client)` connect `Server Core` to `PWA Manifest & Icons`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `socket.on('lobby_unita') handler` (e.g. with `Socket event join_lobby` and `socket.on('torna_alla_lobby') handler`) actually correct?**
  _`socket.on('lobby_unita') handler` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `socket.on('aggiorna_impostazioni') handler`, `socket.on('errore') handler`, `Schermata Principale (name entry)` to the rest of the system?**
  _22 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lobby Client Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.12380952380952381 - nodes in this community are weakly interconnected._
- **Why does `mostraSchermata()` connect `Lobby Client Flow` to `Game Start & Roles`, `Host Management`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `Package Config` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `Server Core` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._