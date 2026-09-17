# Piano di sviluppo e collaudo

Lo sviluppo procede per incrementi verificabili, dalla conversazione testuale
all'uso quotidiano con media e storico importato. Ogni fase termina con una
dimostrazione su due sessioni indipendenti. Il rilascio personale completo
richiede tutte le funzioni P0, non soltanto una schermata simile a WhatsApp.

## Prerequisiti e organizzazione

Il perimetro confermato è web mobile e desktop, due membri per chat e nessuna
E2EE. Railway è il provider scelto, con budget obiettivo 5–10 €/mese.
Prima di implementare conferma i dispositivi/browser reali e il modello di
recupero proposto. Le attività indipendenti, come
il prototipo visivo e le fixture sintetiche del parser, possono procedere
mentre si completano le prove sui dispositivi reali.

Struttura proposta per il codice futuro:

```text
apps/
  web/                 # UI, PWA, coda locale
  server/              # API, realtime, job e accessi
packages/
  contracts/           # Schemi condivisi e codici errore
  import-parser/       # Parsing puro e normalizzazione export
db/
  migrations/          # Schema e indici versionati
tests/
  fixtures/synthetic/  # Export e media non personali
  e2e/                 # Scenari con due browser
infra/                 # Container, proxy e procedure backup
docs/                  # Specifiche e procedure operative
```

Sono ora presenti `apps/web`, `apps/server`, `packages/contracts`,
`db/migrations` e `infra`; parser, fixture ed end-to-end sono ancora futuri.
I test iniziali risiedono in `apps/server/test`. `.gitignore`, `.dockerignore`
e `.railwayignore` escludono export personale, dati e segreti. Sono disponibili
controllo tipi, test, build e formatter; un linter dedicato non è configurato.
I comandi effettivi sono in [Sviluppo locale](09-sviluppo-locale.md).

## Fase 0 — decisioni e prove tecniche

Questa fase verifica i rischi che influenzano lo schema dati e il comportamento
sui dispositivi target. Dipende soltanto dalle risposte sui browser reali.

1. Conferma stack, progetto e volume Railway, dominio e backup esterno.
2. Definisci contratto sessione, invito, recupero e revoca; verifica con due
   profili browser l'esperienza di ritorno.
3. Crea una prova di registrazione/riproduzione vocale su mobile e desktop,
   inclusi un `.opus` reale in locale e un derivato riproducibile.
4. Verifica Web Push sui dispositivi effettivi e documenta il percorso PWA
   quando necessario; non renderlo obbligatorio per usare la chat nel browser.
5. Definisci il riferimento visivo e gli screenshot, quando disponibili.
6. Crea fixture sintetiche per il parser con multilinea, Unicode e allegati.

Uscita: breve rapporto con browser/versioni provati, codec scelti, flusso
recupero e decisioni aggiornate. Se un browser non supporta una funzione,
documenta il fallback prima di realizzare l'interfaccia completa.

## Fase 1 — base applicativa e accesso

Questa fase realizza R01–R04 e la base di R18. Dipende dalle decisioni di
identità della fase 0.

1. Crea workspace, contratti, migrazioni, configurazione e ambiente locale.
2. Implementa sessioni, associazioni dispositivo/membro e autenticazione
   della gestione; aggiungi protezioni origine e CSRF.
3. Implementa creazione chat, invito, ingresso atomico e recupero personale.
4. Realizza schermate primo ingresso, ritorno, posto occupato e codice errato.
5. Implementa lista dispositivi, revoca e rotazione invito.

Uscita: due membri entrano, chiudono e riaprono il browser senza cambiare
identità; un terzo profilo non accede. Un tentativo concorrente di ingresso
non crea tre membri. Il recupero associa un nuovo browser al membro corretto.

## Fase 2 — testo e sincronizzazione

Questa fase realizza R05–R07 e R19. Dipende da accesso e schema dati, e produce
la prima chat utilizzabile per prove interne.

1. Implementa creazione messaggi idempotente, paginazione e outbox persistente.
2. Implementa timeline, compositore, bozze e coda IndexedDB.
3. Implementa eventi, recupero delta e reset per cursore scaduto.
4. Aggiungi ricevute, non letti, typing e presenza a scadenza.
5. Verifica interruzioni di rete e crash fra commit, risposta e pubblicazione.

Uscita: invii simultanei, retry e riavvio non perdono messaggi confermati e
non creano duplicati. Le ricevute corrispondono ad azioni reali del
destinatario.

