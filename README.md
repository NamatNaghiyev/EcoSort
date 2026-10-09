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
