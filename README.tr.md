# performance

Oturum boyunca hangi skill'lerin (slash komutlarının) kullanıldığını sessizce takip eden, ardından kullanılan ve kaçırılan skill'leri hızlı bir Haiku ajanı aracılığıyla raporlayan, kendi kendini denetleyen bir Claude Code eklentisi. Hiçbir yapılandırma gerekmez: yükle ve çalıştır.

---

## Ne Yapar?

Her Claude Code oturumunda performance şunları yapar:

- Araç kullanım olaylarını bir JSONL günlüğüne toplar
- Oturum başında ve sıkıştırma öncesinde asistanın farkında kalması için bir hatırlatıcı enjekte eder
- `git commit` işlemlerini koruma altına alır — denetim henüz çalıştırılmadıysa commit engellenir, önce `/skill-analysis` çalıştırmanız istenir
- İstek üzerine (veya commit zamanında) iki aşamalı bir analiz çalıştırır: ana model skill kataloğunu ~5–10 en ilgili adaya daraltır, ardından bir Haiku alt ajanı üç tabloluk temiz bir rapor üretir

Çıktı dili kullanıcının son mesajlarından otomatik olarak algılanır — kullanılan skill'ler, kaçırılan skill'ler ve oturumun MOC (İçerik Haritası) akışını kapsayan üç tablo içerir.

---

## Kurulum

**Marketplace ekle**
```bash
/plugin marketplace add barisatalay/performance
```

**Plugin'i kur:**
```bash
/plugin install performance@performance
```

**Güncelleme**
```bash
/plugin marketplace update
```

Başka bir ayar yapmanıza gerek yoktur. Eklenti hook'larını ve skill tanımını otomatik olarak kaydeder.

---

## Nasıl Çalışır?

```
Oturum Başlangıcı
       │
       ▼
┌──────────────────────────┐
│  skill-analysis-session   │  SessionStart hook
│  Denetim bayrağını sıfırlar│  PreCompact hook
│  Bağlam hatırlatıcısı    │
│  enjekte eder            │
└──────────────────────────┘
       │
       ▼ (her araç kullanımında)
┌──────────────────────────┐
│  skill-tracker-post       │  PostToolUse hook
│  Olayı JSONL'e ekler     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  TaskUpdate(completed)    │
│  → Denetim henüz çalışma-│
│    dıysa tetikleyici     │
│    enjekte eder          │
└──────────────────────────┘
       │
       ▼ (git commit sırasında)
┌──────────────────────────┐
│  skill-audit-reminder     │  PreToolUse hook
│  Denetim çalıştırılmadıysa│
│  commit'i engeller       │
└──────────────────────────┘
       │
       ▼ (otomatik veya manuel)
┌──────────────────────────┐
│  /skill-analysis skill    │  İki aşamalı analiz
│  Ana model ön filtreler  │
│  → Haiku tabloları üretir│
└──────────────────────────┘
```

### Hook'lar

| Hook Dosyası | Olay | Amaç |
|---|---|---|
| `skill-tracker-post.mjs` | PostToolUse | Her araç kullanım olayını `skill-tracker.jsonl` dosyasına ekler. Task tamamlandığında skill-analysis tetikleyicisi enjekte eder |
| `skill-analysis-session.mjs` | SessionStart, PreCompact | Oturum kimliğini yazar, denetim bayrağını sıfırlar ve skill farkındalık hatırlatıcısını enjekte eder (bağlam sıkıştırmasından sağ çıkar) |
| `skill-audit-reminder.mjs` | PreToolUse (Bash, Skill) | `git commit` ve skill çağrılarını yakalar; denetim bayrağı yoksa engeller |

`hooks/hooks.json` dosyası üç hook'u da Claude Code sistemiyle kaydeder.

### Skill

| Skill | Tetikleyici | Ne Yapar? |
|---|---|---|
| `/skill-analysis` | Manuel veya commit koruması | JSONL günlüğünü okur, kataloğu ön filtreler, son tabloları Haiku'ya devreder |

---

## Kullanım

### Otomatik

1. Bir Claude Code oturumu başlatın — hatırlatıcı otomatik olarak enjekte edilir ve denetim bayrağı sıfırlanır.
2. Normal şekilde çalışın. Her araç çağrısı arka planda günlüğe kaydedilir.
3. Bir task `TaskUpdate` ile tamamlandığında, eklenti asistana kalan task'ları kontrol edip tümü bittiyse `/skill-analysis` çalıştırması için güçlü bir tetikleyici enjekte eder.
4. `git commit` çalıştırdığınızda, commit koruması denetimin çalıştırılıp çalıştırılmadığını kontrol eder. Çalıştırılmamışsa commit engellenir ve önce `/skill-analysis` çalıştırmanız istenir.

### Manuel

Oturum sırasında veya sonrasında istediğiniz zaman:

```
/skill-analysis
```

Bu komut iki aşamalı analizi başlatır ve üç tabloluk raporu doğrudan konuşmada görüntüler.

### Çıktı

Rapor kullanıcının algılanan dilinde üretilir ve üç tablo içerir:

- **Tablo 1** — Kullanılan Skill'ler: gerçekten kullanılan skill'ler ve kullanım amaçları
- **Tablo 2** — Kaçırılan Skill'ler: kullanılması gereken skill'ler ve kanıtları. Yalnızca somut, inkâr edilemez kanıt olduğunda (%90+ güven) listelenir. Spekülatif bir tablodan boş tablo tercih edilir.
- **Tablo 3** — MOC Akışı: oturumun İçerik Haritası akışı; konuları ilgili dosyalarla ilişkilendirir

---

## Örnek Çıktı