## Fase 3 — aspetto e interazioni

Questa fase realizza R11–R14 e R16 e rifinisce la timeline. Dipende dalla fase
2; i componenti statici possono essere progettati prima.

1. Implementa temi, header, sidebar, layout mobile e gestione tastiera.
2. Aggiungi risposta, reazioni, modifica e tombstone con vincoli server.
3. Implementa ricerca e apertura del contesto di un messaggio.
4. Verifica scorrimento, focus, screen reader, emoji lunghe e testi senza spazi.
5. Confronta l'interfaccia ai riferimenti scelti nelle stesse dimensioni.

Uscita: nessun controllo fittizio; tutte le azioni visibili funzionano e
rispettano permessi e finestre temporali. L'UI resta utilizzabile con tastiera
mobile aperta e ingrandimento del testo.

## Fase 4 — allegati e vocali

Questa fase realizza R08–R10. Dipende da identità, messaggi e prova codec.

1. Implementa upload staging, verifica MIME, conversioni e stati persistenti.
2. Aggiungi thumbnail, viewer, video, documenti e player audio.
3. Implementa registrazione con anteprima e gestione permessi/interrupt.
4. Implementa download autorizzato e Range per lo scorrimento audio/video.
5. Verifica file eccessivi, disco pieno, upload annullato e conversione fallita.

Uscita: da ciascun dispositivo target è possibile inviare e ricevere foto e
vocali. I file privati non sono raggiungibili da una sessione estranea.

## Fase 5 — importazione una tantum

Questa fase realizza R15. Dipende da schema definitivo, media e due membri
presenti; il parser puro può essere sviluppato dalla fase 0.

1. Implementa lettura ZIP sicura, parsing, manifest e inventario file.
2. Realizza wizard con mapping, fuso, ambiguità e anteprima paginata.
3. Implementa preparazione file, commit atomico, ripresa e blocco del reimport.
4. Implementa report, pulizia staging e rollback del solo batch.
5. Esegui prima prove su fixture sintetiche, poi sul campione reale in ambiente
   privato, senza caricarlo in servizi pubblici o pipeline esterne.

Uscita: 1.212 record e 355 allegati collegati nel campione, 22 segnaposto
espliciti e nessun contenuto perso senza segnalazione. Verifica a campione
autori, date, multilinea, sticker e audio; ripetere il caricamento non duplica.

## Fase 6 — PWA, gestione e rilascio

Questa fase completa R17 e R20 e il collaudo trasversale. Dipende da una chat
funzionante e da un ambiente HTTPS effettivo.

1. Implementa manifest, service worker della shell, aggiornamento applicativo
   e opt-in push; preserva bozze e coda durante un aggiornamento.
2. Configura servizio Railway, volume, segreti, monitoraggio e backup esterni.
3. Esegui un ripristino su destinazione vuota e misura RPO/RTO.
4. Esegui il collaudo completo e una prova d'uso privata con i due utenti.
5. Importa lo storico definitivo, verifica il report e salva un nuovo backup.
6. Consegna link, codici personali e procedura di recupero agli interessati.

Uscita: checklist di rilascio completata e difetti bloccanti chiusi. La prova
d'uso proposta dura 2–3 giorni di calendario e verifica anche ritorno dopo
inattività e notifiche a telefono bloccato.

## Matrice di accettazione

Le prove seguenti devono essere riproducibili. Unit test per parser e regole,
test di integrazione per transazioni e autorizzazioni, test end-to-end per
percorsi reali. Le prove browser simulate non sostituiscono quelle su telefono.

