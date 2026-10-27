# Conectarea bazei de date externe

Baza de date, schema și locul de hosting se aleg separat. Nu există ORM, migrații sau presupuneri despre un furnizor în această implementare. `createDemoDatabase()` este un adaptor de development, cu date volatile. Nu îl folosi în producție.

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

Bootstrap-ul demo din `app/server.js` refuză pornirea în producție. Configurează bootstrap-ul conectat după alegerea DB. Frontend-ul continuă să consume același contract HTTP.

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

După integrarea DB: testează două conexiuni reale pe ultimul produs și ultimul loc, rollback după fiecare etapă, emailuri și chei duplicate concurente, sesiuni după restart, anulări concurente și izolarea între conturi. Aplică migrații și constrângeri de unicitate/referință/stoc în repository-ul responsabil de DB. Configurează TLS, cookie Secure, secret persistent, backup și un session store și rate limiter partajate conform topologiei reale.
