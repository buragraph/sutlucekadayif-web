-- İlk girişte zorunlu parola değişimi.
--
-- NEDEN: şube sahibi hesapları merkezin belirlediği parolalarla toplu
-- açılıyor. Bu parolalar bir listede duruyor ve en az bir başka kişi
-- tarafından biliniyor; kullanıcı giriş yaptıktan sonra, onboarding'e bile
-- geçmeden kendi parolasını belirlemeli.
--
-- NEDEN `parola_kuruldu` KULLANILMIYOR: o bayrak KİMLİKSİZ uç
-- (POST /api/parola/belirle) için kapı açıyor — e-postayı bilen herkes
-- hesabı sahiplenebiliyor. Parolayla açılan hesapta bu pencereyi açmak
-- istemiyoruz; bu yüzden ayrı bir bayrak. Değişim kimlik doğrulamalı
-- uçtan (POST /api/profil/parola) yapılır ve bayrağı orada sunucu düşürür,
-- istemci kendi başına temizleyemez.
alter table public.kullanici_sube
    add column if not exists parola_degistir_gerekli boolean not null default false;
