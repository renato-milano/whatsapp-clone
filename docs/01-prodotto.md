# Requisiti di prodotto

La webapp deve consentire a due persone di continuare una conversazione
privata senza WhatsApp, mantenendo una modalità d'uso familiare. Il successo
si misura nella continuità della conversazione, nella facilità di ritorno
e nell'affidabilità dei messaggi, non nel numero di utenti supportati.

## Obiettivo e perimetro

Il requisito confermato è creare conversazioni raggiungibili tramite link,
chiedere il nome al primo ingresso e conservare lo storico. L'uso principale
confermato è fra due persone, via web su mobile e computer, senza E2EE.
La baseline prevede quindi due partecipanti per
conversazione, più conversazioni possibili nella stessa installazione e nessun
elenco pubblico delle stanze.

Il proprietario crea una conversazione dalla propria area di gestione,
inserisce il proprio nome e condivide il link. L'altra persona apre il link,
inserisce il nome; se il nome corrisponde a un membro già presente viene
riconosciuto come lo stesso partecipante su un nuovo dispositivo, altrimenti
occupa il secondo posto. Entrambi possono riaprire quel
link senza reinserire il nome finché la sessione del browser rimane valida.
Il nome è un'etichetta e non una password.

## Attori

I ruoli distinguono la gestione dell'installazione dalla partecipazione alla
chat; una stessa persona può ricoprire più ruoli.

| Attore | Poteri |
| --- | --- |
| Gestore installazione | Configura server, backup, credenziali di creazione e recupero amministrativo. |
| Proprietario chat | Crea la stanza, invita il secondo partecipante, importa lo storico, ruota l'invito. |
| Partecipante | Legge e invia messaggi, gestisce nome, sessioni, notifiche e recupero personale. |
| Visitante con link | Può occupare un posto libero; non vede lo storico prima dell'ingresso. |

Il proprietario non può scrivere a nome dell'altra persona. Nel modello senza
E2EE, chi controlla il server può tecnicamente leggere i dati: questo confine
è dichiarato nella [specifica di sicurezza](03-accesso-sicurezza.md).

## Funzionalità della prima versione

La prima versione completa include le funzioni necessarie a conversare ogni
giorno, inclusi vocali e importazione. La prima milestone testuale non coincide
con il prodotto finito.

| ID | Priorità | Requisito e risultato verificabile |
| --- | --- | --- |
| R01 | P0 | Creare una chat privata e copiare il link di ingresso. |
| R02 | P0 | Chiedere un nome di 1–50 caratteri al primo ingresso; rifiutare nomi vuoti o soli spazi. |
| R03 | P0 | Riaprire la stessa chat con identità e storico persistenti sul browser già associato. |
| R04 | P0 | Consentire due membri; un terzo browser senza recupero non può leggere né entrare quando i posti sono occupati. |
| R05 | P0 | Inviare testo multilinea ed emoji, con ora, autore e stato di invio. |
| R06 | P0 | Ricevere messaggi senza ricaricare; recuperare quelli persi dopo una disconnessione. |
| R07 | P0 | Distinguere invio in corso, inviato, consegnato, letto ed errore. |
| R08 | P0 | Caricare immagini, video e documenti; mostrare avanzamento, anteprima appropriata e download autorizzato. |
| R09 | P0 | Registrare, riascoltare, annullare e inviare vocali; riprodurre i vocali importati. |
| R10 | P0 | Mostrare gli sticker importati, conservando trasparenza ed eventuale animazione quando supportata. |
| R11 | P0 | Rispondere a un messaggio con citazione e raggiungere l'originale. |
| R12 | P0 | Reagire con un'emoji; una reazione per membro e messaggio, sostituibile o rimovibile. |
| R13 | P0 | Modificare i propri testi recenti ed eliminare i propri messaggi recenti per entrambi. |
| R14 | P0 | Cercare testo nello storico e aprire il risultato nella sua posizione. |
| R15 | P0 | Importare una volta l'export e gli allegati, con anteprima, associazione autori e report. |
| R16 | P0 | Funzionare su mobile e desktop, con tema chiaro e scuro. |
| R17 | P0 | Installare la PWA e attivare notifiche quando il dispositivo le supporta. |
| R18 | P0 | Recuperare la propria identità su un altro browser senza scegliere liberamente quella altrui. |
| R19 | P0 | Mostrare scrittura in corso e presenza, soltanto quando osservabili. |
| R20 | P0 | Eseguire backup verificabili di storico e allegati e ripristinarli insieme. |

