# Sviluppo locale e deployment

La prima chat testuale è implementata; media e importazione non sono ancora disponibili.
Questo documento descrive i comandi reali e distingue le predisposizioni di
deployment dalle risorse effettivamente create. Non è stato eseguito alcun
deploy Railway e nessun export personale è stato importato.

## Componenti presenti

Il progetto usa npm workspaces e un lockfile condiviso. Le versioni esatte
delle dipendenze sono nei manifest e in `package-lock.json`.

| Percorso                     | Implementazione                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web`                   | React, Vite, CSS responsive e flusso creazione/ingresso/recupero.                                      |
| `apps/server`                | Fastify, conversazioni, messaggi testuali persistenti e Socket.IO autenticato.                       |
| `packages/contracts`         | Tipi eventi e schema runtime della risposta readiness.                                               |
| `db/migrations`              | Migrazioni versionate; controllo checksum e applicazione transazionale.                                |
| `apps/server/test`           | Test persistenza, rollback, file privati, readiness e origine socket.                                |
| `infra/docker-entrypoint.sh` | Inizializzazione directory del volume e avvio senza privilegi.                                       |
| `Dockerfile`                 | Build multi-stage, Node 22, FFmpeg e gestione segnali con tini.                                      |
| `railway.json`               | Dockerfile, healthcheck e una replica. Non crea progetto o volume.                                   |

Le migrazioni includono conversazioni, membri, dispositivi, sessioni, messaggi
e hash dei segreti. Il socket espone messaggi testuali autenticati nella stanza
del membro; media, modifica/eliminazione e importazione restano da implementare.

## Esecuzione in sviluppo

Usa Node.js 22.18+ della serie 22, compatibile con l'ambiente locale già
presente. Esegui dalla radice del repository:

```sh
npm ci
npm run dev
```

La pagina è su `http://localhost:5173`; il backend è su
`http://127.0.0.1:3000`. Usa il nome `localhost` per il frontend: l'origine
socket predefinita coincide con questo URL. La porta frontend è fissa: se è
occupata, Vite segnala l'errore senza passare silenziosamente a un'altra porta.

Il database risiede in `data/chat.sqlite`, con WAL attivo. `data/media` e
`data/staging` sono directory private predisposte, senza endpoint di upload.
Questi dati restano tra due avvii locali e sono esclusi da Git e dagli upload.

Per personalizzare la configurazione, crea `.env` seguendo `.env.example`.
Le variabili fornite dal processo prevalgono sul file; il percorso dati
relativo si risolve rispetto alla radice del repository.

## Verifiche

Le verifiche sono disponibili separatamente o con un comando unico.

| Comando                | Effetto                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run typecheck`    | Controlla i tipi dei tre workspace.                                   |
| `npm test`             | Esegue i test di integrazione su directory temporanee isolate.        |
| `npm run build`        | Compila contratti, frontend e backend.                                |
| `npm run check`        | Esegue controllo tipi, test e build in sequenza.                      |
| `npm run format:check` | Controlla la formattazione del codice e delle configurazioni.         |
| `npm run format`       | Formatta codice e configurazioni; esclude documenti e dati personali. |

`GET /health/live` indica che il processo risponde. `GET /health/ready`
verifica una transazione scrivibile su SQLite e la creazione/rimozione di
file temporanei nelle directory media e staging. Se la prova fallisce,
restituisce `503` senza esporre percorsi o dettagli interni.

## Avvio della build di produzione

Il backend serve direttamente `apps/web/dist`, con header di sicurezza.
Non serve l'intera cartella del repository. La configurazione di produzione
richiede un'origine HTTPS e una directory dati esplicite.

```sh
npm run build
NODE_ENV=production PUBLIC_ORIGIN=https://chat.example DATA_DIR=./data npm start
```

`chat.example` è un esempio da sostituire con l'origine effettiva. La
terminazione TLS deve essere davanti al processo: su Railway è gestita dalla
piattaforma. Per il normale sviluppo locale usa `npm run dev`.

La build container si esegue con `docker build -t private-chat:local .`.
Serve un motore Docker attivo. Al momento della preparazione la CLI Docker
era presente, ma il daemon non era raggiungibile: la build del container
rimane da collaudare, anche se la build Node e i test locali sono verificabili.

## Predisposizione Railway

Questa procedura descrive il futuro deployment. CLI autenticata non significa
che progetto, piano e volume siano già configurati.

1. Seleziona o crea il progetto destinato alla chat e verifica il piano
   dell'account. Mantieni il budget obiettivo di 5–10 €/mese.
2. Collega la cartella al progetto corretto tramite Railway CLI.
3. Configura un solo servizio Docker e un volume persistente da 5 GB montato
   in `/data`. Usa una sola replica e disattiva lo sleep per la baseline.
4. Assegna il dominio Railway e imposta `PUBLIC_ORIGIN` all'origine HTTPS
   esatta, senza percorsi. `DATA_DIR=/data`, `NODE_ENV=production` e
   `HOST=0.0.0.0` sono già nell'immagine. La porta viene fornita da Railway.
5. Esegui la build e il deploy, verificando `/health/ready` e i log di avvio.
6. Verifica persistenza dopo un redeploy, costi e destinazione del backup
   prima di caricare contenuti reali.

Il container inizializza come root soltanto la proprietà delle tre directory
applicative del volume, senza ricorsione, poi esegue Node come utente `node`.
Un database ripristinato deve già avere permessi compatibili: la procedura
non cambia silenziosamente la proprietà di tutti i file esistenti.

La configurazione non imposta limiti di spesa sull'account: un hard limit
Railway può interrompere anche altri servizi nello stesso workspace. Backup,
avvisi di spesa e misure dei consumi restano attività prima del rilascio.

## Prossimo incremento

Implementa invio e sincronizzazione dei messaggi secondo le specifiche. La
creazione della conversazione, l'ingresso di due membri, le sessioni e il
recupero sono già il primo flusso funzionante. Solo dopo aggiungi
dei messaggi. Le prove audio, notifiche e compatibilità mobile restano aperte;
non considerare completata l'intera fase 0 con il solo scaffold.