| Test | Requisiti | Scenario e risultato atteso |
| --- | --- | --- |
| T01 | R01–R04 | Crea, invita, entra, ricarica: nome e membro invariati; terzo browser respinto. |
| T02 | R04 | Due ingressi simultanei per l'ultimo posto: uno solo riesce. |
| T03 | R03, R18 | Cancella cookie e recupera col codice: stesso membro; nome uguale senza codice non dà accesso. |
| T04 | R05–R06 | Ripeti invio dopo timeout e crash server: una sola riga persistita e una sola bolla canonica. |
| T05 | R06 | Offline, invii accodati, reload e riconnessione: recupero ordinato; cursore vecchio provoca reset corretto. |
| T06 | R07 | Destinatario offline, online e chat visibile: stati distinti; push ricevuto non cambia consegna. |
| T07 | R08 | Upload valido, annullato, troppo grande e MIME falso: stati corretti e nessun file pubblico. |
| T08 | R09–R10 | Registra e riproduci su ogni browser target; riproduci OPUS importato/derivato e mostra WebP. |
| T09 | R11–R13 | Rispondi, reagisci, modifica, elimina; accesso incrociato e finestra scaduta respinti; citazione oscurata dopo eliminazione. |
| T10 | R14 | Cerca nello storico, salta al risultato; modifica/eliminazione aggiorna l'indice; zero risultati da chat estranee. |
| T11 | R15 | Parser: multilinea, BOM, CRLF, nomi con due punti, intestazione nel corpo, date invalide e cambio ora. |
| T12 | R15 | Campione reale: conteggi coerenti, autori corretti, file risolti, omissioni visibili e nessuna spunta storica inventata. |
| T13 | R15 | ZIP con traversal, symlink, duplicati o espansione eccessiva: rifiutato senza scrivere fuori staging. |
| T14 | R15 | Crash prima/dopo commit e retry: nessun mezzo import, nessun duplicato, messaggi nativi preservati. |
| T15 | R16 | Viewport 360, 390, 768 e 1440 px; tastiera, safe area, tema scuro e testo ingrandito senza controlli nascosti. |
| T16 | R17 | Permesso push negato/attivo e app chiusa: fallback chiaro, payload generico, clic apre chat autorizzata. |
| T17 | R18 | Revoca dispositivo con socket aperto: invii/download successivi negati; recupero errato non rivela identità. |
| T18 | R19 | Chiudi bruscamente un browser: typing scade entro 5 secondi e presenza entro 60 secondi. |
| T19 | R20 | Ripristina backup: conteggi e checksum coincidono, media riproducibili e vecchi segreti invalidati. |
| T20 | Trasversale | XSS in messaggio/nome, richiesta CSRF e ID di altra stanza: nessuna esecuzione o accesso. |
| T21 | Qualità | Dataset sintetico 20.000 messaggi e profilo di rete concordato: misurare apertura, ricerca e latenza. |
| T22 | Gestione | Disco quasi pieno, conversione bloccata e backup assente: segnali chiari e nessuna falsa conferma di invio. |

Per T08, T15 e T16 registrare modello dispositivo, OS, browser/versione,
modalità browser/PWA, esito e workaround. Fino alla scelta dei dispositivi,
la matrice candidata copre Safari su iPhone, Chrome su Android e Chrome,
Safari o Edge sul computer effettivamente usato. Non è una promessa di
supporto per tutte le versioni storiche.

## Stima orientativa

Questa è una stima di pianificazione per uno sviluppatore full-stack, non
un preventivo o una scadenza concordata. Include implementazione e collaudo
delle funzioni elencate; dipende dai browser reali e dalla fedeltà visiva.

| Fase | Giorni di lavoro indicativi |
| --- | --- |
| 0 — prove e decisioni | 1–2 |
| 1 — accesso e struttura | 2–3 |
| 2 — testo affidabile | 3–4 |
| 3 — UI e interazioni | 3–5 |
| 4 — media e vocali | 3–5 |
| 5 — importazione | 3–5 |
| 6 — gestione e rilascio | 2–4 |
| Totale | 17–28, più 20–30% di margine per integrazione e imprevisti. |

La durata di calendario dipende dalla disponibilità di chi sviluppa e dai
tempi di prova degli utenti. Se serve ridurre il primo ciclo, mantenere
accesso, testo affidabile, media, recupero e backup e spostare esplicitamente
reazioni o modifica messaggi a P1 aggiornando requisiti e accettazione.
Non considerare tale riduzione già approvata.

## Checklist di rilascio

Il proprietario può iniziare l'uso quotidiano quando queste condizioni sono
verificate e registrate in un rapporto di rilascio.

- Due persone accedono dai dispositivi reali e ritornano senza reinserire il
  nome nelle condizioni di sessione documentate.
- Nessuna perdita di messaggi confermati nei test di crash e riconnessione.
- Vocali, immagini, sticker importati e download funzionano sui browser target.
- Importazione verificata con autori corretti e assenze chiaramente indicate.
- Accessi incrociati, CSRF e contenuti attivi caricati sono bloccati.
- HTTPS, backup esterno e prova di ripristino funzionano.
- Codici recupero salvati dai membri e credenziali gestore custodite.
- Limiti browser e percorso delle notifiche sono spiegati ai due utenti.
- Documentazione aggiornata allo stack e ai comportamenti effettivi.