```
## Skill Analiz Raporu

### Tablo 1: Kullanılan Skill'ler

| Skill | Kullanım Amacı |
|---|---|
| /commit | Değişiklikleri git'e kaydetmek için kullanıldı |
| /simplify | Yeni eklenen hook kodunu sadeleştirmek için çalıştırıldı |
| /review-pr | PR açılmadan önce değişiklikler gözden geçirildi |

### Tablo 2: Kaçırılan Skill'ler

| Skill | Neden Gerekli? | Kanıt |
|---|---|---|
| /test-driven-development | Yeni hook fonksiyonları için birim testler yazılmadan önce kullanılmalıydı | hooks/skill-tracker-post.mjs yeni oluşturuldu, TDD trigger koşulu karşılandı |

### Tablo 3: MOC Akışı

| MOC | İlgili Dosyalar |
|---|---|
| Hook Sistemi | hooks/skill-tracker-post.mjs, hooks/hooks.json |
| Skill Tanımı | skills/skill-analysis/SKILL.md |
| Yapılandırma | .claude-plugin/plugin.json |
```

---

## Eklenti Dosya Yapısı

```
performance/
├── .claude-plugin/
│   ├── plugin.json                # Eklenti manifestosu (ad, sürüm, hook'lar, skill'ler)
│   └── marketplace.json           # Marketplace listeleme meta verisi
├── hooks/
│   ├── hooks.json                 # Claude Code sistemi için hook kaydı
│   ├── skill-tracker-post.mjs     # PostToolUse: araç olaylarını JSONL'e kaydeder
│   ├── skill-audit-reminder.mjs   # PreToolUse: denetim çalıştırılmadıysa commit'i engeller
│   └── skill-analysis-session.mjs # SessionStart + PreCompact: hatırlatıcı enjekte eder
├── skills/
│   └── skill-analysis/
│       └── SKILL.md               # /skill-analysis skill tanımı
├── version.txt                    # Güncel sürüm
├── README.md                      # İngilizce belgeleme
└── README.tr.md                   # Bu dosya (Türkçe)
```

---

## İki Aşamalı Analiz

Her oturum için 60'tan fazla girişten oluşan tam skill kataloğunu Haiku'ya göndermek, gürültülü ve odaksız çıktılar üretir. performance iki aşamalı bir yaklaşım kullanır:

**1. Aşama — Ön Filtreleme (ana model)**

Ana model, oturum sırasında düzenlenen dosyaların listesini okur ve katalogdaki hangi ~5–10 skill'in o çalışmayla gerçekten ilgili olduğunu değerlendirir. Bu aşama kısa ve odaklı bir aday listesi üretir.

**2. Aşama — Rapor (Haiku ajanı)**

Haiku alt ajanı yalnızca aday listesini ve ham JSONL günlüğünü alır. Gerçek araç kullanımını adaylarla karşılaştırır ve son üç tabloluk raporu üretir. Girdi küçük ve odaklı olduğundan Haiku'nun çıktısı kesin ve hızlıdır.

Bu tasarım; gecikmeyi düşük, maliyeti minimal ve çıktı kalitesini yüksek tutar — küresel skill kataloğu ne kadar büyürse büyüsün.

---

## Çalışma Zamanı Durum Dosyaları

Eklenti, oturum durumunu eklenti kökünde değil, **projenin** `.claude/hooks/state/` dizininde saklar. Bu, durumun proje bazında izole kalmasını ve eklenti kurulumunun kirlenmemesini sağlar.

| Dosya | Amaç |
|---|---|
| `skill-tracker.jsonl` | Mevcut oturum için tüm araç kullanım olaylarının ekleme-yalnızca günlüğü |
| `skill-tracker-session.txt` | SessionStart sırasında yazılan mevcut oturum kimliği |
| `skill-audit-flag.json` | Denetim tamamlandığında yazılır; commit koruması tarafından okunur |

Bu dosyalar ilk kullanımda otomatik olarak oluşturulur. Bir oturumun durumunu sıfırlamak için güvenle silebilirsiniz.

---

## Sorun Giderme

### `/skill-analysis` çalıştırdım ama commit hâlâ engelleniyor

Commit koruması `.claude/hooks/state/` dizinindeki `skill-audit-flag.json` dosyasını okur. Dosya eksikse koruma engeller. Olası nedenler:

- Skill başarıyla tamamlanmadı — konuşmadaki hataları kontrol edin.
- Durum dizini henüz mevcut değil — ilk SessionStart'ta oluşturulur. Yeni bir oturum başlatmayı deneyin.
- `git commit` komutunu oturumun başlatıldığı çalışma dizininden farklı bir yerden çalıştırıyorsunuz.

**Çözüm:** Mevcut oturumda `/skill-analysis` komutunu tekrar çalıştırın. Sorun devam ederse bayrak dosyasını manuel olarak oluşturun:
```bash
echo '{"sessionId":"manual","auditRanInSession":true,"blockShownInSession":false}' > .claude/hooks/state/skill-audit-flag.json
```

### JSONL verisi yok — tablolar boş geliyor

`skill-tracker-post.mjs` hook'u tetiklenmedi. Olası nedenler:

- Eklenti mevcut oturum başladıktan sonra kuruldu. Claude Code'u yeniden başlatın.
- Hook'lar kayıtlı değil. `hooks/hooks.json` dosyasını kontrol edin ve eklentinin `claude plugin list` çıktısında göründüğünü doğrulayın.

### ASCII dışı karakterler bozuk görünüyor

Terminalinizin ve düzenleyicinizin UTF-8 olarak ayarlandığından emin olun. Çıktı, algılanan kullanıcı diline bağlı olarak ASCII dışı karakterler içerebilir.
