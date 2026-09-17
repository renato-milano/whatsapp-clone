# Interfaccia ed esperienza

L'interfaccia deve risultare immediatamente familiare a chi usa WhatsApp:
bolle, gerarchia visiva, compositore, ricevute e navigazione dei media devono
seguire lo stesso modello mentale. Le misure e i colori seguenti costituiscono
una proposta iniziale; la fedeltà a una versione precisa richiede screenshot
di riferimento forniti dall'utente.

## Direzione visiva

Su telefono la conversazione occupa tutto lo schermo. Su desktop una colonna
laterale mostra le conversazioni note al dispositivo e il pannello principale
mostra la chat selezionata. Non aggiungere tab di chiamate, stato o community
che non hanno una funzione effettiva.

| Elemento | Specifica iniziale |
| --- | --- |
| Tipografia | Font di sistema; testo messaggio 16 px, metadati 11–12 px. |
| Spaziatura | Griglia da 4 px; distanze principali 8, 12, 16 e 24 px. |
| Header | Altezza minima 60 px oltre alla safe area. Avatar, nome interlocutore, presenza, menu. |
| Compositore | Altezza minima 56 px, textarea da 1 a 5 righe, allega, emoji e invia/microfono. |
| Bolle | Angoli arrotondati 8 px, larghezza massima 85% mobile e 65% desktop; testo lungo va a capo. |
| Sidebar | 320 px da 900 px di viewport; sotto tale soglia usa una vista per volta. |
| Tema chiaro | Sfondo chat `#efeae2`, ricevuti `#ffffff`, inviati `#d9fdd3`, testo `#111b21`. |
| Tema scuro | Sfondo `#0b141a`, ricevuti `#202c33`, inviati `#005c4b`, testo `#e9edef`. |
| Accento | Verde `#00a884`; verificare contrasto per ogni uso, soprattutto sul testo. |
| Interazioni | Bersagli touch almeno 44 × 44 px; nessuna azione disponibile soltanto con hover. |

Usa un nome, un'icona e uno sfondo propri. L'obiettivo è la somiglianza
dell'esperienza, senza presentare il servizio come un prodotto ufficiale
WhatsApp. Non riutilizzare automaticamente loghi o asset estratti dall'app.

## Schermate e stati

Ogni schermata deve essere progettata anche negli stati vuoti, in caricamento
e in errore. I messaggi d'errore devono indicare un'azione possibile.

| Vista | Contenuto e interazioni |
| --- | --- |
| Creazione | Nome personale, titolo facoltativo, crea, copia link e accesso al codice di recupero. |
| Primo ingresso | Nome, indicazione di chat privata, pulsante **Entra**; nessuna anteprima dei messaggi. |
| Ritorno | Apertura diretta alla chat dopo verifica della sessione. |
| Chat occupata | **I posti sono già occupati** e azione **Recupera il tuo accesso**, senza elenco identità selezionabili. |
| Link non valido | Spiegazione generica e possibilità di usare un nuovo invito. |
| Conversazione | Header, messaggi, separatori di giorno, non letti, compositore e indicatore connessione. |
| Dettaglio messaggio | Rispondi, reagisci, copia testo; modifica/elimina solo se autorizzato. |
| Ricerca | Query, risultati con contesto minimo, data e salto al messaggio. |
| Media viewer | Immagine/video, chiudi, scarica; focus intrappolato e ritorno al punto di apertura. |
| Impostazioni | Nome, tema, notifiche, dispositivi, recupero; invito e importazione soltanto al proprietario. |
| Importazione | File, analisi, fuso, autori, anteprima, anomalie, conferma, avanzamento e report. |

## Flussi principali

I flussi devono minimizzare i passaggi ripetuti mantenendo chiaro ciò che
accade quando l'identità non è più disponibile.

