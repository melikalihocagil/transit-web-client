---
trigger: always_on
description: Asistanın backend kodlarına, dizinlerine veya dosyalarına erişmesini, düzenlemesini veya müdahale etmesini kesin olarak yasaklar.
---

# Kural: Kesin Backend Müdahale ve Erişim Yasağı (Strict No-Backend)

## 1. Backend Dokunulmazlığı
- Asistanın backend (`transit`, Spring Boot, Java, backend dizinleri veya sunucu konfigürasyonları) dosyalarına erişmesi, bunları düzenlemesi, değiştirmesi veya yeni backend dosyası oluşturması KESİNLİKLE YASAKTIR.

## 2. Eksik veya Hatalı Backend Durumu
- Backend eksik, hatalı veya yetersiz olsa dahi asistan backend tarafına kesinlikle müdahale edemez.
- Backend'i düzeltmek amacıyla kod yazamaz veya backend'e müdahale teklif edemez.
- Backend tarafındaki tüm geliştirme, endpoint açma ve düzeltme işlemleri münhasıran kullanıcının yetki ve sorumluluğundadır.

## 3. Münhasır Çalışma Alanı (Frontend)
- Asistanın tek çalışma alanı mevcut frontend projesidir (`transit-web-admin-client`).
- Asistan, backend'in sunduğu mevcut API'leri olduğu gibi tüketir veya backend eksikse kullanıcının sağlayacağı kontratlara göre frontend tarafındaki entegrasyonu şekillendirir.
