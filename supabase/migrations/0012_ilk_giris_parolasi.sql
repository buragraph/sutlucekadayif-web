-- 0012_ilk_giris_parolasi.sql — parolasız hesap + ilk girişte parola belirleme
--
-- KARAR: Yönetici artık geçici parola dağıtmıyor. Hesap PAROLASIZ açılıyor,
-- kişi giriş ekranına e-postasını ve istediği parolayı yazıyor; hesabın parolası
-- henüz kurulmamışsa o parola kalıcı oluyor ve aynı istekle giriş yapıyor.
--
-- BİLİNEN RİSK (kullanıcı onayıyla): doğrulama YOK. E-postayı bilen herkes
-- kurulmamış bir hesabın parolasını belirleyip hesabı alabilir. Davet bağlantılı
-- alternatif önerildi, doğrulamasız akış tercih edildi. Bu yüzden:
--   • her deneme `parola_belirleme_log`'a yazılır (kim, ne zaman, hangi IP)
--   • uç oran sınırlı — ama prod Workers'ta `oranSiniri` no-op (bkz. shared/limit.js),
--     gerçek sınır Cloudflare kenar kuralı olarak tanımlanmalı.
--
-- `parola_kuruldu` VARSAYILANI TRUE: mevcut 79 hesabın parolası zaten var,
-- migration onları yanlışlıkla "sahiplenilebilir" yapmamalı. Yalnızca parolasız
-- açılan yeni hesaplar false ile yazılır (bkz. routes/users.js POST).

alter table kullanici_sube
  add column if not exists parola_kuruldu boolean not null default true;

create table parola_belirleme_log (
  id       bigserial primary key,
  eposta   text not null,
  uid      text,
  sonuc    text not null,        -- 'belirlendi' | 'hesap_yok' | 'zaten_kurulu' | 'gecersiz'
  ip       text,
  zaman    timestamptz not null default now()
);

create index parola_belirleme_log_zaman_idx on parola_belirleme_log (zaman desc);
create index parola_belirleme_log_eposta_idx on parola_belirleme_log (eposta, zaman desc);

alter table parola_belirleme_log enable row level security;