1. Il proprietario crea la chat, riceve il link e lo condivide manualmente.
2. L'invitato apre il link, inserisce il nome e accede alla conversazione.
3. Al ritorno entrambi riaprono lo stesso link; il cookie identifica il membro.
4. Su un dispositivo nuovo, il membro usa il codice personale di recupero.
5. Se la rete cade, il compositore resta disponibile per testi accodati;
   l'interfaccia mostra **In attesa di connessione**.
6. Alla riconnessione, la chat sincronizza eventi e invii pendenti senza
   duplicare i messaggi o cambiare autore.

## Comportamenti della timeline

Lo scorrimento deve conservare il contesto anche quando arrivano nuovi
messaggi o si carica lo storico.

- Apri sui primi non letti, se presenti; altrimenti sull'ultimo messaggio.
- Carica 50 elementi precedenti per pagina, mantenendo ancorato l'elemento
  visibile. L'arrivo di una foto e il calcolo della sua altezza non devono
  spostare bruscamente la posizione.
- Se il lettore è in fondo, segui i nuovi messaggi. Se legge lo storico,
  mostra un pulsante **Nuovi messaggi** con contatore.
- Raggruppa bolle consecutive dello stesso autore senza nascondere la data
  o lo stato del singolo messaggio. Usa **Oggi**, **Ieri** e poi data locale.
- Mostra gli eventi storici importati come righe neutre, esplicitando
  **Evento WhatsApp importato** quando parlano di cifratura o cambio numero.
- Mostra un'icona a orologio durante l'invio, una spunta dopo persistenza,
  due spunte dopo consegna e due spunte colorate dopo lettura. Aggiungi
  etichette accessibili: il colore da solo non basta.
- I media assenti mostrano **Allegato non presente nell'export**, conservando
  l'eventuale testo originale come didascalia.

## Compositore e vocali

Il compositore deve funzionare con tastiera fisica, tastiera mobile e input
multilingua. Non inviare durante una composizione IME.

Su desktop **Invio** invia e **Maiusc+Invio** aggiunge una riga. Su telefono
il tasto della tastiera aggiunge una riga e il pulsante visibile invia. Salva
la bozza per conversazione nel browser, senza includerla nei log o nel backup
del server. Mostra il pulsante invia quando esiste testo o un allegato pronto;
altrimenti mostra il microfono.

Per i vocali, usa prima un flusso semplice: tocco per iniziare, timer e stop,
anteprima audio, annulla o invia. Il trascinamento per annullare può arrivare
dopo. Se il permesso è negato, mantieni testo e allegati utilizzabili e indica
come riattivare il microfono. Non chiedere il permesso all'apertura della chat.
Il player offre pausa, avanzamento e velocità 1×, 1,5× e 2×, dove supportata.

## Installazione e notifiche

L'installazione è facoltativa per chattare. Richiedi il permesso per le
notifiche soltanto dopo il comando **Attiva notifiche**. Mostra lo stato
effettivo: disponibile, attivo, negato o non supportato.

Su iPhone il percorso da collaudare è l'app aggiunta alla schermata Home:
Apple documenta Web Push per queste webapp a partire da iOS 16.4. La prova
su dispositivo reale resta obbligatoria, anche per il riconoscimento della
sessione fra Safari e PWA. Vedi la
[documentazione Apple sulle notifiche web](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

Usa per default **Nuovo messaggio nella tua chat**, senza testo privato nella
notifica. Il clic apre la conversazione autorizzata; se la sessione è scaduta,
mostra il recupero. Non dichiarare garantita la consegna dei push.

## Riferimenti da raccogliere

Prima del collaudo visivo, scegli con l'utente una piattaforma di riferimento
e acquisisci immagini senza dati personali o con dati oscurati.

- Chat chiara e scura con testo, foto, vocale e sticker.
- Tastiera aperta, menu messaggio e risposta citata.
- Viewer foto, ricerca e stato senza messaggi.
- Vista desktop e vista telefono con dimensioni note.

Il criterio visivo finale è una comparazione alle stesse dimensioni di
viewport e allo stesso tema. Prima degli screenshot, verificare struttura,
spaziature e stati documentati; non dichiarare un risultato pixel-perfect.
