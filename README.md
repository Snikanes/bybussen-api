Bybussen API
============

Veldig enkel endepunkt for å hente sanntidsdata fra AtB. Dagens endepunkt for henting av sanntidsdata, _api.visuweb.no_, vil snart bli tatt ut av drift siden den blir tatt over av en annen aktør.

**Bybussen API** (jeg åpen for navneendring (-:) er derfor laget for å enkelt kunne opprettholde den fantastiske tjenesten borte hos  [notifier](httå://github.com/appKom/notifier).

For å benytte seg av denne må man ha gyldig nøkkel fra [AtB](http://atb.no/). Sett bort fra at data leveres fra [AtB](http://atb.no/), har denne tjenesten ellers ingen tilknytning til [AtB](http://atb.no/).

### Kom i gang med

```
npm install
npm start
```

***

### TODO

* _Opprette direktespørring etter holdeplasser mot AtBs webservice_

  Holdeplassene (stops.js) har frem til nå blitt manuelt oppdatert hver gang det kommer nye. Dataene fra webservice inneholder blant annet mye forkortelser som ikke er noe særlig brukervennlig. Disse er manuelt oppdatert.

  **Forslag til løsning:** lagre holdeplassene i en lokal base, samt opprette en enkel frontend for å kunne se diff mellom gammel og ny datasett (basert på holdeplassID), for å deretter dra inn nye holdeplasser, og gjøre endringer "as we go". Kan være et forslag å etterspørre ev. datasett med hele navn.

##### Good ideas for later

* _Autentisering med API-nøkkel_

  Ofte kan det være gøy å se bruksstatistikker. Det kan også være greit å ha en viss kontroll over tilgang til dataene mtp. ressursene en har tilgjengelig.
