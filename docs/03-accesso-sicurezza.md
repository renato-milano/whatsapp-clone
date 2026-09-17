# Identità, accesso e sicurezza

L'accesso deve essere semplice senza confondere il possesso del link con
l'identità personale. L'utente ha confermato un utilizzo privato e nessuna
necessità di cifratura end-to-end. La baseline usa HTTPS e controlli di accesso
server: il gestore dell'installazione può tecnicamente leggere i contenuti.

## Link stabile e ingresso

Il link condiviso ha forma proposta `https://chat.example/c/<locator>#i=<secret>`.
`locator` è un identificatore casuale pubblico della stanza; `secret` è un
segreto casuale da 32 byte codificato base64url. Il frammento riduce la
diffusione nei log HTTP, ma il link rimane una credenziale da condividere
soltanto con l'altra persona.

1. La pagina legge il frammento in memoria e lo rimuove subito dall'indirizzo
   corrente con `history.replaceState`.
2. Se esiste una sessione valida per la stanza, apre la chat senza usare
   l'invito e senza richiedere il nome.
3. Altrimenti invia il segreto via POST per verificare la possibilità di
   ingresso; non restituisce nomi o messaggi esistenti.
4. Chiede il nome e completa l'ingresso in una transazione che verifica il
   secondo posto disponibile e consuma l'invito per nuovi ingressi. Se il nome
   coincide con un membro già presente, associa invece un nuovo dispositivo a
   quel membro e non crea una nuova identità.
5. Crea membro, dispositivo e sessione; restituisce un cookie persistente.
6. Se due browser competono per il secondo posto con nomi diversi, solo uno
   entra. L'altro riceve `ROOM_FULL`, senza accedere allo storico. Lo stesso
   nome di un membro esistente è trattato come richiesta di nuovo dispositivo.

Il proprietario occupa il primo posto alla creazione. Il secondo ingresso
chiude l'invito a nuovi membri, ma non invalida il link come collegamento alla
chat per chi ha già una sessione. Il proprietario può ruotare il segreto prima
dell'ingresso: il vecchio invito smette di autorizzare nuovi accessi. Il
`locator` non cambia, quindi i membri già autenticati conservano il percorso.

Chi ottiene il link prima dell'invitato potrebbe occupare il posto libero.
Questo è il compromesso dichiarato del flusso senza account. Non utilizzare
un nome noto come controllo di sicurezza. Se l'ingresso è errato, il
proprietario può revocare il secondo membro tramite procedura di gestione,
chiudere le sue sessioni e creare un nuovo invito; non riassegnare i messaggi
storici a una nuova identità.

## Persistenza e recupero dell'identità

Il nome viene richiesto una sola volta per membro. La possibilità di
riconoscerlo automaticamente vale finché il browser conserva una sessione
valida: modalità privata, cancellazione dei cookie, scadenza e cambio di
browser richiedono recupero. Il browser mobile e la PWA possono avere
contenitori separati; non promettere una sessione automaticamente condivisa.

Proposta: cookie `__Host-chat_session`, `Secure`, `HttpOnly`, `SameSite=Lax`,
`Path=/`, senza `Domain`, valido fino a 180 giorni di inattività, rinnovato
con l'uso. Il database conserva soltanto l'hash del token; il valore casuale
deve avere almeno 32 byte. L'identità autenticata è un dispositivo che può
avere più associazioni a membri di conversazioni. Non usare il nome o un
valore in `localStorage` come prova di identità.

Il recupero usa un codice personale casuale da 32 byte, mostrato alla
creazione del membro e disponibile tramite rigenerazione nelle impostazioni.
L'utente deve salvarlo esternamente. Il server conserva soltanto l'hash.

- **Aggiungi dispositivo**: inserisci locator e codice su un nuovo browser;
  il server associa il dispositivo allo stesso membro senza occupare un posto.
- Ogni utilizzo riuscito ruota il codice e mostra quello nuovo. Le sessioni
  esistenti rimangono valide; la lista dispositivi permette di revocarle.
- Il codice non è inviato in URL o log. Applica un limite di tentativi per IP
  e stanza. La risposta a un codice errato non rivela se il membro esiste.
