# Regression tests — Personal Finance

Kumpulan harness browser untuk aplikasi statis di `frontend/`. Semuanya berupa
halaman HTML biasa: membuka halaman produk di dalam `<iframe>`, menirukan
interaksi pengguna, lalu mencetak baris `PASS` / `FAIL` ke `<pre id="r">`.

Tidak ada framework, tidak ada package manager, tidak ada dependency yang perlu
diunduh — sama seperti aplikasinya sendiri.

## Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Chrome / Chromium | versi apa pun yang mendukung `--headless=new` (Chrome 112+). Edge Chromium juga bisa. |
| Shell | `bash` + `awk` + `sed` (Git Bash di Windows, bawaan di macOS/Linux) |
| Repo lengkap | harness membaca `frontend/` lewat path relatif — jalankan dari salinan repo, bukan file lepas |

Kalau Chrome tidak terdeteksi otomatis:

```bash
CHROME="/path/ke/chrome" ./tests/scripts/run-tests.sh
```

Di container Linux biasanya perlu:

```bash
CHROME_FLAGS="--no-sandbox" ./tests/scripts/run-tests.sh
```

## Cara menjalankan

```bash
./tests/scripts/run-tests.sh              # semua: 39 suite + console + overflow (~10-15 menit)
./tests/scripts/run-tests.sh suites       # hanya 39 suite
./tests/scripts/run-tests.sh console      # 6 halaman x 4 lebar, error konsol harus 0
./tests/scripts/run-tests.sh overflow     # 6 halaman x 6 lebar, tidak boleh scroll horizontal
./tests/scripts/run-tests.sh modalracetest jssettings    # suite tertentu saja
```

Exit code `0` = tidak ada kegagalan baru, `1` = ada yang gagal, `2` = Chrome tidak ditemukan.

Satu harness juga bisa dibuka manual di browser (klik dua kali
`tests/harness/<nama>.html`) — hasilnya tampil sebagai teks di halaman. Untuk
harness berparameter, tambahkan query: `consolecheck.html?p=budget.html&w=390`.

> Chrome memblokir `fetch()` antar file lokal tanpa flag. Runner sudah memakai
> `--allow-file-access-from-files`; saat membuka manual, sebagian suite
> (`js*`, `cssdiff`, yang membaca file sumber) perlu flag itu juga.

## Isi folder

```text
tests/
├── README.md
├── fixtures/
│   ├── legacy/          app.js & style.css versi pra-refactor (BEKU — jangan diedit)
│   └── pages/           halaman referensi: *_legacy.html, app_ref.html, jsf_page.html
├── harness/             39 suite + 2 harness berparameter (consolecheck, harness)
└── scripts/
    └── run-tests.sh     satu-satunya runner
```

`fixtures/legacy/` adalah salinan beku `js/app.js` dan `css/style.css` sebelum
refactor. Halaman di `fixtures/pages/` memuat file beku itu sehingga suite
kesetaraan (`js*`, `cssdiff`) bisa membuktikan bahwa hasil pemecahan file
menghasilkan DOM dan computed style yang sama persis dengan versi lama. Fixture
ini sengaja tidak pernah diperbarui — begitu diubah, nilai pembandingnya hilang.

## Urutan test yang disarankan

Runner memakai urutan ini; kalau menjalankan manual, ikuti urutan yang sama
karena yang di atas memberi diagnosis paling cepat saat ada yang rusak.

1. **Fondasi & kesetaraan refactor** — `jsfoundation`, `jsdashboard`, `jsgoals`,
   `jsanalytics`, `jsbudget`, `jstransactions`, `jssettings`, `cssdiff`.
   Membuktikan file hasil pemecahan == `app.js`/`style.css` lama (fungsi
   byte-per-byte, DOM, localStorage, fokus, computed style).
2. **Modal** — `modalracetest` (siklus hidup: timer hide, frame `.is-open`,
   fokus, scroll lock, buka-ulang < durasi animasi), `modaltest`, dan
   `modallifecycletest` (M2): kontrak `createModalController`
   (`duration`, `onOpenFrame`, `onClose` untuk kelima jalur tutup) plus
   matriks 10 modal x jalur tutup — tombol X, Batal/CTA, klik latar, Escape,
   `close()` programatik — berikut focus restore dan kunci scroll.
3. **Data & penyimpanan** — `m1datatest`: Target Keuangan di
   backup/import/reset, rollback empat key, kontrak boolean `saveTransactions`/
   `saveBudget`/`saveSettings`/`saveGoals`, dan perilaku setiap pemanggilnya
   saat localStorage menolak menulis. `paymentmethodtest` menguji fondasi data
   Metode Pembayaran (konstanta + `getPaymentLabel`/`normalizePaymentMethod`)
   sekaligus memagari tahap yang belum dikerjakan.
