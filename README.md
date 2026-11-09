# DinSat API

Node.js + JavaScript, Express 5, cu structura existentă Clean Architecture. Aplicația are autentificare, catalog, publicare de produse, ridicări și comenzi, persistate în PostgreSQL prin adaptoare `pg`. Frontend-ul comunică exclusiv prin HTTP.

## Pornire cu Neon din repository-ul principal

Integrarea este conectată la proiectul Neon `late-cloud-11138544`, ramura `production`. Din rădăcina repository-ului principal, `npm run db:migrate` aplică schema prin conexiunea directă, `npm run db:check` verifică tabelele, iar `npm run build` și `npm start` construiesc și pornesc interfața împreună cu API-ul. API-ul rămâne local până când este publicat separat pe un host.

Comenzile din rădăcină încarcă `.env` al API-ului, `.env` din rădăcină, apoi `.env.local` din rădăcină. Variabilele exportate au prioritate. `DATABASE_URL` folosește pool-ul Neon pentru cererile API; `DATABASE_URL_UNPOOLED` oferă conexiunea directă pentru migrații. Fișierele cu secrete sunt ignorate de Git.

## Pornire cu PostgreSQL local

Folosește Node.js 24 sau mai nou. Pornește PostgreSQL local și configurează `.env` al submodulului cu URL-ul local și un `SESSION_SECRET` persistent. Comenzile rulate direct în submodul nu încarcă `.env.local` din rădăcină:

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run db:check
npm run dev
```

API: `http://localhost:3001/api/v1`. Dacă mediul limitează file watchers, folosește `npm start`.

Din rădăcina repository-ului părinte, `node scripts/local-postgres.mjs start` creează instanța locală pe portul 55432 și `.env` dacă lipsește. Nu suprascrie configurația existentă. Alternativa Docker Compose și instrucțiunile complete sunt în README-ul părintelui.

`DEMO_MODE=false` folosește PostgreSQL pentru conturi, produse, ridicări, comenzi și sesiuni. Migrațiile sunt explicite; startup-ul nu le aplică automat și nu revine la memorie dacă DB e indisponibilă. Vezi [schema și contractele de persistență](docs/architecture/persistence.md).

Seed-ul este pentru development, nu resetează datele existente și este refuzat în producție. Adaugă conturile fictive `buyer@dinsat.demo`, `producer@dinsat.demo` și `producer1@dinsat.demo` până la `producer3@dinsat.demo`, cu parola `DinSatDemo2026!`. Primele două sunt pentru cumpărător și un producător fără ofertă inițială; cele numerotate dețin produsele din catalog. Adaugă și șase produse și nouă intervale viitoare la prima rulare. Intervalele și rezervările existente nu sunt mutate la seed repetat. ID-urile includ data; o rulare într-o zi ulterioară completează fereastra viitoare fără să rescrie istoricul.

Pentru demo fără DB, folosește explicit `DEMO_MODE=true` în development; fără `.env` și fără `DATABASE_URL`, acest mod rămâne implicit. Doar în acest mod datele și sesiunile se pierd la repornire.

## Verificări

```bash
npm run lint
npm test
npm run test:postgres
npm run format:check
```

Testele HTTP verifică sesiunea, rotația CSRF, logout, validarea, rolurile, izolarea conturilor, publicarea, totalurile serverului, idempotența, stocul demo și anularea. `npm run test:postgres` folosește separat `TEST_DATABASE_URL`, cu două conexiuni reale, și verifică persistența, migrațiile, ultimul produs / loc, retry, rollback, anulări concurente, istoric și sesiunea după recrearea runtime-ului. Bazele de test trebuie să aibă un nume explicit de test; datele sunt izolate în scheme aleatoare. Fără `TEST_DATABASE_URL`, testele PostgreSQL sunt sărite, nu validate.

## Organizare și flux

- `domain/features/`: DTO-uri publice și reguli pure, precum tranzițiile comenzilor.
- `application/features/`: servicii cu dependențe injectate; nu cunosc Express sau mecanismul DB.
- `infrastructure/`: hashing Argon2id, repository-uri PostgreSQL, tranzacții, migrații, seed și session store durabil; adaptor demo opțional.
- `presentation/features/`: rute HTTP și scheme Zod stricte.
- `presentation/http/middlewares/`: validare, sesiune și politici de acces.
- `app/container/`: compune serviciile și runtime-ul; `app/config/` validează configurația; `app/server.js` pornește modul selectat și închide conexiunile la oprire.

