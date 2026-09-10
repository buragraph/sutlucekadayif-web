# GraphQL Injection — Sonuç

**Durum: UYGULANAMAZ** (not applicable)

## Neden

Proje GraphQL kullanmıyor; API tamamen REST (Express route'ları, `/api/*`).

## Doğrulama

- `grep -rniE "graphql|apollo|\bgql\b|/graphql"` → backend ve frontend'de
  (`*.js`, `*.jsx`) **hiç eşleşme yok**.
- `backend/package.json` ve `frontend/package.json` bağımlılıklarında `graphql`,
  `@apollo/*`, `apollo-server`, `graphql-request` vb. **yok**.
- Tüm uç noktalar Express router ile tanımlı klasik REST (bkz. `architecture.md`
  Entry Points tablosu). GraphQL şeması, resolver veya `/graphql` endpoint'i yok.

## Sonuç

GraphQL teknolojisi bulunmadığından bu sınıf uygulanamaz.