- Se esiste ancora un dispositivo autenticato, genera da lì un nuovo codice.
- Senza sessioni né codice, serve il gestore: una procedura amministrativa
  esplicita emette un nuovo codice per il membro selezionato e registra
  l'operazione. Nessun recupero automatico tramite il solo nome.

Il recupero amministrativo è possibile perché il gestore è fidato e non c'è
E2EE. Il codice non recupera bozze locali non sincronizzate.

## Autorizzazioni

Ogni lettura o modifica controlla l'associazione fra dispositivo, membro e
conversazione. Un UUID o un percorso difficile da indovinare non basta.

| Operazione | Autorizzazione |
| --- | --- |
| Creare chat | Sessione gestore/proprietario abilitata dalla configurazione iniziale. |
| Leggere chat e cercare | Membro attivo della conversazione. |
| Scaricare media | Membro attivo della chat a cui appartiene il media. |
| Inviare e reagire | Membro attivo; messaggio e allegato nella stessa chat. |
| Modificare/eliminare | Autore effettivo, messaggio nativo, finestra temporale valida. |
| Importare | Proprietario; conversazione senza precedenti import completati. |
| Ruotare invito | Proprietario; non revoca le sessioni già autorizzate. |
| Revocare dispositivo | Membro cui il dispositivo è associato, o gestore in procedura amministrativa. |
| Gestire backup | Gestore dell'installazione. |

Non esporre una registrazione pubblica. La credenziale di creazione viene
configurata sul server e scambiata con una sessione di gestione; non deve
entrare nel bundle frontend. Gestione server e sessioni chat hanno permessi
distinti e un audit minimale delle operazioni amministrative.

## Protezioni applicative

L'uso personale riduce il carico ma non rende privati URL o bucket pubblici.
Questi controlli fanno parte della prima versione.

- Servire solo HTTPS; redirect da HTTP e cookie sicuri. Impostare
  `Referrer-Policy: no-referrer` sulle pagine chat.
- Verificare `Origin` e token CSRF sulle mutazioni HTTP; verificare `Origin`
  e sessione all'apertura del canale realtime. CORS limitato all'origine nota.
- Ricontrollare i permessi per evento, download e mutazione; disconnettere
  subito le sessioni revocate e invalidare le richieste successive.
- Renderizzare testi come testo. Applicare CSP senza script di terze parti,
  evitare HTML arbitrario e bloccare protocolli pericolosi nei collegamenti.
- Validare dimensioni, contenuto e tipo MIME degli upload. Non fidarsi
  dell'estensione. Nomi fisici generati dal server, fuori dalla directory web.
- Documenti generici in download con `Content-Disposition: attachment` e
  `X-Content-Type-Options: nosniff`; non incorporare HTML o SVG caricati.
- Nessuna analytics, font remoti, tracker o anteprima URL automatica.
- Nascondere token, corpi dei messaggi, nomi degli utenti e nomi originali
  degli allegati nei log. Usare ID interni e codici errore.
- Limiti iniziali proposti: 10 tentativi di ingresso/recupero in 15 minuti per
  IP e stanza; 60 invii/minuto per membro; 5 upload contemporanei per membro.
  Restituire `429` con attesa suggerita e non perdere la bozza.

Queste scelte applicano le indicazioni sui cookie e sul ciclo di vita delle
sessioni di [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
I valori di durata e i limiti numerici sono scelte del progetto.

## Conservazione e cancellazione

La chat conserva lo storico finché il proprietario non decide di eliminarla.
La cancellazione completa è una funzione di gestione con conferma esplicita
del locator, revoca delle sessioni della chat e backup preventivo facoltativo.
Non è necessaria una schermata pubblica nella prima versione.

Quando un messaggio viene eliminato per entrambi, rimuovi testo, didascalia,
risultati di ricerca e accessibilità dell'allegato; mantieni soltanto autore,
data, identificatore e segnaposto. Rimuovi le reazioni e oscura le citazioni.
I file non più referenziati sono cancellati entro 24 ore dal job di pulizia.
Una copia già scaricata dall'altra persona non può essere revocata.

Backup: conservazione proposta di 7 giornalieri e 4 settimanali. Una
cancellazione resta nelle copie precedenti fino alla loro scadenza; comunica
questa proprietà. Durante un ripristino applica le cancellazioni successive
registrate separatamente, se disponibili; se non lo sono, segnala il ritorno
allo stato della data del backup prima di riaprire il servizio.
