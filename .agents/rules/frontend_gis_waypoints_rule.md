---
trigger: always_on
description: Frontend GIS Harita, Saf Waypoint Mimarisi (duraklar ve via'lar eşit statüde tekil sıralı waypoints dizisidir), OSRM asfalt projeksiyonu ve şerit kilitleme kuralları.
---

# Kural: Frontend GIS & Saf Waypoint Mimarisi (Pure Waypoint Uniformity & Shape-Path Projection)

Bu kural, `transit-web-admin-client` projesinde OSRM güzergah çizimi, waypoint dizilimi ve harita etkileşimlerini bağlayıcı olarak düzenler.

## 1. Saf Waypoint Gerçekliği (Pure Waypoint Uniformity - No `afterStopId`)
- **Tüm Noktalar Eşit Statüde Birer Waypoint'tir:**
  - Haritada hat üzerinde yer alan duraklar ve via/şerit kılavuz noktaları iki ayrı varlık tipi DEĞİLDİR.
  - State içerisinde duraklar ve via noktaları KESİNLİKLE iki ayrı bağımsız dizi (`draftStops`, `viaPoints`) olarak parçalanmaz; `afterStopId` veya `viaMap` gibi ara eşleştirme nesneleri KESİNLİKLE kullanılmaz.
- **Tekil Doğruluk Kaynağı (Pure Single SSoT):**
  - Frontend'in yegane durum kaynağı `draftWaypoints: RouteWaypointDto[]` (1..N) sıralı dizisidir.
  - **Aralarındaki Tek Ayrım:**
    - `stopId != null` $\rightarrow$ Yolcu Durağı (`name: string` dolu, durak ikonu).
    - `stopId == null` $\rightarrow$ Güzergah / Şerit Kılavuzu (`name: null`, küçük via ikonu).
- **Doğrudan Dizi Manipülasyonu:**
  - Yeni durak ekleme, via ekleme, taşıma veya silme işlemleri doğrudan bu tek sıralı dizi üzerinde `splice` ve `resequence` (1..N) olarak işletilir.

## 2. Doğrudan ve Sıralı OSRM Şekil Üretimi
- **OSRM'e Tek Seferde İletim:**
  - Güzergah şekli üretilirken `draftWaypoints` dizisindeki tüm noktaların koordinatları doğal sırasıyla ($1..N$) OSRM `/route` servisine gönderilir.
  - OSRM bu sıralı waypoint dizisini alarak yolu tam olarak bu sırayla asfalta oturtur ve tekil pürüzsüz rota geometrisini (`shapes`) döner.
  - Haritadaki güzergah çizgisi doğrudan bu OSRM çıktısından (`draftShapes`) çizilir. Noktalar arasına hayali düz çizgiler çekmek KESİNLİKLE YASAKTIR.

## 3. Haritada Nokta Ekleme ve Eğri İzdüşümü (Monotonic Shape-Path Projection)
- **Kuş Uçuşu Düz Çizgi Yasağı:** Tıklanan bir noktanın rotanın hangi iki waypoint'i arasına gireceğini bulmak için kontrol noktaları arasına düz çizgiler çekmek KESİNLİKLE YASAKTIR.
- **Gerçek Asfalt İzdüşümü:** Tıklanan koordinat, OSRM'in ürettiği gerçek asfalt eğrisi (`draftShapes`) üzerindeki en yakın konuma projekte edilir ($S_{click}$).
- **Monoton Sıralama:** Her bir waypoint'in `draftShapes` üzerindeki indeksleri ($S_0 \le S_1 \le \dots \le S_N$) bilindiğinden; $S_{click}$ değeri hangi ardışık iki waypoint aralığına ($[S_k, S_{k+1}]$) düşüyorsa yeni nokta kesinlikle $k+1$. sıraya eklenir.

## 4. U Dönüşleri ve Çift Geçişli Bulvarlarda Şerit Koruma (Segment-Locked Interaction)
- **Global Arama Yasağı:** U dönüşü, kavşak kolları ve çift yönlü bulvarlarda serbest harita araması ile kilit noktası yerleştirilemez.
- **Segment Kilitleme:** Kullanıcı mavi hat polyline'ına tıkladığında veya sürüklediğinde (`bendSegment`), etkileşim doğrudan kullanıcının tıkladığı segmentin iki ucundaki ardışık waypoint'lere ($W_k$ ve $W_{k+1}$) kilitlenir (`fromIdx + 1` indeksine eklenir); rotanın karşı şeride veya U dönüşünün ters koluna sıçraması engellenir.

## 5. Çizim Sırasında Sıfır DB Kaydı & Salt OSRM Şekil Çizimi (Pure In-Memory Drafting)
- **API Sadece Şekil İçin Kullanılır:** Çizim ve düzenleme sırasında API yalnızca OSRM hesaplamasını yapıp bize döneceği shape'i ekranda çizmek için kullanılır.
- **Kaydet Butonuna Basılmadan Kayıt Yapılmaz:** Haritada durak eklerken, via eklerken, taşırken veya silerken veritabanına (`shapes_worksheet`, `waypoints_worksheet`, `stops_worksheet`) KESİNLİKLE kayıt atılmaz.
- **Kalıcı Kayıt Sadece Butonda:** Veritabanına kayıt SADECE VE SADECE kullanıcı "Taslağı Kaydet" butonuna bastığında tek bir paket olarak iletilir.

