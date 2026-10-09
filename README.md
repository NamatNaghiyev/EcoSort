# EcoSort + ReflexGrip

Azərbaycan dilində tullantı təsnifatı və çeşidləmə demosu. Mövcud MobileNetV2 beş sinfi təsnif edir: `glass`, `metal`, `organic`, `paper`, `plastic`.

## Başlatmaq

Python 3.12:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

`http://localhost:5000` ünvanını açın. Model çəkiləri `models/best_weights.weights.h5`, sinif sırası `models/class_names.json` faylındadır. `predict.py` CLI-si web API ilə eyni inference funksiyasından istifadə edir; preprocessing model daxilində bir dəfə edilir.

## İş sahələri

- **Yeni analiz:** JPG/PNG/WebP, maksimum 3.5 MB. İlk üç model ehtimalı və çeşidləmə tövsiyəsi.
- **Tarixçə:** son 50 analiz brauzerdə saxlanır. Kateqoriyanı seçib «Təsdiqlə» ilə operator qərarı yazın. İlkin kateqoriya, etibar və ehtimallar saxlanır. JSON və CSV ixracı gələcək etiket auditi üçün istifadə edilə bilər; düzəliş modelə avtomatik təlim vermir.
- **ReflexGrip:** real nəticəni «Qərar və ReflexGrip» ilə götürün və ya açıq işarələnmiş demo materialı seçin. Kamera, konveyer, iki barmaqla tutma, sürüşmə/regrasp və buraxma animasiyası. Üzvi tullantı düz axır. Metal üçün ferromaqnitlik ayrıca operator təsdiqi tələb edir; alüminium maqnitə yönəlmir.
- **Video / obyektlər:** video faylından seçilmiş kadrları və ya canlı kameradan kadrları ardıcıl analiz edir. Video yerli cihazda qalır. Çoxobyektli şəkildə bölgələri əl ilə çəkin və ya klaviatura üçün hazır yarım-şəkil seçimlərindən istifadə edin. Maksimum 10 bölgə. **Avtomatik obyekt detektoru deyil.** Bounding box etiketləri və detektor çəkiləri olmadan bunun adı detection ola bilməz.
- **Test hesabatı:** real çəkilər və test şəkilləri üzrə accuracy, macro F1, sinif precision/recall/F1, confusion matrix və səhv nümunələri. Dublikatlar və qismən etiket auditi açıq göstərilir; real konveyer şəraitində ayrıca sınaq lazımdır.
- **Karbon təsiri:** çəki operator tərəfindən daxil edilir. EPA WARM v16 material alt növlərinin təkrar emal kreditləri, qəbul payı və əlavə əməliyyat emissiyaları ilə şəffaf hesablanır. Bu, ABŞ modelindən ilkin xammal istehsalının əvəzlənməsi ssenarisidir, yerli poliqon qənaəti deyil. Üzvi üçün yerli baza və layihə əmsallarını daxil edin.

## Demo siyasəti və fizika

Avtomatik demo marşrutu üçün etibar ≥75% və ilk iki nəticə fərqi ≥15 faiz bəndi tələb olunur. Bunlar **kalibrasiya olunmamış demo hədləridir**, nəticənin doğruluq zəmanəti deyil. Operator təsdiqi ayrıca mənbə kimi göstərilir. Naməlum material əl ilə yoxlamaya gedir.

İki qarşılıqlı barmaq üçün hər barmağın normal qüvvəsi `N = m*g*S/(2*mu)`, təxmini qol momenti `tau = m*g*l*S`. Konveyerdə 1 m məsafəyə çatma vaxtı `t = 1/v`. Sürüşmə ssenarisində sürtünmə 40% azalır və qüvvə yenidən hesablanır; limit aşılırsa animasiya dayanır. **Sensor bağlantısı, real robot əmri, dinamik yük və əzilmə modeli yoxdur.** Animasiya sürətləndirilib.

## Daha etibarlı kamera analizi

