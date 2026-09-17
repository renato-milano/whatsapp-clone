# Chat privata via link

Questo repository raccoglie le specifiche per una webapp di messaggistica
privata, con esperienza visiva ispirata a WhatsApp e importazione iniziale
dello storico. La documentazione è in italiano, come la richiesta di progetto.
È presente la prima fetta funzionale: creazione della conversazione, ingresso
tramite invito, sessione persistente nel browser e recupero tramite codice.
React, Fastify, SQLite, contratti TypeScript e Socket.IO sono già collegati;
messaggi testuali e sincronizzazione realtime sono ora disponibili; media e
importazione restano da realizzare.

Il perimetro confermato è una conversazione fra due persone, accessibile
tramite un link stabile, con nome richiesto al primo ingresso sul dispositivo.
Un unico server mantiene messaggi e allegati; l'interfaccia funziona su
telefono e computer, senza cifratura end-to-end. Le scelte non confermate
sono esplicite nel registro decisionale.

## Avvio locale

Usa Node.js 22.18 o successivo della serie 22 e npm. Dalla radice del progetto
installa le dipendenze e avvia i due servizi:

```sh
npm ci
npm run dev
```

Apri `http://localhost:5173`. La schermata iniziale verifica la disponibilità
del database e la connessione realtime. Il backend ascolta su
`http://127.0.0.1:3000`; Vite inoltra API e socket alla stessa origine del
frontend. Il database locale è creato in `data/chat.sqlite`.

Non serve un file `.env` con la configurazione predefinita. `.env.example`
elenca le variabili configurabili; non inserire segreti nel frontend.

```sh
npm run check
```

Questo comando verifica i tipi, esegue i test e compila frontend e backend.
Per dettagli su struttura, avvio di produzione e configurazione Railway,
leggi [Sviluppo locale e deployment](docs/09-sviluppo-locale.md).

## Come utilizzare il dossier

Per iniziare lo sviluppo, leggi prima requisiti e decisioni, poi applica le
specifiche del singolo ambito. Questi documenti costituiscono deliverable
complementari, non descrizioni di funzionalità già disponibili.

| Documento                                                  | Risultato atteso                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------- |
| [Requisiti di prodotto](docs/01-prodotto.md)               | Perimetro della prima versione e comportamenti verificabili.     |
| [Interfaccia ed esperienza](docs/02-interfaccia.md)        | Schermate, componenti, interazioni e riferimenti visivi.         |
| [Identità e sicurezza](docs/03-accesso-sicurezza.md)       | Accesso via link, recupero, ruoli e confini di riservatezza.     |
| [Architettura e gestione](docs/04-architettura.md)         | Stack proposto, affidabilità, deployment e backup.               |
| [Dati e contratti](docs/05-dati-api.md)                    | Entità, vincoli, endpoint ed eventi realtime.                    |
| [Importazione WhatsApp](docs/06-importazione.md)           | Analisi dell'export reale e procedura di migrazione.             |
| [Sviluppo e collaudo](docs/07-sviluppo-collaudo.md)        | Fasi, dipendenze, prove di accettazione e rilascio.              |
| [Decisioni e questioni aperte](docs/08-decisioni.md)       | Assunzioni, alternative e punti da risolvere.                    |
| [Sviluppo locale e deployment](docs/09-sviluppo-locale.md) | Comandi effettivi, stato implementato e predisposizione Railway. |

## Stato e regole di lettura

La baseline documentale è del 16 settembre 2026. **Deve** indica un requisito
della versione proposta; **proposto** indica una scelta modificabile prima
dell'implementazione. Le priorità sono P0, obbligatorio per la prima versione
utilizzabile; P1, miglioramento successivo; P2, fuori dal primo ciclo.

L'export locale è stato analizzato senza modificarlo. Il dossier contiene
soltanto statistiche e esempi inventati: non riproduce i messaggi personali.
Prima di inizializzare Git o collegare servizi esterni, escludi la cartella
`WhatsApp Chat Export/`, gli archivi di importazione, i media, i database e i
segreti. Non usare l'export personale come fixture pubblica o in CI.

## Prossimi passi

Stack e provider sono confermati. Il prossimo incremento è l'invio e la
sincronizzazione dei messaggi secondo il
[piano di sviluppo](docs/07-sviluppo-collaudo.md). Gli screenshot possono
affinare la fedeltà visiva senza impedire la definizione del resto del progetto.
