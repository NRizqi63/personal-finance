# Aset logo metode pembayaran

## Status: SEMUA BERKAS DI SINI ADALAH PLACEHOLDER

Tidak ada satu pun logo resmi di folder ini. Kesebelas berkas SVG dibuat
sendiri untuk proyek ini dan **tidak menyalin, meniru, atau memakai aset merek
mana pun**. Bentuknya sengaja netral: kotak membulat + monogram (atau gambar
uang kertas untuk Cash).

Alasannya: logo resmi BCA, BRI, Mandiri, BNI, GoPay, DANA, OVO, ShopeePay, dan
LinkAja adalah merek dagang. Penggunaannya butuh izin/ketentuan brand guideline
masing-masing penerbit, dan tidak ada sumber yang jelas lisensinya yang bisa
dipakai di sini. Daripada mengarang bahwa gambar ini logo resmi, dipakai
placeholder yang jujur.

Setiap berkas menandai dirinya sendiri di tiga tempat, supaya tidak ada yang
salah sangka dan supaya bisa diperiksa otomatis:

1. komentar XML di dalam berkas,
2. elemen `<title>` — "… (placeholder, bukan logo resmi)",
3. atribut `data-placeholder="true"` pada elemen `<svg>` (dipakai test).

## Cara berkas ini dibangkitkan

Satu template, tanpa nilai yang dipilih manual per merek:

- kanvas `viewBox="0 0 24 24"`, kotak membulat `rx="6"`;
- warna dihitung mekanis dari urutan metode di `PAYMENT_METHODS`:
  `hue = (150 + i * 360/11) mod 360`, saturasi 58%, lalu lightness diturunkan
  2% dari 42% sampai kontras terhadap teks putih mencapai **≥ 4.5:1** (WCAG AA);
- monogram putih, `font-weight: 700`, memakai font sistem (tidak ada font yang
  diunduh).

## Aturan

- Nama berkas **wajib** `<key>.svg`, sama dengan `key` di `PAYMENT_METHODS`
  (`frontend/js/core.js`). Path-nya dibentuk dari `PAYMENT_LOGO_DIR`.
- Hanya berkas lokal. Tidak ada URL eksternal, tidak ada CDN, tidak ada font
  eksternal di dalam SVG.
- Key legacy (`mbanking`, `debit`, `kredit`, `ewallet`, `lainnya`) sengaja tidak
  punya berkas: key generik tidak mewakili satu penyedia, jadi tampilannya tetap
  emoji.

## Mengganti dengan logo resmi nanti

Timpa berkas `<key>.svg` dengan aset resmi yang **jelas izin/lisensinya**, lalu
hapus penanda placeholder (komentar, `<title>`, `data-placeholder`). Tidak ada
kode yang perlu diubah — renderer membaca path dari metadata. Test
`paymentmethodtest` memeriksa penanda tersebut, jadi sesuaikan juga
assertion-nya saat status berkas benar-benar berubah.

## Cadangan bila berkas gagal dimuat

`setupTransactionModal()` di `frontend/js/transactions-shared.js` memasang
`<img>` ke slot logo dan mengembalikan emoji metode bila berkas gagal dimuat,
jadi tombol tidak pernah tampil kosong.