## Regole di conversazione

Applica le stesse regole da API e interfaccia. Gli orari visualizzati sono nel
fuso del dispositivo, mentre il server conserva istanti UTC per i messaggi
nativi e informazioni aggiuntive per quelli importati.

- Il testo è limitato a 10.000 caratteri Unicode; la definizione tecnica usa
  punti di codice e il contatore UI usa la stessa funzione.
- L'invio vuoto è vietato, salvo un allegato pronto. Un invio contiene al
  massimo un allegato e una didascalia; una selezione multipla genera messaggi
  distinti e ordinati nella coda locale.
- La modifica del testo o della didascalia è ammessa entro 15 minuti dalla
  creazione; non sostituisce il file. Mostra l'etichetta **Modificato**.
- L'eliminazione per entrambi è ammessa entro 24 ore dalla creazione e lascia
  il segnaposto **Messaggio eliminato**. Sono finestre di prodotto proposte,
  senza pretesa di coincidere con quelle di WhatsApp.
- I messaggi importati sono immutabili nell'interfaccia ordinaria e non
  generano ricevute, non letti o notifiche retroattive.
- Una risposta a un messaggio eliminato mantiene il collegamento e il
  segnaposto; non conserva una copia visibile del testo eliminato.
- I link nel testo sono cliccabili soltanto per protocolli consentiti
  `https` e `http`; niente HTML arbitrario né anteprime scaricate dal server.
- Non mostrare ricevute inventate: **Consegnato** richiede un riscontro da un
  dispositivo dell'altro membro; **Letto** richiede chat visibile e messaggio
  effettivamente mostrato. Il push non costituisce consegna del messaggio.

## Funzioni successive ed esclusioni

Le seguenti funzioni non impediscono la sostituzione iniziale della chat.
Se diventano necessarie, aggiornane priorità e criteri prima di svilupparle.

| Priorità | Funzioni |
| --- | --- |
| P1 | Preferiti, galleria media, sticker inviabili da raccolta, esportazione self-service, personalizzazione sfondo. |
| P1 | Nascondi messaggio solo per me, trasferimento dispositivo via QR, impostazioni avanzate di privacy presenza. |
| P2 | Gruppi, chiamate audio/video, inoltro, sondaggi, messaggi effimeri, localizzazione. |
| Escluso | Collegamento a WhatsApp, accesso alla rubrica, SMS, account telefonici, bot e sincronizzazione continua con WhatsApp. |
| Escluso | Cifratura end-to-end, esplicitamente non richiesta per l'utilizzo personale. |

## Obiettivi di qualità

I numeri seguenti sono obiettivi di progetto da verificare, non prestazioni
già misurate. Il profilo di riferimento usa due membri attivi, fino a quattro
sessioni connesse, 20.000 messaggi per chat e rete con RTT non oltre 100 ms.

| Area | Criterio di accettazione |
| --- | --- |
| Persistenza | Ogni messaggio confermato dal server sopravvive al riavvio del processo. |
| Duplicati | Ripetere dieci volte lo stesso invio idempotente produce un solo messaggio. |
| Realtime | Il 95% dei testi arriva al secondo browser entro 1 secondo nel profilo di riferimento. |
| Apertura | Chat utilizzabile entro 3 secondi a cache calda su rete da 10 Mbps; caricare solo gli ultimi 50 messaggi. |
| Ricerca | Prima pagina di risultati entro 1 secondo su 20.000 messaggi nell'ambiente di collaudo. |
| Importazione | Export di esempio importabile senza perdere record o riferimenti agli allegati. |
| Accessibilità | Navigazione da tastiera, focus visibile, nomi accessibili, contrasto testo almeno 4,5:1. |
| Ripristino | RPO proposto 24 ore; RTO proposto 2 ore, verificato con una prova reale. |

La disponibilità dipende dal singolo server: non si promettono alta
disponibilità o funzionamento continuo durante un guasto della macchina.
La cancellazione dei dati del browser può perdere bozze e invii locali non
ancora confermati; lo storico confermato resta sul server.

## Prossimi passi

Usa gli ID R01–R20 per collegare ticket e test nel
[piano di collaudo](07-sviluppo-collaudo.md). Aggiorna questo documento prima
di ampliare il numero di membri o introdurre la cifratura end-to-end.
