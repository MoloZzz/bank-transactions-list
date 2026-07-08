# Glossary

- **Transaction** — нормалізований запис руху грошей (фіат або крипта), source-agnostic.
  Зберігається в таблиці `transactions`. → [[Data Model]]
- **Account** — рахунок/картка джерела (Monobank-рахунок, крипто-акаунт). Транзакція
  лінкується через `accountId`. → [[Data Model]]
- **NormalizedTransaction** — канонічна форма, у яку провайдер мапить сирі дані джерела;
  лягає 1:1 у сутність. → [[Providers]]
- **Provider** — реалізація одного джерела під контрактом `TransactionProvider`
  (`fetch(sinceSec?)`). Тільки fetch + мапінг полів, без бізнес-логіки. → [[Providers]]
- **Source** — ключ джерела (`monobank`, `binance_p2p_csv`, `binance_deposit_csv`, …).
- **externalId** — стабільний id запису в межах джерела; для CSV — детермінований хеш
  рядка. Разом із `source` дає ключ дедупу. → [[Invariants]] #4
- **Minor units (мінорні одиниці)** — ціле у найдрібнішій одиниці валюти: копійки/центи
  (scale 2), сатоші (BTC scale 8), wei (ETH scale 18). Гроші зберігаємо тільки так.
- **decimals / scale** — кількість десяткових знаків валюти/активу; зберігається поруч
  із сумою, щоб її можна було відобразити.
- **bookedAt** — час транзакції в UTC.
- **watermark** — `max(bookedAt)` по джерелу; нижня межа інкрементального синку.
  → [[Sync Engine]]
- **mcc** — Merchant Category Code (тип торговця); Monobank віддає, кладемо в `metadata`,
  джерело для майбутньої категоризації.
- **P2P** — peer-to-peer купівля крипти за фіат (Binance P2P). → [[Card↔Crypto Matching]]
- **operationAmount / operationCurrency** — сума/валюта операції (Monobank), на відміну
  від суми у валюті рахунку; для крос-валютних платежів. → [[Monobank]]
- **CryptoPurchase** — майбутня сутність результату метчингу card↔crypto.
  → [[Card↔Crypto Matching]]
- **rateSource** — джерело курсу для оцінки fiat: `CSV` (з P2P) або `NBU` (estimate).
