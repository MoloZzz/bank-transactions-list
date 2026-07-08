# Financial Transactions Aggregator — Knowledge Base

Персональний фінансовий трекер: збирає транзакції по картках і крипто-поповнення,
вміє зв'язувати гривневий відтік по картці з крипто-припливом (P2P-купівлі),
експортує в Google Sheets. Стек: **NestJS + TypeORM + PostgreSQL**.

> [!info] Статус
> Єдине джерело правди про статус — [[Roadmap & Status]]. Тут статус не дублюється.

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
- [[Crypto CSV]] — Binance P2P + deposit
- [[Bank CSV]] — Privat тощо

## Процес і рішення
- [[Roadmap & Status]] — порядок і що вже готово
- [[Decision Log]] — ключові рішення й чому
