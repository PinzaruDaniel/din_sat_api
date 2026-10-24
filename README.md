# DinSat API

Backend-ul DinSat, pregătit pentru **Node.js și JavaScript**, cu Express ca framework HTTP propus. Este un submodul Git separat, disponibil în `src/din_sat_api` din proiectul principal.

În această etapă există doar structura de directoare și fișiere `.gitkeep`. Nu există încă implementare, dependențe, configurare sau comenzi de pornire; `package.json` va fi adăugat la inițializarea aplicației.

## Organizare

Folosim un monolit modular inspirat de Clean Architecture, organizat mai întâi pe straturi. Directoarele `domain`, `application`, `infrastructure` și `presentation` apar o singură dată în `src/`. În fiecare strat, `features/` grupează fișierele după funcționalitate.

```text
din_sat_api/
├── src/
│   ├── app/
│   │   ├── config/                 # Configurația aplicației și variabilele de mediu
│   │   └── container/              # Construirea și injectarea dependențelor
│   ├── domain/
│   │   └── features/               # Entități, valori și politici, grupate pe funcționalități
│   ├── application/
│   │   └── features/               # Cazuri de utilizare, DTO-uri și porturi
│   ├── infrastructure/
│   │   ├── features/               # Repository-uri concrete și mapări de persistență
│   │   ├── persistence/
│   │   │   ├── connections/        # Adaptorul de conectare la baza de date aleasă
│   │   │   └── transactions/       # Implementarea tranzacțiilor / Unit of Work
│   │   ├── providers/
│   │   │   ├── ai/
│   │   │   ├── billing/
│   │   │   └── storage/
│   │   ├── security/               # Implementări pentru parole și sesiuni
│   │   └── logging/
│   ├── presentation/
│   │   ├── features/               # Rute, controllere, validări și mapări HTTP
│   │   └── http/
│   │       └── middlewares/        # Sesiune, acces, validare și tratarea erorilor HTTP
│   └── shared/
│       ├── errors/                 # Erori comune, independente de HTTP
│       └── utils/                  # Utilitare independente de framework
├── docs/
│   ├── architecture/
│   └── api/                        # Locul viitorului contract API canonic
└── tests/
    ├── unit/
    ├── integration/
    ├── e2e/
    └── fixtures/
```

Fiecare director `features/` din cele patru straturi conține aceleași funcționalități:

```text
features/
├── auth/
├── catalog/
├── producers/
├── orders/
├── pickup/
├── dashboard/
├── ai/
└── billing/
```

De exemplu, autentificarea are modelele și regulile în `src/domain/features/auth/`, cazurile de utilizare și porturile în `src/application/features/auth/`, adaptoarele în `src/infrastructure/features/auth/` și rutele / controllerele în `src/presentation/features/auth/`. Fișierele necesare vor fi adăugate în directorul funcționalității din stratul corespunzător; momentan fiecare conține doar `.gitkeep`.

## Reguli de dependență

- `domain` nu importă Express, drivere DB sau SDK-uri externe.
- `application` folosește domeniul și declară porturile necesare: repository-uri, furnizori și tranzacții. În JavaScript, porturile pot fi contracte documentate pentru obiecte sau funcții.
- `infrastructure` implementează porturile. Adaptoarele specifice unui modul stau în `infrastructure/features/<nume>/`; conexiunile și furnizorii comuni stau în celelalte directoare ale infrastructurii.
- `presentation` traduce cererea HTTP în date pentru un caz de utilizare și rezultatul în răspuns HTTP. Regulile de business rămân în straturile interioare.
- `app` configurează serverul, montează rutele și conectează implementările prin injectarea dependențelor.
- Funcționalitățile colaborează prin cazuri de utilizare sau porturi explicite, fără importuri directe din infrastructura altei funcționalități. `shared` conține doar elemente comune, independente de framework și fără dependențe de funcționalități.

Fluxul unei cereri: rută → controller → caz de utilizare → domeniu / port de repository. Implementarea portului este injectată din `app/container`.

## Module

| Modul | Responsabilitate |
| --- | --- |
| `auth` | Conturi, autentificare și sesiuni |
| `catalog` | Produse, categorii, căutare și disponibilitate |
| `producers` | Profiluri și administrarea producătorilor |
| `orders` | Crearea comenzilor, totaluri, statusuri și anulare |
| `pickup` | Puncte, intervale și capacitate pentru ridicare |
| `dashboard` | Statistici și agregate pentru producători |
| `ai` | Cumpărături asistate și orchestrarea instrumentelor |
| `billing` | Planuri, limite și abonamente |

Coșul temporar este gestionat în frontend. Backend-ul validează articolele, prețurile, stocul și ridicarea la crearea comenzii.

## Baza de date și contractul API

Tehnologia și schema bazei de date rămân de stabilit separat. Structura nu presupune PostgreSQL, un ORM sau schema din documentele de referință. Migrațiile și datele demo vor fi organizate după alegerea soluției de date.

Doar adaptoarele de infrastructură cunosc mecanismul de persistență. Cazurile de utilizare coordonează tranzacțiile prin porturi, astfel încât schimbarea bazei de date să nu impună schimbarea domeniului.

Contractul HTTP va fi documentat în `docs/api/`, cu prefixul propus `/api/v1`. Frontend-ul consumă API-ul prin HTTP, fără importuri din codul backend-ului.

## Lucrul în submodul

Modificările se salvează în repository-ul `din_sat_api`. După publicarea commit-ului copil, repository-ul principal poate actualiza referința către versiunea API verificată împreună cu frontend-ul.

Fișierele `.gitkeep` păstrează directoarele goale în Git și pot fi eliminate când directoarele primesc conținut.