4. **Per fitur** — goals (`goalstest`, `goals2test`, `goals3atest`,
   `goals3btest`, `goals4test`), analytics (`analyticsperiodtest`,
   `analyticstest`, `charttest`), budget (`budgettest`), transaksi & dashboard
   (`calendartest`, `scrolltest`, `fixtest`, `functest`, `uxflowtest`,
   `v1fixtest`, `v21test`, `v22test`, `finalaudit`).
5. **Settings & data** — `settingstest`, `settings2test`, `settings3test`,
   `settings3b0test`, `settings3b1test`, `settings3b2test`, `settings3c1test`,
   `settingsuitest`. Mencakup export, validasi import, snapshot/rollback, reset.
6. **Console** — tidak boleh ada `error`, `unhandledrejection`, `console.error`,
   atau `console.warn` di 6 halaman × 4 lebar.
7. **Overflow** — `scrollWidth` halaman harus sama dengan viewport di 6 halaman
   × 6 lebar (320–430 px).

## Membaca hasil

```text
jssettings             PASS=136  FAIL=0
functest               PASS=59   FAIL=1   (1 known artifact)
    KNOWN FAIL add modal opens
```

- Setiap baris `PASS`/`FAIL` = satu assertion. Nama assertion memuat nomor
  bagian (`8a.`, `1b2.`) supaya mudah dicari di dalam file harness.
- Baris `FAIL` mencetak nilai yang terbaca di dalam kurung — biasanya cukup
  untuk tahu penyebabnya tanpa membuka debugger.
- `EXCEPTION` berarti harness berhenti di tengah jalan: assertion setelah titik
  itu tidak dijalankan, jadi perbaiki ini lebih dulu sebelum melihat FAIL lain.
- Baris `KNOWN` = artefak yang sudah dikenali (lihat bawah), tidak dihitung
  sebagai kegagalan dan tidak membuat exit code merah.
- Ringkasan terakhir: `TOTAL PASS=… FAIL(baru)=… known artifact=…`.

Angka acuan saat milestone Metode Pembayaran P-1 (Chrome 141, Windows): 39 suite
hijau, `functest` 59/1 (artefak di bawah), console 24/24 bersih, overflow 36/36
bersih.

## Known artifact: `functest` 59 PASS / 1 FAIL

Assertion `add modal opens` memeriksa `overlay.classList.contains("is-open")`.
Kelas itu dipasang lewat `requestAnimationFrame` bersarang (dua frame) di
`frontend/js/transactions-shared.js` — pola yang disengaja supaya animasi
transisi tidak terlewat di Safari/iOS.

Di mode headless, iframe yang tidak terlihat sering tidak pernah menerima frame,
sehingga callback rAF tidak dijalankan dan kelas belum terpasang saat diperiksa.
Di browser sungguhan assertion ini lulus. Bukti bahwa ini artefak lingkungan dan
bukan regresi: hasilnya identik (59/1) ketika dijalankan pada commit sebelum dan
sesudah perbaikan modal.

Alasan yang sama dipakai `modallifecycletest`: kontrak controller (durasi,
urutan frame) diuji lewat antrean palsu, sedangkan matriks jalur tutup diuji
dengan waktu nyata memakai `hidden`/scroll lock sebagai penanda.

Karena alasan itu, `modalracetest` tidak menjadikan `.is-open` sebagai syarat
lulus di lapisan waktu-nyata; bagian A-nya mengganti `setTimeout`/
`requestAnimationFrame` di dalam iframe dengan antrean palsu yang di-flush
manual, sehingga urutan "timer lama vs modal yang baru dibuka" teruji
deterministik.

Catatan lain yang bukan kegagalan:

- **`SMALL-TAP button.bar-col`** pada overflow halaman Analisis: 30 batang chart
  harian memang lebih sempit dari 36 px. Kondisi lama, bukan hasil refactor.
- **`fixtest` 14 atau 15 PASS**: satu assertion hanya muncul ketika tanggal lokal
  berbeda dari tanggal UTC (jendela 00:00–07:00 WIB).
- **`cssdiff`** sesekali melaporkan beda `opacity`/posisi pada panel notifikasi
  `@320` bila sampel diambil di tengah animasi dropdown. Jalankan ulang; kalau
  berulang terus, itu regresi sungguhan.

## Aturan saat menambah / mengubah test

- Harness tidak boleh menulis ke `frontend/` — semua hanya membaca, dan setiap
  suite membersihkan `localStorage`/`sessionStorage` di dalam iframe-nya sendiri.
- Jangan pernah melemahkan assertion supaya hijau. Kalau perilaku produk memang
  sengaja berubah, ubah assertion ke perilaku baru dan patok seketat sebelumnya
  (pola yang dipakai, mis., pada `settings3b1test` bagian `1b`).
- Semua path harus relatif (`../../frontend/…`, `../fixtures/…`). Jangan ada
  path absolut milik satu komputer.
