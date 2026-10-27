# DinSat API

Node.js + JavaScript, Express 5, cu structura existentă Clean Architecture. Aplicația are autentificare, catalog, publicare de produse, ridicări și comenzi. Baza de date externă nu este creată și nu este accesată de frontend.

## Pornire locală

Folosește Node.js 24 sau mai nou. Dependențele stabile au fost rezolvate și fixate în `package-lock.json` la 27 octombrie 2026.

```bash
npm ci
cp .env.example .env
npm run dev
```

API: `http://localhost:3001/api/v1`. Dacă mediul limitează file watchers, folosește `npm start`.

Modul demo pornește implicit în development, inclusiv fără `.env`. Datele și sesiunile sunt în memorie și se pierd la repornire. Conturi fictive: `buyer@dinsat.demo` și `producer@dinsat.demo`, ambele cu parola `DinSatDemo2026!`. Producătorul demo începe cu o gospodărie goală; poate publica produse și adăuga intervale de ridicare.

`DEMO_MODE=false` sau `NODE_ENV=production` opresc bootstrap-ul demo cu un mesaj explicit. Conectează repository-urile și un session store durabil înainte de deploy. Vezi [contractele de persistență](docs/architecture/persistence.md).

## Verificări

```bash
npm run lint
npm test
npm run format:check
```

Testele HTTP verifică sesiunea, rotația CSRF, logout, validarea, rolurile, izolarea conturilor, publicarea, totalurile serverului, idempotența, stocul demo și anularea. Aceste teste folosesc adaptorul în memorie. Nu înlocuiesc testele de concurență cu două conexiuni reale la viitoarea bază de date.

## Organizare și flux

- `domain/features/`: DTO-uri publice și reguli pure, precum tranzițiile comenzilor.
- `application/features/`: servicii cu dependențe injectate; nu cunosc Express sau mecanismul DB.
- `infrastructure/`: hashing Argon2id și adaptorul demo. Aici se conectează ulterior baza de date externă.
- `presentation/features/`: rute HTTP și scheme Zod stricte.
- `presentation/http/middlewares/`: validare, sesiune și politici de acces.
- `app/container/`: compune serviciile; `app/createApp.js` configurează HTTP; `app/server.js` pornește modul demo.

Cerere → rută / validare → service → port de repository → adaptor de persistență. Funcțiile sunt mici, cu nume explicite. Nu folosim un container DI sau clase abstracte.

## Contract HTTP

Contractul canonic este [OpenAPI](docs/api/openapi.yaml). Prefix: `/api/v1`.

| Metodă | Rută                                                        | Acces                                                  |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| GET    | `/health`                                                   | Public                                                 |
| GET    | `/auth/session`                                             | Public; întoarce utilizatorul sau null și tokenul CSRF |
| POST   | `/auth/register`, `/auth/login`, `/auth/logout`             | Cookie + CSRF                                          |
| GET    | `/products`, `/products/:id`, `/producers`, `/pickup-slots` | Public                                                 |
| POST   | `/products`, `/pickup-slots`                                | Producător + CSRF                                      |
| GET    | `/orders`                                                   | Cont autentificat, doar comenzile proprii              |
| POST   | `/orders`                                                   | Cumpărător + CSRF + `Idempotency-Key`                  |
| PATCH  | `/orders/:id/status`                                        | Participant autorizat + CSRF                           |

La prima încărcare, frontend-ul citește `/auth/session` cu `credentials: include`. Cererile de scriere trimit `X-CSRF-Token`. Login și înregistrarea regenerează sesiunea și tokenul; logout distruge sesiunea pe server. Cookie-ul `dinsat.sid` este HttpOnly, SameSite=Lax, cu durată de opt ore; Secure în producție. Nici parola, nici ID-ul sesiunii nu sunt păstrate în localStorage. Originea permisă este explicită, iar API-ul verifică tokenul CSRF și originea când headerul Origin este prezent. Sunt aplicate limite pentru cereri și încercări de login.

Prețurile sunt șiruri cu două zecimale și monedă MDL. Totalurile se calculează în bani întregi; versiunea curentă acceptă cantități întregi de kg, l sau buc. O comandă conține un singur producător. Cheia de checkout este reutilizată pentru retry al aceleiași intenții; alt payload cu aceeași cheie primește 409. Anularea repetată nu restabilește stocul de două ori.

## Configurare

`PORT` (3001), `APP_ORIGIN` (`http://localhost:5173`), `SESSION_SECRET` (minimum 32 caractere), `DEMO_MODE`, `NODE_ENV`. Secretul de development este generat aleator dacă lipsește. Folosește aceeași origine publică pentru UI și `/api` prin reverse proxy. Configurează explicit `trustProxy` în `createApp` numai conform proxy-ului de încredere; nu accepta arbitrar headerele clientului. În mai multe instanțe, folosește și un store partajat pentru rate limiting.

Fișierele se versionează în submodulul `din_sat_api`; părintele fixează commit-ul după integrare.