"Robot & kamera" bölməsində "Kadrı analiz et" düyməsi ardıcıl **üç kadrı**
(qısa fasilə ilə) `POST /api/predict-burst` ünvanına göndərir. Server hamısını
bir model çağırışında analiz edir. Üç kadrın proqnozu fərqli olduqda,
kadrların hər hansı birinin etibarı 55%-dən aşağı olduqda, orta etibar
75%-dən aşağı olduqda və ya ilk iki sinfin fərqi 15 faiz bəndindən az olduqda
**operator yoxlaması** tələb olunur. Bu sərhədlər eksperimental, kalibrasiya
olunmamış qaydalardır; kameraya aid doğruluq artımı hələ ölçülməyib.
Yaxın zamanlı kadrlar bir-birindən asılıdır və hamısı birlikdə səhv edə bilər.
Video tam şəkildə serverə göndərilmir və fiziki robot əmri verilmir.
Tək-şəkil API-si əvvəlki kimi `POST /api/predict` ünvanında qalır.

## Təmiz datasetlə namizəd model təlimi (istehsal modelinə toxunmur)

Təlimə başlamazdan əvvəl **etiket konflikti və identik dublikatları** audit edin:

```bash
python tools/prepare_clean_dataset.py --source raw_dataset --output dataset_clean
# reports/clean_split_plan.json sənədində konfliktləri yoxlayın.
python tools/prepare_clean_dataset.py --source raw_dataset --output dataset_clean --write
```

Alət hər sinfi `train / val / test` olaraq ayrı bölür, identik şəkilləri
yalnız bir dəfə istifadə edir, müxtəlif etiketli eyni şəkilləri **quarantinə**
alır; orijinal fayllara toxunmur. `--write` yeni `dataset_clean`
qovluğunu yalnız mövcud olmadıqda yaradır. Təhlükəsizlik üçün təkrar
işə salmada yazmanı rədd edir. Yaxın dublikatlar və eyni kamera sessiyasından
olan kadrlar hələ də əl ilə qruplaşdırılmalıdır.

Namizəd modeli ayrıca qovluqda təlim edin:

```bash
python -m pip install -r requirements-training.txt
# Linux/macOS:
ECOSORT_DATASET_ROOT=dataset_clean python train.py
# Windows PowerShell:
# $env:ECOSORT_DATASET_ROOT="dataset_clean"; python train.py
```

Yeni çəkilər `models/candidates/` altında saxlanılır; aktiv
`models/best_weights.weights.h5` avtomatik dəyişmir. Namizəd modeli
**əvvəllər görülməmiş real kamera sessiyaları** ilə ayrıca qiymətləndirin:

```bash
# Linux/macOS:
ECOSORT_WEIGHTS_PATH=models/candidates/best_weights.weights.h5 \
ECOSORT_CLASS_NAMES_PATH=models/candidates/class_names.json \
python tools/evaluate_model.py --dataset camera_holdout/test --output reports/camera_candidate.json
```

PowerShell-də bu iki dəyişəni `$env:ECOSORT_WEIGHTS_PATH` və
`$env:ECOSORT_CLASS_NAMES_PATH` şəklində təyin edin.
Eyni holdout setində aktiv modelin nəticəsi ilə müqayisə edin. Yalnız
qiymətləndirmədə aydın üstünlük olarsa istehsal modelini **ayrıca**
yeniləyin. Bu repoda yeni model çəkiləri hələ öyrədilməyib.

## Kamera və şəkillər: məlum qeyri-tullantı obyektlərinin yoxlanması

Telefon, kompüter, insan, kitab və digər bəzi obyektləri ekranda yanlışlıqla
**kağız/karton** kimi təsdiqləməmək üçün `static/camera-guard.js` ayrıca
**COCO-SSD (TensorFlow.js)** obyekt detektoru yükləyir. Bu YOLO deyil;
brauzerdə işləyən öncədən təlim edilmiş ümumi obyekt detektorudur.

- **Robot & kamera:** İstəyə görə `Obyekti seç` düyməsi və görüntü üstündə
  düzbucaqlı seçim. Detektor `cell phone`, `person`, `laptop`, `tv`,
  `keyboard` və başqa tanıdığı qeyri-tullantı obyektlərini təsbit edərsə
  operator yoxlaması göstərilir, material təsnifatı göndərilmir.
- **Bir obyekt aşkarlanarsa:** Detektorun `bottle`, `cup`, `wine glass`
  və seçilmiş üzvi məhsul növləri üçün verdiyi `bbox` əsasında kadr
  kəsilir; 3 kadr ərzində material müqayisə olunur. Material növü ilə
  obyekt etiketi ziddiyyət təşkil edirsə yalnız yoxlama göstərilir.
