# Plan 01 — Категоризація + мерчанти

## Мета
Кожна транзакція має категорію і нормалізованого мерчанта — фундамент для всієї
аналітики, бюджетів і алертів.

## Scope
- In: категорії (ієрархія), автокатегоризація (MCC + rules), ручний override,
  нормалізація мерчантів, рекатегоризація existing.
- Out: ML-категоризація; UI керування правилами (правила — сід + БД, керування через SQL/CLI).

## Модель даних
- `Category(id, name, parentId?)` — 2 рівні достатньо.
- `CategoryRule(id, priority, matcherType: mcc|merchant|description_regex, pattern, categoryId)`.
- `Transaction`: + `categoryId?`, `categorySource: auto_mcc|auto_rule|manual`,
  + `normalizedMerchant?`.
- `MerchantRule(pattern → normalizedMerchant)` — той самий механізм правил.

## Кроки
1. Міграція: категорії, правила, нові колонки transaction.
2. Сід: базове дерево категорій + мапінг MCC → категорія (MCC вже в metadata Monobank).
3. `CategorizationService`: pipeline manual > rule (за priority) > mcc > null.
   Викликається при синку/імпорті (підписник на `transaction.created` або крок sync).
4. Нормалізація мерчанта перед категоризацією (rules + trim/lowercase/номери відділень).
5. Endpoint/CLI ручного override: set category → `categorySource=manual`.
6. Job рекатегоризації existing (не чіпає manual).

## Критерії приймання
- [ ] ≥80% транзакцій реальної бази отримують категорію автоматично (заміряти job-ом).
- [ ] Manual override виграє над будь-яким auto і **переживає ресинк** та рекатегоризацію.
- [ ] Повторний синк не змінює категорії (ідемпотентність, [[Invariants]] #4 за духом).
- [ ] «АТБ #123» і «ATB 456» → однаковий `normalizedMerchant` (тест-кейс).
- [ ] Unit: pipeline пріоритетів, MCC-мапінг, merchant-нормалізація, regex-правила.
- [ ] Інтеграційний: sync → транзакції в БД з категоріями.
- [ ] `tsc` чистий, наявні тести зелені.
