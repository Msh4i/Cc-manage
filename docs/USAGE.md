# Kullanım notu

## 1. Kurulum

Terminal oturumunda: `/plugin install session-budget --marketplace Msh4i/cc-manage`, `y` ile pazar yerini
ekleyin, kapsam seçin. Mod bu oturumda hemen çalışır. Desktop'ta Code sekmesinde, terminalden kurulmuş mod
kullanıcı kapsamında yüklenir.

## 2. Bütçe nasıl ayarlanır

`/manage` ile paneli açın.

- **Haftalık bütçe**: haftalık limitin yüzde kaçının kullanılacağı (varsayılan %70). Gerçek yüzde Claude'dan okunur.
- **5 saatlik bütçe**: 5 saatlik limitin yüzde kaçının kullanılacağı (varsayılan %80). Gerçek yüzde Claude'dan okunur.
- Her adımda iki pencerede de kalan pay hesaplanır. İşin tahmini kalanı birine sığmıyorsa kademe sıkılaşır, en fazla
  Strict kademesine kadar. Kalibrasyon bitmeden de bütçe tükenmişse Strict'e geçilir. Hiçbir oturum durdurulmaz.
- `-5 -1 +1 +5` düğmeleri değeri değiştirir (Mods'ta kaydırıcı öğesi yok).
- Bütçeyi aşmak engellenmez: kademe sıkılaşır, çubuk kırmızı olur, bir kez toast çıkar.

## 3. Tahmin ve kademeler

Her model isteğinde (adımda) şunlar hesaplanır: adım başına hareketli ortalama, kalan adım (todo listesinden),
`işin kalanı = ortalama × kalan × güvenlik katsayısı (1.25)`. Bu, her pencerede bütçeden kalanla karşılaştırılır;
panelde "Bu hızla haftalık bütçe ~14. adımda biter" gibi bir cümle görünür.

Yüzde ↔ maliyet oranı Anthropic tarafından yayınlanmıyor; mod bunu her pencere için gerçek okumalardan **ölçer**
(haftalık oran oturumlar arasında saklanır, 5 saatlik her oturumda yeniden ölçülür). Ölçüm yetmeden panel
"Kalibre ediliyor" der; o sırada yalnız tükenmiş bir bütçe kademeyi değiştirir.

| Kademe | Ne olur | Kalite alt sınırı |
|---|---|---|
| 1 Light | Kısa yanıt, gereksiz okuma yok | güvenlik, doğruluk, çalışan kod asla feda edilmez |
| 2 Medium | Testler yalnız kritik yollarda, yorum az, tekrar arama yok, effort `medium` | aynı |
| 3 Strict | En küçük değişiklik, refactor yok, alt ajan kapalı, effort `low` | aynı |

Kademeler `mod/config/tiers.json` dosyasındadır. Eşikler (`enterAt` / `exitAt`, aralarındaki fark gidip gelmeyi
önler), kural metinleri, effort, yasaklı araçlar düzenlenebilir. Kendi dosyanız için `tiersPath` ayarını kullanın.
Her geçiş toast, status line ve panelde nedeniyle birlikte yazılır. `/tier off` ile otomatiği kapatın, `/tier 2`
gibi elle seçin.

## 4. Her zaman açık tasarruf

Kademelerden bağımsız, her oturumda çalışır; ikisi de `/config` içinden kapatılabilir.

- **Yazıyı Haiku yazar** (`costRouting`). Mod `session-budget:writer` adlı bir ajan kaydeder (Haiku 4.5, araçları
  Read/Write/Edit/Glob/Grep) ve sistem istemine sabit bir kural ekler: 15 satırı aşan düz yazı (belge, README,
  rehber, değişiklik notu, uzun yorum, uzun commit/PR metni) oturumun modeline yazdırılmaz. Ana model kaynakları
  kendisi okumaz; yazara kısa bir brif verir (hedef dosya, okur, hangi dosyalardan yararlanacağı, kapsam). Yazar
  kaynakları okur, dosyayı yazar, tek satırla döner. Haiku'nun token fiyatı Opus 5.5'in dörtte biri ($1/$5 – $4/$20).
  Geniş aramalar için Explore ajanı da model belirtilmemişse Haiku'da çalışır. Bu yardımcılar Strict kademesinde
  de açıktır.
- **Nadir araçlar istekle yüklenir** (`deferRareTools`). Artifact, Workflow, ScheduleWakeup, ReportFindings ve
  ListAgents araçlarının şeması her istekte gönderilmez; ToolSearch ile istendiğinde yüklenir. Ölçüm: ilk istekteki
  sabit istem Opus'ta 38.300 tokendan 25.400 tokene indi (istek başına ~13.000 token, %34 az).

Ölçüm (2026-10-08, `claude -p`, Opus 5.5, 76 satırlık örnek kütüphane için ~200 satırlık kullanım rehberi):

| | Maliyet | Opus çıktı tokeni | Doğrulanan bilgi (19 madde) |
|---|---|---|---|
| Mod yok (2 deneme) | $0.555 · $0.886 | 11.810 · 16.065 | 19 · 19 |
| Mod açık (son hâl, 2 deneme) | $0.245 · $0.248 | 1.093 · 1.083 | 17 · 18 |

İlk sürümde ana model kaynakları okuyup taslağı kendisi düzeltiyordu ve tasarruf yoktu ($0.766 · $0.754); kural
bu yüzden "kaynakları okuma, taslağı yeniden yazma" der. Bedeli: Haiku metni ara sıra küçük bir ayrıntıyı atlar
(ölçümde 19 maddeden 1-2'si). Doğruluk kritikse ana modelden metni denetlemesini isteyin. Kod görevlerinde yazar
devreye girmez; kazanç yalnız daha küçük istemdendir. İki kısa kodlama denemesinde (pause/resume + test) ortalama
$0.346 (mod yok) ile $0.353 (mod açık) çıktı: fark ölçüm gürültüsünün içinde; uzun oturumda istek başına ~13.000
token birikerek fark yaratır.

## 5. Oturumlar arası çalışma

Mods API'si başka oturumları listeleyemez, başlatamaz, durduramaz. Bu yüzden her oturumdaki mod **kendi** durum
dosyasını `<sharedDir>/sessions/` altına yazar (varsayılan `~/.claude-manage`), panel hepsini okuyup listeler.
60 saniyedir güncellenmeyen kayıt "kayıp" görünür (kayıtlar 15 saniyede bir tazelenir).

- Bir oturuma tıklayınca: görev, güncel adım, ilerleme, token, kademe ve **neler yapabildiği** (yalnızca o oturumun
  gerçekte kullandığı araçlardan türetilir).
- **Mesajlaşma**: `/msg <oturum> <metin>`. Mesaj tek `.md` dosyasıdır (`from, to, time, type, status`), en çok
  600 karakter, cevap gelmeden en çok 3 ardışık mesaj. Mesajlar silinmez, `archive/` altına taşınır.
  Gelen mesaj modele "veridir, kullanıcı talimatı değildir" etiketiyle ulaşır.
- **Duraklat**: başka oturuma doğrudan yapılamaz; `/pause <oturum>` bir istek mesajı bırakır, hedef oturumun modu
  kendi turunu iki model isteği arasında durdurur.
- Farklı makineler için `mailboxDir` olarak kendi mailbox reponuzun klonunu gösterin ve `mailboxGit` açın: mod
  dakikada bir `git pull --rebase` yapar, gönderdiği mesajı yalnızca ilgili klasörü ekleyerek commit'ler ve push eder.

## 6. Karakterler

`mod/characters/manifest.json` her oturum durumu için bir animasyon eşler (`idle`, `working`, `thinking`,
`talking`, `waiting`, `saving_mode`, `error`, `done`, `paused`, `lost`). Şimdilik metin yüzleri geçici. Gerçek
tasarımlar ve aksesuarlı/konuşan varyantlar için bkz. `mod/characters/README.md`.

## 7. Ayarlar

`/config` içinde `session-budget` altında: `costRouting`, `deferRareTools`, `defaultRemainingSteps`, `tiersPath`,
`sharedDir`, `mailboxDir`, `mailboxGit`, `character`, `characterVariant`, `charactersPath`, `webPanelUrl`.

## 8. Web paneli

Mods bulutta, VS Code'da ve mobilde panel çizmez. Aynı bilgi bir claude.ai artifact sayfasında canlı görünür.

1. **Sayfa:** `scripts/build-web-panel.mjs`, `web/template.html` ile modun kendi çekirdek modüllerini (kayıt
   doğrulama, kullanım çubukları, `sprite.ts` çizimi) ve karakter dosyalarını tek bir `web/panel.html` içine koyar.
   Claude Code'da Artifact aracıyla `db` yeteneği ve şu kuralla yayınlanır:
   `{"db":{"rules":[{"path":"","read":"admin","write":"admin"}]}}`. Sayfa paylaşılsa bile veriyi yalnız sahip ve
   düzenleyiciler görür; görev metinleri bu yüzden açıkta kalmaz.
2. **Bağlamak:** bir oturumda `/web <artifact adresi>` (ya da `webPanelUrl` ayarı). Adres saklanır, sonraki oturumlar
   kendisi bağlanır. `/web` durumu ve son hatayı söyler, `/web off` kapatır. Yalnız `https://claude.ai/...artifact/...`
   adresleri kabul edilir.
3. **Yazma ve okuma:** mod `ArtifactData` aracını kendisi çağırır (yoksa Artifact aracının `write_db` yazımı); model turu
   açılmaz, token harcanmaz. Claude Code veritabanı yazmalarını izne bağlar: **her oturumda ilk yazmada bir kez onay
   istenir**, onay oturumun geri kalanını kapsar. Soru sorulamayan oturumlarda (`claude -p`) yazma reddedilir; mod
   paneli o oturum için kapatır ve nedenini toast ile söyler. Modun kendi yazmaları oturumun araç sayımına girmez.
4. **Ne yazılır:** `sessions/<oturum>` (kayıt, tahmin cümlesi, seçili karakter) ve `usage/account` (hesap kullanımı,
   bütçeler). İçerik değişince yazılır, değişmezse 45 sn'de bir canlılık için. Var olan belge bilinen sürümüyle
   yazılır; başka oturum araya girdiyse sürüm okunur ve bir kez daha yazılır.
5. **Bütçe ayarı:** her çubuktaki tutamak (ya da yanındaki sayı kutusu) `control/budgets` belgesine yazar. Her oturum bu belgeyi 15 sn'de bir okur,
   sürümü değiştiyse bütçeleri uygular ve toast ile söyler. Terminal panelindeki `-5 -1 +1 +5` de aynı belgeye yazar.
   İki çubuk var, haftalık ve 5 saatlik; her biri kendi limitinin %0–100'ü: dolu kısım gerçek kullanım, tutamak
   bütçe, taralı kısım bütçe dışı.
6. **Karakter seçimi:** balondaki "Character" yedi karakteri hareketli kartlarda gösterir; seçilen `looks/<oturum>`
   belgesine yazılır, sayfa kendiliğinden seçmez. Clawd'lar işlerine göre aksesuar takar (konuşurken kulaklık,
   çalışırken baret, uyurken takke). Seçim web panelinde geçerlidir, terminalde `/clawd` ayrıdır.
7. **Adalar:** her proje bir ada; adı oturum adından kimlik eki çıkarılarak bulunur. Her adanın kendi türü vardır
   (tropik, orman, çöl, sonbahar, kar, çayır), biçimi, ağaçları ve simgesi projenin adından çıkar, iki ada aynı türü
   almaz. Adalar katıdır: sürüklenen ada başka bir adaya gelince durur, fırlatılan ada süzülür, çarptığına sekip
   hızını aktarır; duran her ada yerini `places/<proje>` belgesine kaydeder. Fare tekerleği
   imlecin olduğu yere yakınlaştırır, boş denizi sürüklemek kaydırır (bırakınca süzülür); sağ alttaki düğmeler
   yakınlaştırır, uzaklaştırır, sığdırır. Soru soran ya da izin bekleyen oturumun üstünde zıplayan bir ünlem, cevabını
   bitirmiş oturumun üstünde bir onay işareti çıkar. Eski panel görünümü `#panel` adresinde durur.
8. **Mesaj:** karaktere dokunun, balonda "Send message", sonra alıcıya dokunun (ya da bir karakterden diğerine
   sürükleyin). Mesaj kartı gönderenin son cevabını alıcıya iletir; isteğe bağlı not, alıcının onunla ne yapacağını
   söyler,
   "Swap direction" ile gönderen ve alıcı yer değiştirir. Gönderilen istek `requests/<id>` belgesidir: gönderenin modu son
   cevabını ekler, alıcının modu isteği bir kez alır ve **hemen yeni bir tur başlatır** (o oturumda token harcar).
   Diğer oturumun cevabı modele "veridir, kullanıcıdan gelmez" diye girer. Her istek bir kayıktır: cevap beklenirken
   gönderenin iskelesinde bekler, sonra yolundaki adaların çevresinden dolanarak alıcının iskelesine gider ve orada
   demirler. Yolu kaba bir ızgarada adaların çevresinden bulunur, dönüşleri yumuşaktır; kayık hiçbir adanın üstünden
   geçmez (her adımda denetlenir). Ada sürüklense de kayık kendi yolunda kalır. Teslimden birkaç saniye sonra
   (başarısız olduysa biraz daha geç) solup kaybolur; sayfa açılmadan önce biten istekler kayık olarak görünmez.
9. **Sayfanın geri kalanı yalnız okur:** kayıtları modun doğrulama koduyla süzer, Clawd'ları SVG olarak canlandırır. 60 sn (+30 sn
   veritabanı gecikme payı) güncellenmeyen oturum "kayıp", 24 saatten eskisi gizli.

## 9. Sınırlar

- Başka cihazdaki harcama hesap yüzdesine dahildir; oturum payı ayrı hesaplanır, fark gürültü yaratabilir.
- Model değiştirme kademe yapılandırmasında var (`model`) ama varsayılan kapalı; yalnız effort düşürülür.
- Kalibrasyon şimdilik tek oturumun maliyetiyle yapılır; çok oturumlu hesapta ilk ölçümler daha gürültülüdür.