- **Məlum obyekt tapılmırsa:** Təsnifatı avtomatik qəbul etmək qadağandır.
  Kamera bölməsində model təklifi göstərilə bilər, lakin nəticə
  `unknown`/operator yoxlaması olaraq saxlanılır.
- **Yeni analiz (fayl yükləmə):** Eyni obyekt yoxlamasından keçir.
  Detektor məlum qeyri-tullantını gördükdə API-yə təsnifat üçün göndərilmir.
  Məlum tullantı obyektinin yalnız ROI sahəsi modelə verilir.
  Naməlum və ya ziddiyyətli nəticə `unknown` olaraq göstərilir.
- **Fail-closed:** Detektor üçün skript və model yüklənməsə, kameranın və
  fayl yükləmənin avtomatik təsnifatı bloklanır, istifadəçiyə
  izah göstərilir. Xarici CDN bağlantısı və ilkin model yüklənməsi tələb
  olunur; görüntülər brauzerdə analiz edilsə də JS kitabxanası və
  çəkilər üçün şəbəkə sorğuları edilir.
- **Vacib məhdudiyyət:** COCO-SSD bütün mümkün qeyri-tullantı obyektlərini
  tanımır, uğurlu deteksiya materialı təsdiqləmir, telefonlar bəzən
  detektor tərəfindən buraxıla bilər. Bu, kalibrasiya edilmiş ümumi OOD
  modeli deyil. Həqiqi OOD aşkarlaması, YOLO tullantı deteksiyası və
  robot koordinatları üçün əlavə etiketli dataset və ayrı sınaqlar lazımdır.

Detektor siyasətinin lokal Node testləri:

```bash
node --test tests/camera-guard.test.cjs
```

## Audit və qiymətləndirmə

Bu komandalar şəkilləri silmir və kateqoriyaları dəyişmir:

```bash
python tools/audit_dataset.py dataset --output reports/dataset_audit.json
python tools/evaluate_model.py --dataset dataset/test --output reports/evaluation.json
```

Git tree manifesti ilə tam məzmun-hash auditi də mümkündür: `--manifest manifest.json`. Fayl adı yalnız xəbərdarlıqdır; şüşə şəkillərinin bir hissəsi yanıltıcı `papier_carton` adını daşıyır. Bütün şəkillər insan tərəfindən vizual audit olunmayıb. Splitlər arası eyni məzmun nəticəni şişirdə bilər; test səhifəsində göstərilir. Dublikatları train/val/test bölgüsündən **əvvəl** qruplaşdırıb insan auditi ilə yenidən bölmək növbəti model təlimi üçün vacibdir.

EPA mənbə: https://www.epa.gov/system/files/documents/2024-01/warm_management_practices_v16_dec.pdf (Exhibit 2-2). MTCO₂e/short ton-dan kg CO₂e/kg-a çevirmə: `factor * 1000 / 907.18474`. Qəbul payı mənbənin öz emal itkisinə əlavə olan rədd payıdır; əlavə emissiyaları iki dəfə saymayın.

## Yoxlama

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
node --test tests/suite.test.cjs
python build_static.py
```

API: `GET /api/health`, `POST /api/predict` (`image` multipart), `GET /api/quality`. Inference ilk sorğuda modeli yükləyir; soyuq başlanğıc normal sorğudan uzun ola bilər. Brauzer tarixçəsi və operator düzəlişləri cihazlar arasında sinxronlaşmır.

## Canlı robot kamerası və Azərbaycan xəritəsi

Robot kamera iş sahəsi kadrı server modelinə göndərir, təhlükəsiz marşrut planını göstərir; fiziki aparat komandası göndərilmir. Azərbaycan xəritəsi OpenStreetMap/Overpass qeydlərini küçə səviyyəsində yükləyir. Yerli pilot nöqtələri yalnız brauzerdə saxlanır və təsdiqlənmiş sayılmır.

`GET /api/robot/status` simulyasiya vəziyyətini; `GET /api/containers?bbox=south,west,north,east` kiçik ərazi üçün OSM qeydlərini qaytarır. Mənbə əlçatmaz olduqda saxta nöqtə göstərilmir.
