# EcoSort — 9 oktyabr dataset əlavəsi

Bu fayl əlavə edilən ZIP arxivlərinin sinif xəritəsini göstərir. İndiki aktiv model dəyişdirilmir.

| Arxiv | EcoSort sinfi | Yeni arxivdəki şəkil |
|---|---|---:|
| glass.zip | glass | 407 |
| metal.zip | metal | 790 |
| organics.zip | organic | 397 |
| paper.zip | paper | 562 (kağız + karton) |
| plactic.zip | plastic | 322 |

**Cəmi: 2 478 şəkil.** PIL ilə şəkillərin açılması və minimum ölçü yoxlaması uğurludur. Arxivlər arasında bayt-səviyyəsində eyni şəkil tapılmayıb. Bu, insan tərəfindən tam etiket auditi demək deyil.

Əvvəlki GitHub datasetində 5 971 şəkil var. Məqsəd onları və `models/class_names.json` sırasını olduğu kimi qorumaqdır:

`["glass", "metal", "organic", "paper", "plastic"]`

## Təhlükəsiz əlavə etmə

1. Original beş ZIP faylını layihənin kökündə `incoming_zips/` qovluğuna yerləşdir.
2. Quru yoxlama: `python tools/import_hackathon_datasets.py --source incoming_zips`
3. Hesabatı yoxla: `reports/hackathon_dataset_import.json`.
4. Yeni şəkilləri əlavə et: `python tools/import_hackathon_datasets.py --source incoming_zips --apply`.

Skript yalnız `dataset/train/<existing_class>/ecosort_add_...` adlı **yeni** fayllar yaradır; köhnə train/val/test şəkillərinə toxunmur. Bütün siniflər üçün mövcud məzmunun SHA-256 həşləri yoxlanır; eyni məzmun və ziddiyyətli etiketlər yenidən daxil edilmir. Təkrar işlədilməsi təhlükəsizdir.

Yeni şəkilləri GitHub-a yükləmək və aktiv modeli yenidən öyrətmək **ayrı addımlardır** və bu sənədlə avtomatik edilməyib. Yaxın dublikatlar, arxiv etiketlərinin səhvləri və real kamera mühitində ayrıca holdout testi hələ yoxlanmalıdır.

**Diqqət:** `train.py` varsayılan `dataset` qovluğunda işlədiləndə aktiv çəkilərin üstünə yaza bilər. Yeni model üçün ayrıca namizəd qovluğu təyin edin: `ECOSORT_TRAIN_OUTPUT_DIR=models/candidates`.