Cerere → rută / validare → service → port de repository → adaptor de persistență. Funcțiile sunt mici, cu nume explicite. Nu folosim un container DI sau clase abstracte.

## Contract HTTP

Contractul canonic este [OpenAPI](docs/api/openapi.yaml). Prefix: `/api/v1`.

| Metodă | Rută                                                        | Acces                                                  |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| GET    | `/health`                                                   | Public                                                 |
| GET    | `/ready`                                                    | Public; 503 dacă baza de date nu răspunde              |
| GET    | `/auth/session`                                             | Public; întoarce utilizatorul sau null și tokenul CSRF |
| GET    | `/auth/me`                                                  | Cont autentificat                                      |
| POST   | `/auth/register`, `/auth/login`, `/auth/logout`             | Cookie + CSRF                                          |
| GET    | `/products`, `/products/:id`, `/producers`, `/pickup-slots` | Public                                                 |
| POST   | `/products`, `/pickup-slots`                                | Producător + CSRF                                      |
| GET    | `/orders`                                                   | Cont autentificat, doar comenzile proprii              |
| POST   | `/orders`                                                   | Cumpărător + CSRF + `Idempotency-Key`                  |
| PATCH  | `/orders/:id/status`                                        | Participant autorizat + CSRF                           |

La prima încărcare, frontend-ul citește `/auth/me` cu `credentials: include`. Înainte de prima scriere, preia tokenul CSRF de la `/auth/session` și îl trimite în `X-CSRF-Token`. Loginul și înregistrarea regenerează sesiunea și tokenul. Logoutul distruge sesiunea pe server. Cookie-ul `dinsat.sid` este HttpOnly, SameSite=Lax, cu durată de opt ore și atributul Secure în producție. Parola și ID-ul sesiunii sunt păstrate în afara localStorage. API-ul verifică tokenul CSRF și originea când headerul Origin este prezent. Sunt aplicate limite pentru cereri și încercări de login.

Prețurile sunt șiruri cu două zecimale și monedă MDL. Totalurile se calculează în bani întregi; versiunea curentă acceptă cantități întregi de kg, l sau buc. O comandă conține un singur producător. Cheia de checkout este reutilizată pentru retry al aceleiași intenții; alt payload cu aceeași cheie primește 409. Anularea repetată nu restabilește stocul de două ori.

## Configurare

`PORT` (3001), `HOST` (`127.0.0.1` local / `0.0.0.0` în producție), `APP_ORIGIN` (`http://localhost:5173`), `SESSION_SECRET` (minimum 32 caractere), `DEMO_MODE`, `NODE_ENV`, `DATABASE_URL`, `DB_POOL_MAX` (5). Comenzile DB aleg `MIGRATION_DATABASE_URL`, apoi `DATABASE_URL_UNPOOLED`, apoi `DATABASE_URL`; migrarea refuză un URL Neon pooled. `TEST_DATABASE_URL` este numai pentru o bază directă, separată, de test. Pentru hosturile `*.neon.tech`, driverul folosește explicit `sslmode=verify-full` când parametrul lipsește sau este `require`. Alte moduri TLS explicite și conexiunile la alți furnizori își păstrează configurația.

Secretul este obligatoriu și persistent în modul PostgreSQL / producție; doar demo îl poate genera aleator. `TRUST_PROXY` (0 implicit, 1 pentru o singură trecere printr-un proxy de încredere) se configurează conform infrastructurii reale. `COOKIE_SAME_SITE=lax` implicit; `none` este permis doar în producție HTTPS, pentru site-uri diferite, unde browserul poate totuși bloca cookie-urile third-party. Preferă aceeași origine publică pentru UI și `/api` prin reverse proxy. În mai multe instanțe, adaugă și un store partajat pentru rate limiting.

Este inclus un Dockerfile pentru API; imaginea nu copiază `.env` și nu pornește migrații sau seed automat. Instrucțiunile și ofertele de hosting sunt în `docs/hosting.md` din repository-ul principal. `NODE_ENV=production` refuză adaptorul demo și seed-ul fictiv.

Fișierele se versionează în submodulul `din_sat_api`; părintele fixează commit-ul după integrare.
