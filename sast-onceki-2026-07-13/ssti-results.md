# Server-Side Template Injection (SSTI) — Sonuç

**Durum: UYGULANAMAZ** (not applicable)

## Neden

Sunucu tarafında bir template engine (ejs, pug, handlebars, nunjucks, mustache,
liquid...) kullanılmıyor. `res.render` / `app.set('view engine', ...)` yok.

## Doğrulama

- `grep -rniE "ejs|pug|jade|handlebars|hbs|nunjucks|mustache|liquid|res\.render|app\.set\(['\"]view"`
  → backend'de **hiç eşleşme yok**.
- `new Function(...)` / `.render(...)` / `compile(...)` gibi dinamik template derleme
  çağrısı **yok**.
- `package.json`'da template engine bağımlılığı **yok**.

## PDF şablonu notu

`backend/modules/reports/services/report-template.js` HTML üretir, ancak bu bir
template **engine** değildir — düz JavaScript template literal'i döner
(`return \`<!DOCTYPE html>...\``, satır 22). Kullanıcı/veri değerleri JS string
interpolasyonuyla (`${...}`) gömülür; bir şablon dili "template olarak" derlenip
çalıştırılmaz. Dolayısıyla SSTI (template dili sözdiziminin sunucuda değerlendirilmesi)
söz konusu değildir.

Buradaki gerçek risk **XSS**'tir: değerler HTML'e kaçışsız enterpole edilir
(`sube.ad`, `donem.label` vb.) ve sonra puppeteer ile PDF'e render edilir. Bu yüzey
`sast/xss-results.md` kapsamında değerlendirilmelidir, SSTI değil.

## Sonuç

Sunucu template engine olmadığından SSTI uygulanamaz; ilgili risk XSS sınıfına ait.
