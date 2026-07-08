# Financial Transactions Aggregator — Knowledge Base

Персональний фінансовий трекер: збирає транзакції по картках і крипто-поповнення,
вміє зв'язувати гривневий відтік по картці з крипто-припливом (P2P-купівлі),
експортує в Google Sheets. Стек: **NestJS + TypeORM + PostgreSQL**.

> [!info] Статус на зараз
> Кроки 1–3 зроблені й протестовані (БД → normalize → Monobank → sync → подія → Sheets),
> плюс інкрементальний синк, рахунки/картки та фікс крос-валютних сум.
> Наступне — **[[Crypto CSV]]** (крок 4). Деталі: [[Roadmap & Status]].

## Бізнес
- [[Vision & Goals]] — що це, для кого, навіщо, межі
- [[Requirements]] — функціональні вимоги
- [[Card↔Crypto Matching]] — головна доменна фішка (P2P-метчинг)
- [[Glossary]] — терміни

## Архітектура
- [[Architecture Overview]] — шари й потік даних (діаграма)
- [[Invariants]] — непорушні правила
- [[Data Model]] — сутності й схема (ERD)
- [[Sync Engine]] — як тягнеться і зберігається
- [[Providers]] — контракт джерела
- [[Events & Export]] — подія + Google Sheets

## Джерела даних
- [[Monobank]] — API, ліміти, підводні камені
- [[Crypto CSV]] — Binance P2P + deposit (план)
- [[Bank CSV]] — Privat тощо (пізніше)

## Процес і рішення
- [[Roadmap & Status]] — порядок і що вже готово
- [[Decision Log]] — ключові рішення й чому
