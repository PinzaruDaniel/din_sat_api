# Conectarea bazei de date externe

Persistența este implementată pe PostgreSQL prin driverul `pg`, fără ORM. Aplicația este conectată la proiectul Neon `late-cloud-11138544`, ramura `production`; API-ul și interfața sunt pornite local. Repository-urile folosesc SQL și porturile de mai jos, astfel că pot folosi în continuare și un PostgreSQL local. `createDemoDatabase()` rămâne un adaptor opțional de development, cu date volatile.

## Schema și inițializarea

`database/migrations/001_initial.sql` creează `users`, `producers`, `products`, `pickup_slots`, `orders`, `order_items`, `idempotency_requests` și `sessions`. `schema_migrations` păstrează versiunile și checksum-urile. Migrațiile aplicate nu se editează; se adaugă un nou fișier SQL versionat. Aplicarea este serializată și atomică.

```bash
npm run db:migrate
npm run db:seed
npm run db:check
npm run test:postgres
```

Pentru Neon, rulează `npm run db:migrate` și `npm run db:check` din rădăcina repository-ului principal. Acestea încarcă fișierele de mediu ignorate de Git, inclusiv `.env.local` generat de Neon, și lasă variabilele exportate să aibă prioritate. Pentru PostgreSQL local rulează comenzile din submodulul API, unde acestea citesc `.env` al submodulului. Seed-ul este explicit, idempotent și refuzat când `NODE_ENV=production`; nu resetează stocul sau comenzile existente.

Runtime-ul `pg` citește `DATABASE_URL` pentru conexiunea pooled, iar comenzile DB aleg `MIGRATION_DATABASE_URL`, `DATABASE_URL_UNPOOLED`, apoi `DATABASE_URL`. Migrarea cere o conexiune directă și refuză hostname-urile Neon `*-pooler`. Tranzacțiile de checkout folosesc un singur client și blocări valabile doar pe durata tranzacției, compatibile cu pooling-ul tranzacțional. Pentru `*.neon.tech`, un `sslmode` absent sau `require` este normalizat la `verify-full`, cu verificarea certificatului și a hostname-ului.

Schema acoperă contractul implementat acum: monedă MDL, cantități întregi, profil producător și intervale cu locație inclusă. Nu introduce încă entități separate de puncte de ridicare, facturare sau AI. Aceste extinderi cer migrații noi și actualizarea contractului.

## Bootstrap

Creează adaptoarele în `infrastructure/features/<feature>/` și conexiunea în `infrastructure/persistence/connections/`. Într-un bootstrap pentru mediul conectat, construiește:

```js
const services = createServices({
  repositories: { users, catalog, pickup, orders },
  passwords: await createPasswords(),
});
const app = createApp({
  services,
  sessionStore, // Implementare durabilă compatibilă cu express-session.
  config: {
    production: true,
    demo: false,
    origin: 'https://your-domain.example',
    sessionSecret: process.env.SESSION_SECRET,
    trustProxy: 1, // Numai dacă ai exact un proxy de încredere.
  },
});
```

`app/server.js` selectează modul prin `loadConfig()` și `createRuntime()`: `DEMO_MODE=false` construiește toate repository-urile PostgreSQL și session store-ul `connect-pg-simple`, cu tabelul `sessions`. Nu există fallback la memorie dacă DB nu răspunde. Startup-ul verifică tabelele; migrarea și seed-ul nu sunt executate automat. `/api/v1/ready` întoarce 503 dacă DB nu răspunde, iar `/health` verifică procesul. `SESSION_SECRET` trebuie să rămână constant pentru păstrarea sesiunilor la restart.

## Porturi asincrone

| Port      | Operații                                                                            |
| --------- | ----------------------------------------------------------------------------------- |
| `users`   | `findByEmail(email)`, `findById(id)`, `create({ name, email, role, passwordHash })` |
| `catalog` | `all()`, `find(id)`, `create(input)`, `producers()`                                 |
| `pickup`  | `list(producerId)`, `create(input)`                                                 |
| `orders`  | `list(user)`, `transaction(async tx => result)`                                     |

`users.create` trebuie să asigure email unic normalizat și să creeze profilul public al producătorului atomic. Rolurile publice sunt doar `buyer` și `producer`. Returnează o eroare `AppError(409, 'EMAIL_EXISTS', ...)` la conflict. Hash-urile Argon2id rămân private.

`catalog.all` și `catalog.find` întorc modelele publice de produs și profilul public `producer`; nu include câmpuri private ale DB. La volume mari, mută filtrarea/paginarea în porturi de query explicite, păstrând DTO-ul și contractul HTTP.

## Portul tranzacției comenzilor

`orders.transaction` trebuie să execute callback-ul pe **aceeași conexiune/tranzacție** și să asigure rollback la orice excepție. Callback-ul primește operații asincrone:

- `findRequest(userId, key)`: revendică/blochează cheia pentru operația de checkout. În DB este necesară unicitate pentru cont + operație + cheie. O cerere concurentă așteaptă rezultatul sau primește un conflict temporar clar.
- `findOrder(id)`: blochează comanda când este actualizată/anulată.
- `findProduct(id)`: citește și blochează produsul; checkout-ul le cere în ordine stabilă după ID.
- `findSlot(id)`: citește și blochează intervalul de ridicare.
- `changeStock(productId, difference)`, `changeCapacity(slotId, difference)`: actualizări în tranzacție, cu constrângeri nenegative.
- `saveOrder(order)`: salvează comanda și snapshot-ul articolelor; creează sau actualizează după ID.
- `saveRequest({ userId, key, hash, orderId })`: persistă rezultatul idempotent în aceeași tranzacție.

La anulare, `changeStock` și `changeCapacity` trebuie să blocheze resursele în aceeași ordine ca la creare: produse sortate, apoi interval. Ordinea de acces și retry-urile tranzacțiilor se verifică cu driverul DB ales. Nu efectua apeluri externe în tranzacție.

Adaptorul în memorie serializează scrierile doar în procesul curent și face rollback prin snapshot. Nu oferă durabilitate, scalare pe mai multe procese sau dovada corectitudinii viitoarei baze de date.

## Verificări înainte de producție

`npm run test:postgres` verifică pe două conexiuni reale ultimul produs și ultimul loc, chei duplicate concurente, rollback după rezervare, sesiuni după recrearea runtime-ului, anulări concurente, istoric și izolarea între conturi. Testele cer `TEST_DATABASE_URL` către o bază al cărei nume este explicit de test și lucrează în scheme aleatoare, eliminate la final. Nu folosi baza aplicației pentru teste.

Înainte de producție, configurează TLS conform furnizorului, cookie Secure, secret persistent și backup. Sesiunile sunt partajate în PostgreSQL; rate limiting-ul este încă în memoria procesului și necesită un store partajat înainte de rularea mai multor instanțe API. Detalii despre furnizori sunt în ghidul `docs/hosting.md` al repository-ului principal.
