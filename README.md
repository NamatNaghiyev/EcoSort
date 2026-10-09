# EcoSort — Hackathon robotik çeşidləmə MVP

EcoSort-un əsas məhsulu vebsayt deyil: **kamera + AI model + çeşidləmə mexanizmi**. Sayt hakimlər üçün real kamera kadrı üzərində AI nəticəsini, təhlükəsiz istiqamətləndirmə planını və Azərbaycan üzrə konteyner xəritəsini göstərən idarəetmə panelidir.

## İşləyən imkanlar

- `Robot & kamera`: HTTPS-də brauzer kamerası açılır; istifadəçi **Kadrı analiz et** düyməsi ilə cari kadrı göndərir. Flask API mövcud, öyrədilmiş MobileNetV2 çəkilərini yükləyərək 5 sinif üzrə nəticə qaytarır.
- `/api/predict`: real model etibar göstəricisi, top-3 nəticə və **yalnız simulyasiya** olan `robot_plan` obyektini qaytarır.
- `/api/robot/status`: robot əlaqəsinin quraşdırılmadığını açıq bildirir.
- `Azərbaycan xəritəsi`: Leaflet + OpenStreetMap xəritə fonu və kiçik seçilmiş sahə üzrə Overpass API-dən `amenity=waste_basket`, `waste_disposal`, `recycling` qeydləri. Tam ölkə məlumat bazası deyil.
- `Pilot nöqtəsi qeyd et`: könüllünün yoxlanmamış qeydi, yalnız lokal brauzer yaddaşında; OSM qeydlərindən ayrı rəngdə.
- Köhnə şəkil analizi, tarixçə və lokal statistika qorunub.

## MVP axını

```text
Camera (live video, browser) ──[single JPEG frame on click]──▶ Flask /api/predict
                                                            │
                                           MobileNetV2 224×224 classifier
                                                            │
                                                  label + confidence
                                                            │
                                                   safe route planner
                                                            │
                                           SIMULATION / no hardware I/O
```

**Məhdudiyyətlər:** Bu model şəkli bir bütöv sinfə ayırır. Obyektin bounding box-u, konveyer koordinatı, obyektin istiqaməti və dərinlik ölçülmür. Hələ fiziki ReflexGrip bağlantısı, maqnit sensoru və konveyer geri əlaqəsi yoxdur. `confidence` kalibrlənmiş səhv ehtimalı deyil.

## Robotik çeşidləmə qaydaları

| Model sinfi | Plan (MVP) | Niyə birbaşa motor əmri deyil? |
| --- | --- | --- |
| plastic, paper | `GRIPPER_COORDINATE_REQUIRED` | Görüntüdə obyekt koordinatı, robot koordinat çevrilməsi və tutuş mövqeyi yoxdur |
| metal | `FERROUS_SENSOR_CHECK` | Maqnit alüminium kimi qeyri-ferromaqnit metalları çəkmir |
| organic | `CONVEYOR_PASS` | Düz axın seçilir, lakin konveyer aktuatoru qoşulmayıb |
| glass | `MANUAL_HANDLING` | Sınma və təhlükəsiz tutuş riski |
| qeyri-müəyyən | `MANUAL_REVIEW` | Confidence < 65% və ya ilk iki sinif fərqi < 12 faiz bəndi |

Plan hər zaman `mode=simulation`, `hardware_command_sent=false`, `localization_available=false` qaytarır.

**Real robot inteqrasiyası üçün ayrıca Raspberry Pi/ROS2 bridge lazımdır:** kadr üzərində obyekt deteksiyası (YOLO və s.), piksel→dünya kalibrasiyası, encoder/timing, metal sensoru, ReflexGrip protokol adapteri, robot iş sahəsinin sərhədləri, operator təsdiqi və fiziki E-STOP. İnternetdə işləyən Flask serverindən birbaşa motor/maqnit aktivləşdirilməməlidir. Robot əmrini yoxlayan lokal servis və fiziki avadanlığın real təhlükəsizlik interlokları olmadan avtomatik aktuasiya açılmamalıdır.

## Azərbaycan xəritəsində məlumat keyfiyyəti

- OSM məkan qeydləri olan mövcud nöqtələr göstərilir. Ərazidə nəticə yoxdursa, **"bu küçədə zibil qutusu yoxdur"** nəticəsi çıxarılmır.
- Məntəqələr yalnız xəritə 12+ səviyyəsində yaxınlaşdırılanda sorğulanır. API tək sorğuda maksimum 0.35° × 0.35° ölçülü bbox və ən çox 350 OSM elementi qaytarır.
- Mənbə qeydlərinin faktiki yerində mövcudluğu və doluluğu təsdiq edilmir; ölkə üzrə tam qeydiyyat göstərilmir.
- İstifadəçi qeydləri `localStorage` ilə yalnız həmin brauzerdə görünür. Bölgələr üzrə kollektiv pilot verilənlər bazası üçün Supabase + moderasiya və geosahə yoxlaması lazımdır.
- Xəritə © OpenStreetMap contributors, tile/server istifadəsi OSM qaydalarına tabedir.

## Lokal işə salmaq

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

`http://localhost:5000` ünvanında açın. Birinci analiz TensorFlow çəkilərinin yüklənməsinə görə daha gec ola bilər. Frontend üçün Leaflet CDN və xəritə fonu internet tələb edir; Overpass müvəqqəti işləməyəndə xəritədə mənbə xətası göstərilir.

## API

- `GET /api/health` — çəki faylının mövcudluğu / model yüklənmə vəziyyəti.
- `POST /api/predict` — `multipart/form-data`, fayl sahəsi `image`, JPG/PNG/WebP/BMP, maksimum Flask request 4 MB.
- `GET /api/robot/status` — safe simulation status.
- `GET /api/containers?bbox=south,west,north,east` — OSM-dən baxılan kiçik sahənin qeydləri.

## Dəqiqlik və sübut

Demo zamanı **real video** ilə **modelin real inferensiyasını** göstərmək mümkündür. Amma bir şəkil üzrə etiketin düzgün çıxması nə ümumi model dəqiqliyini, nə də fiziki robotun tamamlanmasını sübut edir. Fiziki robot nümayişi üçün ayrıca müstəqil sınaq aparılmalıdır.
