/**
 * app.js
 * Logika dashboard Personal Finance (M1 - UI only, data masih statis/mock).
 *
 * Struktur file ini sengaja dipisah per tanggung jawab:
 *  1. MOCK DATA        -> nanti tinggal diganti pemanggilan API/database
 *  2. HELPERS          -> fungsi murni (format angka, waktu, dsb.)
 *  3. RENDER FUNCTIONS -> menulis data ke DOM
 *  4. EVENT HANDLERS   -> interaksi filter & CRUD transaksi (UI only,
 *                         data diubah di financeData lalu dipersist ke
 *                         localStorage; belum ada request ke server)
 *  5. INIT             -> menjalankan semuanya saat halaman dimuat
 */

/* =========================================================
   1. MOCK DATA
   Nantinya bagian ini bisa diganti dengan hasil fetch() ke API,
   tanpa perlu mengubah fungsi render di bawah.
   ========================================================= */
const financeData = {
  // Diisi ulang oleh recalcFromTransactions() dari daftar transaksi nyata
  // setiap kali halaman dibuka & setiap CRUD — nilai di sini hanya titik awal
  // untuk pengguna baru (belum ada transaksi sama sekali).
  summary: {
    balance: 0,
    income: 0,
    expense: 0,
  },

  // Budget bulanan = batas pengeluaran KESELURUHAN (diatur user lewat popup
  // "Atur Budget Bulan Ini" di analytics.html). Terpisah dari budget per
  // kategori di bawah: total budget kategori boleh lebih besar/kecil dari
  // angka ini — UI hanya memberi catatan ringan, tidak mengubah data user.
  // Nilai awal ini dipakai kalau belum ada yang tersimpan di localStorage.
  budget: {
    monthly: 2400000,
  },

  // Konfigurasi budget per kategori (key = value <option> kategori di form
  // transaksi). Emoji adalah identitas kategori (ikon di card kategori &
  // card transaksi). Nama, emoji, dan budget bisa diubah user; kategori
  // bisa ditambah/dihapus (setupBudgetEditor()) — semuanya dipersist ke
  // localStorage bersama budget bulanan (lihat saveBudget()).
  // "Terpakai" TIDAK disimpan di sini — dihitung dari transaksi pengeluaran
  // aktual lewat getCategoryUsed(), supaya dashboard dan analytics.html
  // selalu membaca data yang sama dengan daftar transaksi.
  categories: {
    makanan: { name: "Makanan", emoji: "🍜", budget: 800000 },
    bensin: { name: "Bensin", emoji: "⛽", budget: 300000 },
    belanja: { name: "Belanja", emoji: "🛍️", budget: 500000 },
    tagihan: { name: "Tagihan", emoji: "🧾", budget: 600000 },
    hiburan: { name: "Hiburan", emoji: "🎬", budget: 200000 },
  },

  // Data goal — ditampilkan di popup Financial Check-in (renderCheckin()).
  goal: {
    name: "Dana Darurat",
    current: 6200000,
    target: 10000000,
  },

  // Notifikasi dropdown di header — CONTOH statis, belum ada backend, dan
  // TIDAK ikut perhitungan keuangan mana pun. Teksnya sengaja netral: tidak
  // menyebut nama transaksi, nominal, atau persentase yang seolah-olah data
  // user (daftar ini selalu ditutup penanda "Contoh notifikasi" di
  // renderNotifications()). `read: false` = belum dibaca (dot di lonceng).
  notifications: [
    { id: 1, title: "Contoh notifikasi budget kategori hampir habis.", time: "Hari ini, 09:15", read: false },
    { id: 2, title: "Contoh transaksi berhasil dicatat.", time: "Kemarin, 08:00", read: false },
    { id: 3, title: "Contoh pengingat progress goal tabungan.", time: "Minggu lalu, 18:40", read: true },
  ],

  // Transaksi SELALU berasal dari user: kosong untuk pengguna baru, lalu
  // diisi dari localStorage (loadTransactions()). Sengaja tidak ada contoh
  // di sini — data contoh sempat ikut terhitung ke saldo dan ikut tersimpan
  // permanen saat user menyimpan transaksi pertamanya.
  transactions: [],
};

// Kategori cadangan yang SELALU ada di form transaksi tapi tidak punya
// budget (tidak ikut daftar Per Kategori). Juga dipakai untuk menampilkan
// transaksi lama yang kategorinya sudah dihapus user: datanya tidak
// disentuh (key aslinya tetap tersimpan), hanya labelnya jatuh ke sini.
const FALLBACK_CATEGORY = { key: "lainnya", name: "Lainnya", emoji: "💼" };

/** Data kategori untuk sebuah key — kategori user, atau cadangan "Lainnya". */
function getCategory(key) {
  return financeData.categories[key] || FALLBACK_CATEGORY;
}

function getCategoryLabel(key) {
  return getCategory(key).name;
}

function getCategoryEmoji(key) {
  return getCategory(key).emoji || FALLBACK_CATEGORY.emoji;
}

// Pemasukan memakai satu ikon yang sama apa pun kategorinya.
const INCOME_EMOJI = "💰";

/** Emoji untuk card transaksi: 💰 untuk pemasukan, emoji kategori untuk
 * pengeluaran (kategori yang sudah dihapus jatuh ke emoji "Lainnya"). */
function getTransactionEmoji(tx) {
  return tx.type === "income" ? INCOME_EMOJI : getCategoryEmoji(tx.category);
}

// Pilihan emoji di popup tambah/edit kategori.
const EMOJI_CHOICES = ["🍜", "☕", "⛽", "🚌", "🛍️", "👕", "🧾", "💡", "🏠", "📱", "🎬", "🎮", "💊", "🎓", "🐾", "✈️", "🎁", "💰"];

const NAMA_BULAN_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const NAMA_BULAN_PANJANG_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
// Urutan mengikuti Date.getDay() (0 = Minggu).
const NAMA_HARI_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// Key localStorage untuk transaksi dan untuk konfigurasi budget (budget
// bulanan + kategori). summary dihitung ulang dari transaksi; goal &
// notifikasi masih mock/statis.
const TRANSACTIONS_STORAGE_KEY = "financeData.transactions";
const BUDGET_STORAGE_KEY = "financeData.budget";

/** Muat transaksi tersimpan dari localStorage (kalau ada & valid), menimpa mock data awal. */
function loadTransactions() {
  try {
    const saved = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      // Migrasi: jenis "investment" sudah dihapus dari aplikasi. Data lama
      // yang masih tersimpan dengan jenis itu dipetakan ke "expense" — sejak
      // awal investasi memang diperlakukan sebagai uang keluar dari saldo,
      // jadi total saldo user tidak berubah, cuma labelnya yang menyatu.
      financeData.transactions = parsed.map((tx) =>
        tx.type === "investment" ? { ...tx, type: "expense" } : tx
      );
    }
  } catch (err) {
    // localStorage tidak tersedia / data korup — abaikan, tetap pakai mock data awal.
  }
}

/** Simpan financeData.transactions saat ini ke localStorage. */
function saveTransactions() {
  try {
    localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(financeData.transactions));
  } catch (err) {
    // localStorage tidak tersedia (mis. private browsing) — abaikan, CRUD tetap
    // berjalan di memori untuk sisa sesi ini saja.
  }
}

/**
 * Muat konfigurasi budget dari localStorage (kalau ada & valid), menimpa
 * seed awal. Bentuk yang disimpan — sengaja sederhana supaya nanti mudah
 * dipindah ke backend:
 *   { monthly: 2400000, categories: { makanan: { name, emoji, budget }, ... } }
 */
function loadBudget() {
  try {
    const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return;
    if (Number.isFinite(parsed.monthly) && parsed.monthly >= 0) {
      financeData.budget.monthly = parsed.monthly;
    }
    if (parsed.categories && typeof parsed.categories === "object") {
      const categories = {};
      Object.entries(parsed.categories).forEach(([key, cat]) => {
        if (!cat || typeof cat.name !== "string" || !cat.name.trim()) return;
        if (!Number.isFinite(cat.budget) || cat.budget < 0) return;
        categories[key] = {
          name: cat.name.trim(),
          emoji: typeof cat.emoji === "string" && cat.emoji ? cat.emoji : FALLBACK_CATEGORY.emoji,
          budget: cat.budget,
        };
      });
      financeData.categories = categories; // boleh kosong: user menghapus semua kategori
    }
  } catch (err) {
    // localStorage tidak tersedia / data korup — abaikan, tetap pakai seed awal.
  }
}

/** Simpan budget bulanan + kategori saat ini ke localStorage. */
function saveBudget() {
  try {
    localStorage.setItem(
      BUDGET_STORAGE_KEY,
      JSON.stringify({ monthly: financeData.budget.monthly, categories: financeData.categories })
    );
  } catch (err) {
    // localStorage tidak tersedia — perubahan tetap berlaku di memori sesi ini.
  }
}

loadTransactions();
loadBudget();

const ICON_EDIT = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>`;

// Maksimal transaksi yang ditampilkan di dashboard utama (lihat poin 4 revisi)
const TRANSACTION_LIST_LIMIT = 3;

// Teks pengganti saat nominal disembunyikan (fitur hide/show saldo).
// Dipakai untuk Saldo, Pemasukan, DAN Pengeluaran sekaligus.
const MASKED_VALUE = "••••••••";

let isBalanceVisible = false;
let nextTransactionId = financeData.transactions.reduce((max, tx) => Math.max(max, tx.id), 0) + 1;

/* =========================================================
   2. HELPERS
   ========================================================= */

/** Format angka menjadi format Rupiah, contoh: 300000 -> "Rp300.000" */
function formatRupiah(number) {
  const rounded = Math.round(Math.abs(number));
  return `Rp${rounded.toLocaleString("id-ID")}`;
}

/** Nominal ringkas untuk label chart: 25.000 -> "25rb", 1.250.000 -> "1,25jt". */
function formatRupiahCompact(number) {
  const n = Math.round(number);
  if (n >= 1000000) return `${(n / 1000000).toLocaleString("id-ID", { maximumFractionDigits: 2 })}jt`;
  if (n >= 1000) return `${(n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 0 })}rb`;
  return String(n);
}

/** "2026-09-12" -> "12 September 2026" (judul tanggal terpilih di kalender). */
function formatDateLongID(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${d.getDate()} ${NAMA_BULAN_PANJANG_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format teks input nominal dengan pemisah ribuan, contoh: "500000" ->
 * "500.000". Semua karakter non-digit dibuang dulu, jadi aman dipanggil
 * berulang di atas hasil formatnya sendiri ("500.000" -> "500.000").
 * Kosong tetap kosong (jangan jadi "0" — biar placeholder tetap tampil). */
function formatAmountDigits(raw) {
  const digits = String(raw).replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("id-ID") : "";
}

/** Tentukan sapaan berdasarkan jam saat ini */
function getGreetingWord(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Apakah isoDate ("yyyy-mm-dd") jatuh di bulan kalender yang sama dengan `date`. */
function isSameMonth(isoDate, date) {
  return !!isoDate && isoDate.slice(0, 7) === toIsoDate(date).slice(0, 7);
}

/** Tanggal 1 bulan `date`, 00:00 LOKAL (komponen lokal, bukan toISOString). */
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** "September 2026" — label bulan+tahun dalam Bahasa Indonesia. */
function formatMonthYearID(date) {
  return `${NAMA_BULAN_PANJANG_ID[date.getMonth()]} ${date.getFullYear()}`;
}

/** Apakah `date` berada di bulan kalender yang sama dengan hari ini. */
function isCurrentMonth(date, today = new Date()) {
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

// Bulan yang sedang DILIHAT di budget.html (V2.2 Tahap B). Hanya state
// halaman — tidak disimpan ke localStorage. Default bulan berjalan; hanya
// boleh mundur (bulan masa depan tidak bisa dipilih). Dashboard tidak
// memakai ini: card Budget Bulan Ini di sana selalu bulan berjalan.
let budgetViewDate = startOfMonth(new Date());

/** Jumlah hari di bulan `date` (28/29/30/31 — dihitung, bukan hardcode). */
function getDaysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Sisa hari sampai akhir bulan, tidak termasuk hari ini (tgl 25 di bulan
 * 30 hari -> 5; hari terakhir bulan -> 0). */
function getDaysLeftInMonth(date = new Date()) {
  return getDaysInMonth(date) - date.getDate();
}

/** "Terpakai" sebuah kategori = jumlah PENGELUARAN aktual (tipe expense) di
 * kategori itu pada BULAN BERJALAN, dari financeData.transactions (sumber
 * yang sama dengan daftar transaksi & localStorage). Budget memang budget
 * bulanan, jadi transaksi bulan-bulan sebelumnya tidak ikut dihitung.
 * Pemasukan tidak dihitung. */
function getCategoryUsed(key, now = new Date()) {
  return financeData.transactions
    .filter((tx) => tx.type === "expense" && tx.category === key && isSameMonth(tx.isoDate, now))
    .reduce((sum, tx) => sum + tx.amount, 0);
}

/** Total pengeluaran bulan berjalan (semua kategori, termasuk "Lainnya") —
 * pembanding untuk budget bulanan yang memang batas pengeluaran keseluruhan. */
function getTotalUsed(now = new Date()) {
  return financeData.transactions
    .filter((tx) => tx.type === "expense" && isSameMonth(tx.isoDate, now))
    .reduce((sum, tx) => sum + tx.amount, 0);
}

/** Jumlah budget semua kategori — dibandingkan dengan budget bulanan untuk
 * catatan ringan "total budget kategori melebihi budget bulanan". */
function getTotalCategoryBudget() {
  return Object.values(financeData.categories).reduce((sum, cat) => sum + cat.budget, 0);
}

/** Status budget SATU KATEGORI (card di budget.html) — V2.2, 4 level +
 * "belum diatur". Terpisah dari getBudgetStatus() yang tetap dipakai card
 * Budget Bulan Ini (dashboard) dan Financial Check-in.
 *   budget <= 0 -> unset : "Belum ada budget"  (tanpa persen/progress)
 *   < 70%       -> safe  : "Aman"
 *   70-89%      -> watch : "Perlu diperhatikan"
 *   90-99%      -> near  : "Mendekati batas"
 *   >= 100%     -> over  : "Melebihi budget"
 * percent tidak dipotong ke 100 (label boleh "125%"); remaining boleh
 * negatif — tampilannya "Lebih Rp…" ditangani template. */
function getCategoryBudgetStatus(used, budget) {
  if (!(budget > 0)) return { key: "unset", label: "Belum ada budget", percent: 0, remaining: 0 };
  const percent = (used / budget) * 100;
  const remaining = budget - used;
  if (percent >= 100) return { key: "over", label: "Melebihi budget", percent, remaining };
  if (percent >= 90) return { key: "near", label: "Mendekati batas", percent, remaining };
  if (percent >= 70) return { key: "watch", label: "Perlu diperhatikan", percent, remaining };
  return { key: "safe", label: "Aman", percent, remaining };
}

/** Pengeluaran bulan `now` yang TIDAK punya budget kategori: kategori
 * "Lainnya" dan kategori yang sudah dihapus user (key-nya tetap tersimpan
 * di transaksi). Ditampilkan sebagai satu baris info di budget.html supaya
 * total pengeluaran periode tetap jujur, bukan "hilang" dari daftar. */
function getUnbudgetedUsed(now = new Date()) {
  const list = financeData.transactions.filter(
    (tx) => tx.type === "expense" && !financeData.categories[tx.category] && isSameMonth(tx.isoDate, now)
  );
  return { amount: list.reduce((sum, tx) => sum + tx.amount, 0), count: list.length };
}

/** Hitung status budget kategori berdasarkan persentase pemakaian */
function getBudgetStatus(percent) {
  if (percent >= 90) return { key: "danger", label: "Melebihi batas aman" };
  if (percent >= 70) return { key: "warning", label: "Perlu diperhatikan" };
  return { key: "safe", label: "Masih aman" };
}

/** Format tanggal "yyyy-mm-dd" dari <input type="date"> menjadi "9 Sep 2026" */
function formatDateID(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return `${d.getDate()} ${NAMA_BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/** Ubah objek Date jadi string "yyyy-mm-dd" memakai komponen tanggal LOKAL.
 * Sengaja tidak pakai toISOString() (yang berbasis UTC): di zona waktu
 * seperti WIB (UTC+7), tanggal UTC bisa beda satu hari dari tanggal yang
 * dilihat user, sehingga transaksi hari ini bisa salah masuk grup "Kemarin". */
function toIsoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Label kelompok tanggal untuk daftar transaksi: "Hari ini", "Kemarin",
 * atau tanggal biasa ("5 Sep 2026") kalau lebih lama dari itu. */
function getDayLabel(isoDate) {
  if (!isoDate) return "Tanpa tanggal";

  const today = new Date();
  if (isoDate === toIsoDate(today)) return "Hari ini";

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isoDate === toIsoDate(yesterday)) return "Kemarin";

  return formatDateID(isoDate);
}

/** Kelompokkan transaksi per hari, mempertahankan urutan array masukan
 * (yang sudah disortir getSortedTransactions()). Karena input sudah terurut
 * per tanggal, cukup dikelompokkan secara berurutan: begitu isoDate berganti,
 * mulai kelompok baru. Hasil: [{ isoDate, label, items: [...] }, ...] */
function groupTransactionsByDay(transactions) {
  const groups = [];

  transactions.forEach((tx) => {
    const isoDate = tx.isoDate || "";
    const lastGroup = groups[groups.length - 1];

    if (!lastGroup || lastGroup.isoDate !== isoDate) {
      groups.push({ isoDate, label: getDayLabel(isoDate), items: [tx] });
    } else {
      lastGroup.items.push(tx);
    }
  });

  return groups;
}

/** Ambil bagian jam dari field `time` transaksi kalau ada.
 * Data mock menyimpan "Hari ini, 12:30" / "1 Sep, 08:00" (ada jamnya),
 * sedangkan transaksi baru dari form disimpan lewat formatDateID() jadi
 * "9 Sep 2026" (tanpa jam). Yang tanpa jam mengembalikan string kosong,
 * jadi baris metanya cukup menampilkan nama kategori saja. */
function getTransactionTimeLabel(tx) {
  const time = tx.time || "";
  const commaIndex = time.indexOf(",");
  return commaIndex === -1 ? "" : time.slice(commaIndex + 1).trim();
}

/** Urutkan transaksi dari yang paling baru (berdasarkan isoDate, lalu id) */
function getSortedTransactions(transactions) {
  return [...transactions].sort((a, b) => {
    const dateCompare = (b.isoDate || "").localeCompare(a.isoDate || "");
    if (dateCompare !== 0) return dateCompare;
    return b.id - a.id;
  });
}

/** Tanda (+/-) dan kelas warna nominal transaksi berdasarkan jenisnya.
 * Hanya ada dua jenis: income (+) dan expense (-). */
function getTransactionAmountMeta(type) {
  if (type === "income") return { sign: "+", amountClass: "transaction-amount--income" };
  return { sign: "-", amountClass: "transaction-amount--expense" };
}

/**
 * Hitung ulang Saldo / Pemasukan / Pengeluaran berdasarkan
 * financeData.transactions saat ini. Dipanggil setiap kali transaksi
 * ditambah, diubah, atau dihapus, supaya Financial Summary selalu
 * konsisten dengan daftar transaksi.
 *
 * Catatan: "terpakai" per kategori (Analisis Kategori & Budget Bulan Ini)
 * dihitung terpisah oleh getCategoryUsed() dari transaksi yang sama.
 */
function recalcFromTransactions() {
  const income = financeData.transactions
    .filter((tx) => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const expense = financeData.transactions
    .filter((tx) => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);

  financeData.summary.income = income;
  financeData.summary.expense = expense;
  financeData.summary.balance = income - expense;
}

/**
 * Render ulang bagian-bagian yang bergantung pada data transaksi, setelah
 * CRUD. Dipanggil dari dua halaman (dashboard & halaman Semua Transaksi)
 * yang punya set elemen berbeda — masing-masing render function sudah
 * no-op sendiri kalau elemen targetnya tidak ada di halaman ini.
 */
function refreshDashboard() {
  saveTransactions();
  recalcFromTransactions();
  renderSummary(financeData.summary);
  renderBudgetSummary();
  renderCategoryList();
  renderRecentTransactions();
  renderAllTransactionsList();
}

/* =========================================================
   3. RENDER FUNCTIONS
   ========================================================= */

/** 1. Header: sapaan dinamis */
function renderGreeting(userName = "Rizqi") {
  const el = document.getElementById("greeting-text");
  el.textContent = `${getGreetingWord()}, ${userName}`;
}

/**
 * 2. Financial Summary.
 * Semua nominal di card ini (Saldo, Pemasukan, Pengeluaran) mengikuti SATU
 * state isBalanceVisible — sekali disembunyikan, ketiganya ikut ter-masking.
 *
 * Catatan: financeData.summary.investment sengaja tidak lagi ditampilkan di
 * card ini (kolomnya dihapus dari index.html), tapi datanya tetap dihitung
 * dan tetap mengurangi saldo — lihat recalcFromTransactions().
 */
function renderSummary(summary) {
  const balanceEl = document.getElementById("balance-value");
  if (!balanceEl) return; // bukan di dashboard (mis. halaman Semua Transaksi)

  const targets = [
    [balanceEl, summary.balance],
    [document.getElementById("income-value"), summary.income],
    [document.getElementById("expense-value"), summary.expense],
  ];

  targets.forEach(([el, value]) => {
    el.textContent = formatMaskable(value);
    // .is-masked mengganti font saat masking aktif — lihat komentar di CSS:
    // Sora (font angka) merender U+2022 sebagai kotak, jadi deretan dot-nya
    // dirender pakai Inter yang bullet-nya benar-benar bulat. Warna & ukuran
    // tetap dari rule elemen masing-masing.
    el.classList.toggle("is-masked", !isBalanceVisible);
  });
}

/** Nominal apa adanya kalau saldo sedang ditampilkan, atau bulatan masking
 * kalau sedang disembunyikan. */
function formatMaskable(value) {
  return isBalanceVisible ? formatRupiah(value) : MASKED_VALUE;
}

/** Ubah state hide/show saldo, sinkronkan icon + aria-label + teks */
function setBalanceVisible(visible) {
  isBalanceVisible = visible;

  const btn = document.getElementById("btn-toggle-balance");
  // classList, bukan properti .hidden — lihat komentar di CSS
  // (.icon-eye.is-hidden) soal kenapa .hidden tidak dipakai di sini.
  document.getElementById("icon-eye").classList.toggle("is-hidden", !visible);
  document.getElementById("icon-eye-off").classList.toggle("is-hidden", visible);
  btn.setAttribute("aria-label", visible ? "Sembunyikan saldo" : "Tampilkan saldo");
  btn.setAttribute("aria-pressed", String(visible));

  // Render ulang SELURUH nominal card (bukan cuma saldo) supaya Pemasukan &
  // Pengeluaran ikut ter-masking/terbuka bareng.
  renderSummary(financeData.summary);
}

/**
 * 4. Budget Bulan Ini — budget bulanan (financeData.budget.monthly, diatur
 * user) vs total pengeluaran aktual. Persen & progress bar memakai
 * helper/status yang sama dengan card Per Kategori. Di analytics.html ada
 * #budget-note: catatan ringan kalau total budget kategori > budget bulanan
 * (tidak mengubah data apa pun).
 */
function renderBudgetSummary(now = new Date()) {
  const card = document.getElementById("budget-card");
  if (!card) return; // halaman ini tidak punya card budget

  // budget.html: judul mengikuti bulan yang dilihat. Dashboard tidak punya
  // elemen ini (judulnya statis "Budget Bulan Ini" dan selalu bulan berjalan).
  const title = document.getElementById("budget-summary-title");
  if (title) title.textContent = isCurrentMonth(now) ? "Budget Bulan Ini" : `Budget ${formatMonthYearID(now)}`;

  const budget = financeData.budget.monthly;
  const used = getTotalUsed(now);
  const remaining = Math.max(budget - used, 0);
  const percent = budget > 0 ? (used / budget) * 100 : 0;
  const percentLabel = percent.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  const status = getBudgetStatus(percent);

  card.innerHTML = `
    <div class="budget-amounts">
      <div>
        <span class="budget-used">${formatRupiah(used)}</span>
        <span class="budget-total"> / ${formatRupiah(budget)}</span>
      </div>
      <span class="budget-percent">${percentLabel}%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" data-status="${status.key}" style="width:${Math.min(percent, 100)}%"></div>
    </div>
    <div class="budget-foot">
      <span>Sisa budget</span>
      <span class="budget-remaining">${formatRupiah(remaining)}</span>
    </div>
  `;

  const note = document.getElementById("budget-note");
  if (note) {
    const totalCategory = getTotalCategoryBudget();
    const over = totalCategory > budget;
    note.hidden = !over;
    note.textContent = over
      ? `⚠️ Total budget kategori (${formatRupiah(totalCategory)}) melebihi budget bulanan. Tidak apa-apa, tapi mungkin ingin disesuaikan.`
      : "";
  }
}

/** Markup satu panel Analisis Kategori. Isinya PERSIS sama dengan card
 * Analisis Kategori versi lama (nama, status, budget, terpakai, progress
 * bar, sisa) — yang berubah cuma: sekarang dicetak satu panel per kategori
 * di dalam carousel, bukan satu card yang innerHTML-nya diganti-ganti. */
function renderCategoryPanel(key, categoryData, now = new Date()) {
  const { name, budget, emoji } = categoryData;
  const used = getCategoryUsed(key, now);
  const status = getCategoryBudgetStatus(used, budget);
  const head = `
      <div class="category-card-head">
        <span class="category-name"><span class="category-emoji" aria-hidden="true">${emoji || FALLBACK_CATEGORY.emoji}</span>${name}</span>
        <span class="category-status" data-status="${status.key}">${status.label}</span>
        <button type="button" class="btn btn--ghost btn--xs" data-action="edit-category" data-key="${key}" aria-label="Edit kategori ${name}">${ICON_EDIT} Edit</button>
      </div>`;

  // Budget 0 = belum diatur: kategori tetap ada (dipakai form transaksi),
  // tapi tanpa persen/progress/status palsu — hanya pengeluaran aktualnya.
  if (status.key === "unset") {
    return `
    <article class="category-card category-card--unset" data-category="${key}">${head}
      <div class="category-card-foot">
        <span>Terpakai: <strong class="num">${formatRupiah(used)}</strong></span>
        <span class="category-unset-hint">Atur budget lewat tombol Edit</span>
      </div>
    </article>
  `;
  }

  const percentLabel = status.percent.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  // Sisa boleh negatif: ditampilkan "Lebih Rp…" (formatRupiah memakai nilai
  // absolut, jadi tidak pernah muncul "-Rp").
  const over = status.remaining < 0;
  const remainingMarkup = over
    ? `<span class="remaining-budget is-over">Lebih <strong class="num">${formatRupiah(-status.remaining)}</strong></span>`
    : `<span class="remaining-budget">Sisa <strong class="num">${formatRupiah(status.remaining)}</strong></span>`;

  return `
    <article class="category-card" data-category="${key}">${head}
      <div class="category-budget-row">
        <span>Budget: <strong class="num">${formatRupiah(budget)}</strong></span>
        <span class="progress-percent" data-status="${status.key}">${percentLabel}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill" data-status="${status.key}" style="width:${Math.min(status.percent, 100)}%"></div>
      </div>
      <div class="category-card-foot">
        <span>Terpakai: <strong class="num">${formatRupiah(used)}</strong></span>
        ${remainingMarkup}
      </div>
    </article>
  `;
}

/** Baris "Pengeluaran lain tanpa budget" di bawah daftar kategori — hanya
 * kalau memang ada (kategori Lainnya / kategori yang sudah dihapus). */
function renderUnbudgetedRow(now = new Date()) {
  const { amount, count } = getUnbudgetedUsed(now);
  if (!count) return "";
  const noun = count === 1 ? "1 transaksi" : `${count} transaksi`;
  return `
    <div class="category-card category-card--other" data-category="__other">
      <div class="category-card-head">
        <span class="category-name"><span class="category-emoji" aria-hidden="true">${FALLBACK_CATEGORY.emoji}</span>Pengeluaran lain tanpa budget</span>
        <strong class="num category-other-amount">${formatRupiah(amount)}</strong>
      </div>
      <p class="category-other-hint">${noun} di kategori Lainnya atau kategori yang sudah dihapus. Tidak dibandingkan dengan budget mana pun.</p>
    </div>
  `;
}

/**
 * Halaman analytics.html: semua kategori ditumpuk vertikal,
 * memakai template panel yang sama persis dengan dashboard.
 */
function renderCategoryList(now = new Date()) {
  const list = document.getElementById("category-list");
  if (!list) return; // bukan di halaman budget
  const entries = Object.entries(financeData.categories);

  // Peringatan ringkas di atas daftar: berapa kategori yang sudah melebihi
  // budget pada periode ini (0 -> disembunyikan).
  const note = document.getElementById("category-note");
  if (note) {
    const overCount = entries.filter(([key, cat]) => getCategoryBudgetStatus(getCategoryUsed(key, now), cat.budget).key === "over").length;
    note.hidden = overCount === 0;
    const when = isCurrentMonth(now) ? "bulan ini" : `pada ${formatMonthYearID(now)}`;
    note.textContent = overCount
      ? `⚠️ ${overCount} kategori sudah melebihi budget ${when}. Cek card yang bertanda "Melebihi budget".`
      : "";
  }

  const cards = entries.length
    ? entries.map(([key, data]) => renderCategoryPanel(key, data, now)).join("")
    : `<p class="category-empty">Belum ada kategori. Tambahkan kategori untuk mulai mengatur budget per pos pengeluaran.</p>`;
  list.innerHTML = cards + renderUnbudgetedRow(now);
}

/** Navigator bulan di budget.html: label, tombol › (disabled di bulan
 * berjalan — masa depan tidak bisa dipilih), tombol "Bulan Ini" (disabled
 * kalau sudah di bulan berjalan), dan catatan "budget saat ini" saat
 * melihat bulan lain. */
function renderBudgetPeriod() {
  const title = document.getElementById("budget-period-title");
  if (!title) return; // bukan di halaman budget
  const current = isCurrentMonth(budgetViewDate);
  title.textContent = formatMonthYearID(budgetViewDate);
  document.getElementById("budget-next-month").disabled = current;
  document.getElementById("budget-this-month").disabled = current;
  const hint = document.getElementById("budget-period-hint");
  hint.hidden = current;
  hint.textContent = current
    ? ""
    : `Pengeluaran ${formatMonthYearID(budgetViewDate)} dibandingkan dengan budget saat ini.`;
}

/** Render seluruh budget.html untuk bulan yang dilihat (budgetViewDate):
 * summary, card kategori, note kategori melebihi budget, baris pengeluaran
 * tanpa budget, dan navigator — semuanya memakai tanggal yang sama. */
function renderBudgetPage() {
  renderBudgetSummary(budgetViewDate);
  renderCategoryList(budgetViewDate);
  renderBudgetPeriod();
}

/** Pasang tombol navigator bulan (budget.html). */
function setupBudgetPeriodNav() {
  const prev = document.getElementById("budget-prev-month");
  if (!prev) return; // bukan di halaman budget
  const next = document.getElementById("budget-next-month");
  const thisMonth = document.getElementById("budget-this-month");

  function setViewMonth(date) {
    // Jaga supaya tidak pernah melewati bulan berjalan (komponen lokal).
    const limit = startOfMonth(new Date());
    budgetViewDate = date > limit ? limit : startOfMonth(date);
    renderBudgetPage();
  }

  prev.addEventListener("click", () => setViewMonth(new Date(budgetViewDate.getFullYear(), budgetViewDate.getMonth() - 1, 1)));
  next.addEventListener("click", () => {
    if (isCurrentMonth(budgetViewDate)) return; // tombol sudah disabled; jaga-jaga
    setViewMonth(new Date(budgetViewDate.getFullYear(), budgetViewDate.getMonth() + 1, 1));
  });
  thisMonth.addEventListener("click", () => setViewMonth(new Date()));
}

/* ---------- Financial Check-in: perhitungan berbasis data aktual ---------- */

/** Awal minggu (Senin, 00:00 lokal) untuk sebuah tanggal. */
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // Senin = 0
  d.setDate(d.getDate() - day);
  return d;
}

/** Jumlah pengeluaran dalam rentang [from, to) — opsional dibatasi kategori. */
function sumExpense(from, to, category) {
  return financeData.transactions
    .filter((tx) => tx.type === "expense" && tx.isoDate && (!category || tx.category === category))
    .filter((tx) => {
      const d = new Date(`${tx.isoDate}T00:00:00`);
      return d >= from && d < to;
    })
    .reduce((sum, tx) => sum + tx.amount, 0);
}

/** Pengeluaran minggu ini vs minggu lalu (total, atau per kategori). */
function getWeeklyComparison(category) {
  const now = new Date();
  const thisStart = startOfWeek(now);
  const lastStart = new Date(thisStart);
  lastStart.setDate(lastStart.getDate() - 7);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return {
    thisWeek: sumExpense(thisStart, tomorrow, category),
    lastWeek: sumExpense(lastStart, thisStart, category),
  };
}

/* ---------- Analisis (analytics.html): agregasi & insight dari data aktual ---------- */

/* ---------- Periode halaman Analisis = bulan berjalan ----------
   Semua angka di halaman (ringkasan, chart per tanggal, chart kategori,
   detail) dihitung dari SATU rentang [from, to) bulan berjalan berbasis
   tanggal LOKAL: new Date(y, m, d) untuk membangun rentang, toIsoDate()
   untuk membandingkan dengan tx.isoDate (string lokal vs string lokal).
   Tidak ada toISOString(). */

// State halaman Analisis: batang (tanggal) yang dipilih & daftar detail diperluas.
const analyticsPage = { selectedKey: null, detailExpanded: false };

/** Tambah n hari (komponen lokal). */
function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/** isoDate valid = "yyyy-mm-dd" yang benar-benar tanggal (bukan "2026-02-30"). */
function isValidIsoDate(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Rentang bulan kalender yang memuat `date` + label "September 2026". */
function getMonthRange(date = new Date()) {
  return {
    from: new Date(date.getFullYear(), date.getMonth(), 1),
    to: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    label: `${NAMA_BULAN_PANJANG_ID[date.getMonth()]} ${date.getFullYear()}`,
  };
}

/** Semua transaksi PENGELUARAN dengan tanggal valid dalam [from, to) —
 * satu-satunya filter yang dipakai ringkasan, chart, kategori, dan detail
 * (pemasukan tidak ikut; expense tanpa tanggal valid dilewati dengan aman). */
function getExpensesInRange(from, to) {
  const a = toIsoDate(from);
  const b = toIsoDate(to);
  return financeData.transactions.filter((tx) => tx.type === "expense" && isValidIsoDate(tx.isoDate) && tx.isoDate >= a && tx.isoDate < b);
}

/** Pengeluaran yang tidak bisa ditempatkan di chart (tanpa tanggal valid). */
function countUndatedExpenses() {
  return financeData.transactions.filter((tx) => tx.type === "expense" && !isValidIsoDate(tx.isoDate)).length;
}

function sumAmount(transactions) {
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

/** Pengeluaran per kategori dalam rentang (kategori yang sudah dihapus ->
 * "Lainnya"), urut dari yang terbesar; share dari total rentang itu. */
function getExpenseByCategory(range) {
  const totals = {};
  getExpensesInRange(range.from, range.to).forEach((tx) => {
    const key = financeData.categories[tx.category] ? tx.category : FALLBACK_CATEGORY.key;
    totals[key] = (totals[key] || 0) + tx.amount;
  });
  const total = Object.values(totals).reduce((sum, v) => sum + v, 0);
  return Object.entries(totals)
    .map(([key, amount]) => ({
      key,
      name: getCategoryLabel(key),
      emoji: getCategoryEmoji(key),
      amount,
      share: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/** Satu batang per tanggal dalam [from, to). key = toIsoDate (lokal).
 * Invarian: Σ amount semua batang = total pengeluaran rentang. */
function getDayBuckets(from, to, today = new Date()) {
  const todayIso = toIsoDate(today);
  const buckets = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    const next = addDays(d, 1);
    const key = toIsoDate(d);
    buckets.push({
      key,
      from: d,
      to: next,
      label: String(d.getDate()),
      title: formatDateLongID(key),
      amount: sumAmount(getExpensesInRange(d, next)),
      isCurrent: key === todayIso,
    });
  }
  return buckets;
}

/** Ringkasan atas: total bulan ini, kategori terbesar, perubahan vs bulan
 * lalu (null kalau bulan lalu tidak ada data — jangan mengarang perbandingan). */
function getAnalyticsSummary(range) {
  const total = sumAmount(getExpensesInRange(range.from, range.to));
  const byCategory = getExpenseByCategory(range);
  const prevFrom = new Date(range.from.getFullYear(), range.from.getMonth() - 1, 1);
  const previous = sumAmount(getExpensesInRange(prevFrom, range.from));
  const change = previous > 0 ? Math.round(((total - previous) / previous) * 100) : null;
  return { total, topCategory: byCategory[0] || null, previous, change };
}

/** Level pemakaian budget kategori (rule-based, dari persentase). */
function getBudgetAlertLevel(percent) {
  if (percent >= 100) return { key: "over", emoji: "🔴", label: "Budget terlewati" };
  if (percent >= 90) return { key: "near", emoji: "🟠", label: "Hampir mencapai batas" };
  if (percent >= 70) return { key: "watch", emoji: "🟡", label: "Mulai diperhatikan" };
  return { key: "safe", emoji: "🟢", label: "Aman" };
}

/** Kalimat sisa hari: "masih ada 5 hari sampai akhir bulan" / hari terakhir. */
function describeDaysLeft(daysLeft) {
  if (daysLeft <= 0) return "hari ini hari terakhir bulan ini";
  if (daysLeft === 1) return "masih ada 1 hari sampai akhir bulan";
  return `masih ada ${daysLeft} hari sampai akhir bulan`;
}

/**
 * Insight Keuangan (analytics.html) — rule-based dari data aktual, tiap
 * insight singkat + ada tindakannya. Berbeda dari Financial Check-in
 * (ringkasan kondisi saat masuk): ini membaca pola pengeluaran & budget.
 * `now` bisa disuntik supaya bisa diuji untuk bulan 28/29/30/31 hari.
 * Hasil: [{ level: over|near|watch|info|good|neutral, text }].
 */
function getAnalyticsInsights(now = new Date()) {
  const insights = [];
  const daysLeft = getDaysLeftInMonth(now);
  const daysIn = getDaysInMonth(now);
  const dayOfMonth = now.getDate();
  const perDay = (amount) => formatRupiah(Math.ceil(amount / Math.max(daysLeft, 1) / 1000) * 1000);

  /** Insight pemakaian satu budget (kategori atau bulanan). Hanya untuk >= 70%. */
  function budgetInsight(label, used, budget) {
    if (budget <= 0) return null;
    const pct = Math.round((used / budget) * 100);
    const level = getBudgetAlertLevel(pct);
    if (level.key === "over") {
      const over = pct - 100;
      const action = daysLeft > 0 ? `Coba tahan pengeluaran ${label} untuk sisa bulan ini.` : `Coba evaluasi budget ${label} untuk bulan depan.`;
      return { level: "over", pct, text: `🔴 Budget ${label} sudah terlewati ${over}%, dan ${describeDaysLeft(daysLeft)}. ${action}` };
    }
    if (level.key === "near") {
      return { level: "near", pct, text: `🟠 Budget ${label} sudah ${pct}%, sementara ${describeDaysLeft(daysLeft)}. Sebaiknya kurangi pengeluaran ${label} dulu supaya tidak terlewati.` };
    }
    if (level.key === "watch") {
      const remaining = budget - used;
      const pace = daysLeft > 0 ? ` — sekitar ${perDay(remaining)}/hari supaya tetap aman` : "";
      return { level: "watch", pct, text: `🟡 Budget ${label} sudah ${pct}%. Sisa ${formatRupiah(remaining)} untuk ${daysLeft > 0 ? `${daysLeft} hari lagi` : "hari terakhir bulan ini"}${pace}.` };
    }
    return null;
  }

  // 1. Budget bulanan (batas keseluruhan).
  const monthly = financeData.budget.monthly;
  const used = getTotalUsed(now);
  const monthlyInsight = budgetInsight("bulanan", used, monthly);
  if (monthlyInsight) insights.push(monthlyInsight);

  // 2. Kategori yang mendekati / melewati budget — dari yang paling parah.
  const flagged = Object.entries(financeData.categories)
    .map(([key, cat]) => ({ key, insight: budgetInsight(cat.name, getCategoryUsed(key, now), cat.budget) }))
    .filter((x) => x.insight)
    .sort((a, b) => b.insight.pct - a.insight.pct);
  flagged.slice(0, 4).forEach((x) => insights.push(x.insight));
  const flaggedKeys = new Set(flagged.map((x) => x.key));

  // 3. Ritme pengeluaran: proyeksi akhir bulan vs budget bulanan (hanya kalau
  //    belum masuk zona peringatan, supaya tidak dobel dengan insight #1).
  if (monthly > 0 && used > 0 && !monthlyInsight && dayOfMonth >= 3 && daysLeft > 0) {
    const projected = (used / dayOfMonth) * daysIn;
    if (projected > monthly) {
      insights.push({
        level: "watch",
        text: `📊 Dengan ritme sekarang, pengeluaran bulan ini diperkirakan ${formatRupiah(Math.round(projected / 1000) * 1000)} — melewati budget bulanan ${formatRupiah(monthly)}. Coba jaga di bawah ${perDay(monthly - used)}/hari.`,
      });
    }
  }

  // 4. Kategori terbesar bulan ini (lewati kalau sudah diperingatkan di #2).
  const top = getExpenseByCategory(getMonthRange(now))[0];
  if (top && !flaggedKeys.has(top.key)) {
    insights.push({
      level: "info",
      text: `💡 ${top.name} jadi pengeluaran terbesar kamu bulan ini (${Math.round(top.share)}% dari total). Coba tentukan batas harian untuk kategori ini sampai akhir bulan.`,
    });
  }

  // 5. Minggu ini vs minggu lalu — hanya kalau dua-duanya punya data.
  const { thisWeek, lastWeek } = getWeeklyComparison();
  if (thisWeek > 0 && lastWeek > 0 && thisWeek !== lastWeek) {
    const pct = Math.abs(Math.round(((thisWeek - lastWeek) / lastWeek) * 100));
    insights.push(
      thisWeek < lastWeek
        ? { level: "good", text: `📉 Pengeluaran minggu ini lebih rendah ${pct}% dibanding minggu lalu. Pertahankan 👍` }
        : { level: "watch", text: `📈 Pengeluaran minggu ini lebih tinggi ${pct}% dibanding minggu lalu. Cek lagi mana yang bisa ditahan.` }
    );
  }

  if (!insights.length) {
    insights.push({ level: "neutral", text: "🌱 Belum ada pola yang perlu diperhatikan. Terus catat transaksimu supaya insight makin akurat." });
  }
  return insights;
}

/** Ringkasan atas: 3 tile (total, kategori terbesar, perubahan) bulan ini. */
function renderAnalyticsSummary(range) {
  const el = document.getElementById("analytics-summary");
  if (!el) return;
  const { total, topCategory, change } = getAnalyticsSummary(range);

  let changeValue;
  let changeSub;
  if (change === null) {
    changeValue = `<span class="stat-value stat-value--text">💡 Belum cukup data</span>`;
    changeSub = "untuk perbandingan";
  } else if (change === 0) {
    changeValue = `<span class="stat-value">➖ 0%</span>`;
    changeSub = "sama dengan bulan lalu";
  } else {
    changeValue = `<span class="stat-value num">${change > 0 ? "📈 +" : "📉 −"}${Math.abs(change)}%</span>`;
    changeSub = "dibanding bulan lalu";
  }

  el.innerHTML = `
    <div class="stat stat--wide">
      <span class="stat-label">Total Pengeluaran</span>
      <span class="stat-value num">${formatRupiah(total)}</span>
      <span class="stat-sub">${range.label}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Kategori Terbesar</span>
      ${topCategory ? `<span class="stat-value">${topCategory.emoji} ${topCategory.name}</span><span class="stat-sub num">${formatRupiah(topCategory.amount)}</span>` : `<span class="stat-value stat-value--text">Belum ada</span><span class="stat-sub">pengeluaran bulan ini</span>`}
    </div>
    <div class="stat">
      <span class="stat-label">Perubahan</span>
      ${changeValue}
      <span class="stat-sub">${changeSub}</span>
    </div>
  `;
}

/** Label tanggal yang ditampilkan di bawah batang: 1, 5, 10, 15, 20, 25,
 * tanggal terakhir, plus hari ini & batang aktif (sisanya kosong supaya
 * 28-31 kolom kecil tidak saling tumpang tindih). */
function shouldShowBarLabel(bucket, index, count) {
  const day = index + 1;
  return day === 1 || day % 5 === 0 || day === count || bucket.isCurrent;
}

/** Chart batang pengeluaran per tanggal bulan ini (HTML/CSS, tanpa library).
 * Batang kecil memenuhi lebar card (tanpa scroll). Tiap batang = <button>;
 * pemilihan lewat tap/klik ATAU scrubbing (jari/pointer digeser di atas
 * chart, batang di bawah pointer langsung aktif — lihat setupChartScrub()).
 * Saat scrubbing, DOM chart TIDAK dirender ulang (setSelectedBar()
 * mengubah class di tempat) supaya pointer capture tidak putus. */
function renderTimeChart(range, buckets) {
  const el = document.getElementById("time-chart");
  if (!el) return;
  const max = Math.max(...buckets.map((x) => x.amount));
  const total = buckets.reduce((sum, x) => sum + x.amount, 0);
  const undated = countUndatedExpenses();

  const sub = document.getElementById("time-chart-sub");
  if (sub) sub.textContent = range.label;

  el.innerHTML = `
    <div class="bar-chart${analyticsPage.selectedKey ? " has-selection" : ""}" id="bar-chart" role="group" aria-label="Pengeluaran per tanggal, ${range.label}, total ${formatRupiah(total)}. Geser jari di atas chart untuk memilih tanggal.">
      ${buckets
        .map((x, i) => {
          const selected = x.key === analyticsPage.selectedKey;
          return `
        <button type="button" class="bar-col${x.isCurrent ? " is-current" : ""}${selected ? " is-selected" : ""}" data-key="${x.key}" data-value="${x.amount > 0 ? formatRupiahCompact(x.amount) : ""}" aria-pressed="${selected}" aria-label="${x.title}, ${formatRupiah(x.amount)}" title="${x.title}">
          <span class="bar-value"></span>
          <span class="bar-track"><span class="bar-fill" style="height:${max > 0 ? Math.max((x.amount / max) * 100, x.amount > 0 ? 3 : 0) : 0}%"></span></span>
          <span class="bar-label${shouldShowBarLabel(x, i, buckets.length) ? "" : " is-hidden"}">${x.label}</span>
        </button>`;
        })
        .join("")}
    </div>
    <p class="chart-note">${max > 0 ? `Total bulan ini <strong class="num">${formatRupiah(total)}</strong>` : "Belum ada pengeluaran bulan ini."}${undated ? ` <span class="chart-note-muted">· ${undated} pengeluaran tanpa tanggal valid tidak ditampilkan</span>` : ""}</p>
  `;
  syncBarHighlights();
}

/**
 * Sinkronkan sorotan batang: nilai di atas batang dan label tanggal hanya
 * ditampilkan seperlunya supaya 28-31 kolom kecil tetap terbaca.
 *  - nilai  : batang yang sedang disentuh (preview) > batang terpilih > hari ini
 *  - label  : posisi tetap (1, 5, 10, …, tanggal terakhir, hari ini) + batang
 *             terpilih + batang yang sedang disentuh
 */
function syncBarHighlights() {
  const chart = document.getElementById("bar-chart");
  if (!chart) return;
  const bars = [...chart.querySelectorAll(".bar-col")];
  const hovered = chart.querySelector(".bar-col.is-hover");
  const selected = chart.querySelector(".bar-col.is-selected");
  const valueBar = hovered || selected || chart.querySelector(".bar-col.is-current");
  bars.forEach((bar, i) => {
    bar.querySelector(".bar-value").textContent = bar === valueBar ? bar.dataset.value : "";
    const fixedLabel = shouldShowBarLabel({ isCurrent: bar.classList.contains("is-current") }, i, bars.length);
    bar.querySelector(".bar-label").classList.toggle("is-hidden", !(fixedLabel || bar === hovered || bar === selected));
  });
}

/** Sorotan sementara saat pointer digeser di atas chart. MURNI visual:
 * tidak menyentuh analyticsPage.selectedKey dan tidak mengubah card detail. */
function setHoverBar(bar) {
  const chart = document.getElementById("bar-chart");
  if (!chart) return;
  chart.querySelectorAll(".bar-col.is-hover").forEach((b) => {
    if (b !== bar) b.classList.remove("is-hover");
  });
  if (bar) bar.classList.add("is-hover");
  syncBarHighlights();
}

/** Kunci pilihan ke satu tanggal (dipanggil hanya oleh tap/klik, bukan
 * geseran) + render ulang card detail supaya isinya mengikuti batang aktif.
 * DOM chart tidak dirender ulang supaya pointer capture tidak putus. */
function setSelectedBar(key) {
  if (key === analyticsPage.selectedKey) return;
  analyticsPage.selectedKey = key;
  analyticsPage.detailExpanded = false;
  const chart = document.getElementById("bar-chart");
  if (chart) {
    chart.classList.toggle("has-selection", !!key);
    chart.querySelectorAll(".bar-col").forEach((bar) => {
      const active = bar.dataset.key === key;
      bar.classList.toggle("is-selected", active);
      bar.setAttribute("aria-pressed", String(active));
    });
    syncBarHighlights();
  }
  const range = getMonthRange(new Date());
  renderChartDetail(range, getDayBuckets(range.from, range.to));
}

// Pointer dianggap "tap" (bukan geseran) kalau bergesernya di bawah ambang ini.
const TAP_MOVE_THRESHOLD_PX = 8;

/**
 * Interaksi chart (Pointer Events, mouse & touch seragam) dengan dua mode
 * yang sengaja dibedakan:
 *
 *  - GESER (scrubbing): pointerdown lalu digeser > 8px. Batang di bawah
 *    pointer hanya mendapat sorotan sementara (.is-hover). Pilihan permanen
 *    dan isi card detail TIDAK berubah, dan saat pointer dilepas sorotan
 *    hilang lagi. Murni feedback visual.
 *  - TAP/KLIK: pointerdown -> pointerup di tempat yang sama (geser <= 8px).
 *    Batang itu jadi terpilih permanen (aria-pressed) dan card detail
 *    berganti ke transaksi tanggal tersebut.
 *
 * pointercancel (mis. browser mengambil alih untuk scroll vertikal halaman,
 * lihat touch-action: pan-y di CSS) hanya membersihkan sorotan — pilihan
 * yang sudah ada dibiarkan. Kembali ke seluruh periode lewat tombol
 * "Semua periode" di card detail.
 */
function setupChartScrub() {
  const host = document.getElementById("time-chart");
  if (!host) return;
  let activePointer = null;
  let startX = 0;
  let startY = 0;
  let movedBeyondThreshold = false;

  function barAtX(chart, clientX) {
    const bars = chart.querySelectorAll(".bar-col");
    if (!bars.length) return null;
    const rect = chart.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const index = Math.min(bars.length - 1, Math.max(0, Math.floor(ratio * bars.length)));
    return bars[index];
  }

  host.addEventListener("pointerdown", (e) => {
    const chart = e.target.closest("#bar-chart");
    if (!chart) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    movedBeyondThreshold = false;
    try {
      chart.setPointerCapture(e.pointerId);
    } catch (err) {
      // browser lama tanpa pointer capture — tap tetap bekerja lewat pointerup
    }
    setHoverBar(barAtX(chart, e.clientX)); // preview saja, belum memilih
  });

  host.addEventListener("pointermove", (e) => {
    if (activePointer === null || e.pointerId !== activePointer) return;
    const chart = document.getElementById("bar-chart");
    if (!chart) return;
    if (Math.abs(e.clientX - startX) > TAP_MOVE_THRESHOLD_PX || Math.abs(e.clientY - startY) > TAP_MOVE_THRESHOLD_PX) {
      movedBeyondThreshold = true;
    }
    setHoverBar(barAtX(chart, e.clientX)); // tetap hanya preview
  });

  host.addEventListener("pointerup", (e) => {
    if (activePointer === null || e.pointerId !== activePointer) return;
    activePointer = null;
    const chart = document.getElementById("bar-chart");
    const bar = chart ? barAtX(chart, e.clientX) : null;
    // Hanya tap tanpa geseran berarti yang mengunci pilihan.
    if (!movedBeyondThreshold && bar) setSelectedBar(bar.dataset.key);
    setHoverBar(null);
  });

  host.addEventListener("pointercancel", (e) => {
    if (activePointer === null || e.pointerId !== activePointer) return;
    activePointer = null;
    setHoverBar(null); // pilihan yang sudah ada tidak diubah
  });

  // Mouse keluar dari chart tanpa sedang menekan -> bersihkan preview.
  host.addEventListener("pointerleave", () => {
    if (activePointer === null) setHoverBar(null);
  });

  // Enter/Space pada <button> batang tidak memicu pointerdown -> tangani di
  // sini (click dari pointer punya detail > 0 dan sudah ditangani di atas).
  host.addEventListener("click", (e) => {
    const bar = e.target.closest(".bar-col");
    if (!bar || e.detail !== 0) return;
    setSelectedBar(bar.dataset.key);
  });
}

/** Chart batang horizontal pengeluaran per kategori bulan ini. */
function renderCategoryChart(range) {
  const el = document.getElementById("category-chart");
  if (!el) return;
  const rows = getExpenseByCategory(range);
  if (!rows.length) {
    el.innerHTML = `<p class="chart-empty">Belum ada pengeluaran bulan ini.</p>`;
    return;
  }
  const max = rows[0].amount;
  el.innerHTML = rows
    .map(
      (r) => `
      <div class="cat-row">
        <div class="cat-row-head">
          <span class="cat-row-name"><span class="category-emoji" aria-hidden="true">${r.emoji}</span>${r.name}</span>
          <span class="cat-row-amount num">${formatRupiah(r.amount)}</span>
        </div>
        <div class="cat-row-bar"><div class="cat-row-fill" style="width:${(r.amount / max) * 100}%"></div></div>
        <span class="cat-row-share">${Math.round(r.share)}% dari total</span>
      </div>`
    )
    .join("");
}

// Maksimal transaksi di card detail sebelum "Lihat semua".
const DETAIL_LIST_LIMIT = 5;

/** Card detail di bawah chart: transaksi pengeluaran pada tanggal terpilih,
 * atau seluruh bulan ini kalau tidak ada batang yang dipilih. Tanpa
 * Edit/Delete (pengelolaan data ada di Semua Transaksi). */
function renderChartDetail(range, buckets) {
  const el = document.getElementById("chart-detail");
  if (!el) return;
  const selected = buckets.find((b) => b.key === analyticsPage.selectedKey) || null;
  const from = selected ? selected.from : range.from;
  const to = selected ? selected.to : range.to;
  const title = selected ? selected.title : range.label; // kicker di atasnya sudah "Semua periode"
  const all = getSortedTransactions(getExpensesInRange(from, to));
  const shown = analyticsPage.detailExpanded ? all : all.slice(0, DETAIL_LIST_LIMIT);

  el.innerHTML = `
    <div class="detail-head">
      <div class="detail-title-wrap">
        <span class="detail-kicker">${selected ? "Tanggal terpilih" : "Semua periode"}</span>
        <h3 class="detail-title" id="chart-detail-title">${title}</h3>
      </div>
      <span class="detail-total num">${formatRupiah(sumAmount(all))}</span>
    </div>
    ${selected ? `<button type="button" class="link-see-all detail-reset" id="btn-reset-selection">← Semua periode</button>` : ""}
    <ul class="transaction-list detail-list">
      ${all.length
        ? shown.map((tx) => renderTransactionItem(tx, false, { showDate: true })).join("")
        : `<li class="transaction-empty">📭 Tidak ada pengeluaran pada ${selected ? "tanggal ini" : "bulan ini"}.</li>`}
    </ul>
    ${all.length > DETAIL_LIST_LIMIT
      ? `<div class="list-more"><p class="list-more-note" ${analyticsPage.detailExpanded ? "hidden" : ""}>+ ${all.length - shown.length} transaksi lainnya</p><button type="button" class="btn btn--ghost btn--block" id="btn-detail-toggle" aria-expanded="${analyticsPage.detailExpanded}">${analyticsPage.detailExpanded ? "Ringkas kembali" : `Lihat semua (${all.length})`}</button></div>`
      : ""}
  `;
}

/** Daftar Insight Keuangan (bulan berjalan — terikat budget bulanan). */
function renderInsights() {
  const el = document.getElementById("insight-list");
  if (!el) return;
  el.innerHTML = getAnalyticsInsights()
    .map((ins) => `<li class="insight-item" data-level="${ins.level}">${ins.text}</li>`)
    .join("");
}

/** Render seluruh halaman Analisis dari rentang bulan berjalan. */
function renderAnalytics() {
  const range = getMonthRange(new Date());
  const buckets = getDayBuckets(range.from, range.to);
  if (analyticsPage.selectedKey && !buckets.some((b) => b.key === analyticsPage.selectedKey)) analyticsPage.selectedKey = null;
  renderAnalyticsSummary(range);
  renderTimeChart(range, buckets);
  renderCategoryChart(range);
  renderChartDetail(range, buckets);
  renderInsights();
}

/**
 * Kondisi keuangan, rule-based dari data aktual:
 *  🔴 danger  — total pengeluaran bulan ini sudah melewati total budget.
 *  🟡 warning — pengeluaran ≥ 80% budget, ATAU minggu ini naik ≥ 20%
 *               dibanding minggu lalu (dan minggu lalu bukan nol).
 *  🟢 safe    — selain itu.
 */
function getFinancialStatus() {
  const budget = financeData.budget.monthly;
  const used = getTotalUsed();
  const { thisWeek, lastWeek } = getWeeklyComparison();
  const weeklyRise = lastWeek > 0 ? (thisWeek - lastWeek) / lastWeek : 0;

  if (budget > 0 && used > budget) {
    return {
      key: "danger",
      title: "🔴 Budget bulan ini sudah terlewati",
      text: `Waduh, pengeluaran sudah ${formatRupiah(used)} dari budget ${formatRupiah(budget)} 😬 Saatnya rem pengeluaran dulu.`,
    };
  }
  if ((budget > 0 && used / budget >= 0.8) || weeklyRise >= 0.2) {
    const reason =
      weeklyRise >= 0.2
        ? `Pengeluaran minggu ini naik ${Math.round(weeklyRise * 100)}% dibanding minggu lalu.`
        : `Sudah ${Math.round((used / budget) * 100)}% dari budget bulan ini terpakai.`;
    return {
      key: "warning",
      title: "🟡 Mulai agak boros nih",
      text: `Hmm, ${reason} Coba cek lagi mana yang bisa ditahan 😅`,
    };
  }
  return {
    key: "safe",
    title: "🟢 Keuangan kamu masih aman!",
    text: budget > 0
      ? `Pengeluaran baru ${Math.round((used / budget) * 100)}% dari budget. Pertahankan pola seperti ini 💪`
      : "Belum ada budget yang diatur, tapi pengeluaranmu masih terkendali 💪",
  };
}

/**
 * Insight pengeluaran: kategori dengan perubahan terbesar minggu ini vs
 * minggu lalu. Kalau tidak ada dua minggu data yang bisa dibandingkan,
 * kembalikan fallback — jangan mengarang angka.
 */
function getSpendingInsight() {
  let best = null;
  Object.keys(financeData.categories).forEach((key) => {
    const { thisWeek, lastWeek } = getWeeklyComparison(key);
    if (lastWeek === 0 || thisWeek === 0) return; // perlu data di KEDUA minggu
    const change = (thisWeek - lastWeek) / lastWeek;
    if (!best || Math.abs(change) > Math.abs(best.change)) best = { key, change };
  });

  if (!best) return "💡 Belum cukup data untuk membuat perbandingan minggu ini.";

  const name = financeData.categories[best.key].name;
  const pct = Math.abs(Math.round(best.change * 100));
  const dir = best.change >= 0 ? "naik" : "turun";
  return `${getCategoryEmoji(best.key)} Pengeluaran ${name} minggu ini ${dir} ${pct}% dibanding minggu lalu.`;
}

/** Isi popup Financial Check-in dari data aktual (saldo, budget, goal, insight, status). */
function renderCheckin() {
  const body = document.getElementById("checkin-body");
  if (!body) return; // bukan di dashboard

  const { balance, income, expense } = financeData.summary;
  const budget = financeData.budget.monthly;
  const used = getTotalUsed();
  const budgetPct = budget > 0 ? (used / budget) * 100 : 0;
  const budgetStatus = getBudgetStatus(budgetPct);

  const { name, current, target } = financeData.goal;
  const goalPct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const goalRemaining = Math.max(target - current, 0);

  const status = getFinancialStatus();

  body.innerHTML = `
    <p class="checkin-greeting">👋 ${getGreetingWord()}, Rizqi!</p>
    <p class="checkin-sub">Yuk cek kondisi keuangan kamu hari ini.</p>

    <div class="checkin-hero">
      <span class="checkin-label">💰 Saldo saat ini</span>
      <span class="checkin-balance num">${formatRupiah(balance)}</span>
    </div>

    <div class="checkin-stats">
      <div class="checkin-stat checkin-stat--income">
        <span class="checkin-label">📈 Pemasukan</span>
        <span class="checkin-stat-value num">${formatRupiah(income)}</span>
      </div>
      <div class="checkin-stat checkin-stat--expense">
        <span class="checkin-label">📉 Pengeluaran</span>
        <span class="checkin-stat-value num">${formatRupiah(expense)}</span>
      </div>
    </div>

    <div class="checkin-block">
      <div class="checkin-row">
        <span class="checkin-label">🧾 Budget bulan ini</span>
        <span class="num">${budgetPct.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-bar-fill" data-status="${budgetStatus.key}" style="width:${Math.min(budgetPct, 100)}%"></div>
      </div>
      <div class="checkin-row checkin-row--muted">
        <span>Terpakai <strong class="num">${formatRupiah(used)}</strong> dari <strong class="num">${formatRupiah(budget)}</strong></span>
      </div>
    </div>

    <div class="checkin-block checkin-block--goal">
      <div class="checkin-row">
        <span class="checkin-label">🎯 Goal ${name} <span class="demo-tag">contoh</span></span>
        <span class="num">${goalPct.toLocaleString("id-ID", { maximumFractionDigits: 0 })}% tercapai</span>
      </div>
      <div class="progress-bar progress-bar--goal">
        <div class="progress-bar-fill" style="width:${goalPct}%"></div>
      </div>
      <div class="checkin-row checkin-row--muted">
        <span><strong class="num">${formatRupiah(current)}</strong> / <strong class="num">${formatRupiah(target)}</strong></span>
        <span>${current >= target ? "Tercapai 🎉" : `Sisa <strong class="num">${formatRupiah(goalRemaining)}</strong>`}</span>
      </div>
    </div>

    <p class="checkin-insight">${getSpendingInsight()}</p>

    <div class="checkin-status" data-status="${status.key}">
      <strong class="checkin-status-title">${status.title}</strong>
      <span class="checkin-status-text">${status.text}</span>
    </div>
  `;
}

/** Render murni: cetak <li> transaksi ke dalam container manapun (dipakai
 * ulang oleh daftar utama di dashboard maupun halaman "Semua Transaksi").
 * options.showActions: tampilkan tombol edit/delete (hanya di halaman
 * Semua Transaksi; dashboard bersifat preview, tanpa aksi). */
function renderTransactionListItems(listEl, transactions, options = {}) {
  const { showActions = false } = options;
  if (!transactions.length) {
    // Daftar ini (dashboard maupun modal "Semua Transaksi") tidak pernah
    // tersaring kategori lagi, jadi kosong = benar-benar belum ada data —
    // pesannya mengarahkan user untuk mencatat, bukan sekadar "kosong".
    listEl.innerHTML = `<li class="transaction-empty">Belum ada transaksi. Tap "Tambah Transaksi" untuk mencatat yang pertama.</li>`;
    return;
  }

  // Dikelompokkan per hari; tiap kelompok diawali satu <li> label kecil
  // ("Hari ini" / "Kemarin" / "5 Sep 2026"). Sengaja tetap "rata" di dalam
  // <ul> yang sama (bukan <ul> bersarang) supaya delegasi klik tombol
  // edit/delete di parent list tetap bekerja apa adanya.
  listEl.innerHTML = groupTransactionsByDay(transactions)
    .map(
      (group) => `
        <li class="transaction-day-label">${group.label}</li>
        ${group.items.map((tx) => renderTransactionItem(tx, showActions)).join("")}
      `
    )
    .join("");
}

/** Markup satu card transaksi: emoji kategori (💰 untuk pemasukan),
 * judul + kategori (jam hanya ikut tampil di desktop lewat CSS — datanya
 * tetap satu, bukan duplikat markup), nominal, dan — hanya kalau
 * showActions — tombol edit/delete. */
function renderTransactionItem(tx, showActions = false, options = {}) {
  const { sign, amountClass } = getTransactionAmountMeta(tx.type);
  const categoryLabel = getCategoryLabel(tx.category);
  const timeLabel = getTransactionTimeLabel(tx);
  const timeMarkup = timeLabel ? `<span class="transaction-time"> · ${timeLabel}</span>` : "";
  // showDate: tanggal ikut di baris meta (dipakai card detail di halaman
  // Analisis yang daftarnya bisa lintas tanggal; di daftar lain tanggal
  // sudah jadi judul kelompok/kalender).
  const dateMarkup = options.showDate && tx.isoDate ? `<span class="transaction-date"> · ${formatDateID(tx.isoDate)}</span>` : "";
  const actionsMarkup = showActions
    ? `
        <div class="transaction-actions">
          <button type="button" class="icon-btn-sm" data-action="edit" data-id="${tx.id}" aria-label="Edit transaksi ${tx.title}">${ICON_EDIT}</button>
          <button type="button" class="icon-btn-sm" data-action="delete" data-id="${tx.id}" aria-label="Hapus transaksi ${tx.title}">${ICON_DELETE}</button>
        </div>`
    : "";

  return `
    <li class="transaction-item ${showActions ? "transaction-item--actions" : ""}" data-id="${tx.id}">
      <span class="transaction-icon transaction-icon--${tx.type}" aria-hidden="true">${getTransactionEmoji(tx)}</span>
      <div class="transaction-info">
        <span class="transaction-title">${tx.title}</span>
        <span class="transaction-meta">${categoryLabel}${dateMarkup}${timeMarkup}</span>
      </div>
      <div class="transaction-right">
        <span class="transaction-amount ${amountClass}">${sign} ${formatRupiah(tx.amount)}</span>${actionsMarkup}
      </div>
    </li>
  `;
}

/**
 * 8. Recent Transactions (dashboard utama).
 * Hanya menampilkan maksimal TRANSACTION_LIST_LIMIT transaksi terbaru
 * (menghormati kategori aktif), dan menampilkan/menyembunyikan
 * link "Lihat semua" sesuai jumlah transaksi yang tersisa.
 */
function renderRecentTransactions() {
  // SELALU seluruh transaksi dari semua kategori — daftar ini sengaja TIDAK
  // terikat pada kategori yang sedang aktif di carousel Analisis Kategori.
  // Dulu sempat tersaring per kategori, tapi itu membuat user kehilangan
  // cara melihat transaksi terbarunya secara utuh: swipe ke kategori yang
  // belum ada transaksinya bikin daftar ini kosong padahal datanya ada.
  const listEl = document.getElementById("transaction-list");
  if (!listEl) return; // bukan di dashboard (mis. halaman Semua Transaksi)

  const sorted = getSortedTransactions(financeData.transactions);
  const limited = sorted.slice(0, TRANSACTION_LIST_LIMIT);

  // Preview saja: tanpa tombol edit/delete (aksi ada di transactions.html).
  renderTransactionListItems(listEl, limited);

  // Link "Lihat semua" (menuju transactions.html) muncul kalau masih ada
  // transaksi yang tidak kebagian tempat di dashboard (dibatasi
  // TRANSACTION_LIST_LIMIT).
  const seeAllLink = document.getElementById("btn-see-all-transactions");
  seeAllLink.hidden = sorted.length <= limited.length;
}

// State halaman Semua Transaksi.
//  - year/month/selected/expanded : mode kalender V1 (tidak berubah).
//  - search/type/category/from/to/sort/filterOpen : lapisan cari & filter V2.1.
// State filter sengaja HANYA di memori (tidak dipersist ke localStorage):
// filter adalah cara melihat data, bukan data itu sendiri.
const transactionsPage = (() => {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth(),
    selected: toIsoDate(today),
    expanded: false,
    search: "",
    type: "all",
    category: "all",
    from: "",
    to: "",
    sort: "newest",
    filterOpen: false,
  };
})();

// Maksimal transaksi yang ditampilkan per tanggal sebelum "Lihat semua transaksi".
const DATE_LIST_LIMIT = 3;

/** Jumlah transaksi (semua jenis) per tanggal — untuk titik indikator kalender. */
function countTransactionsByDate() {
  const counts = {};
  financeData.transactions.forEach((tx) => {
    if (tx.isoDate) counts[tx.isoDate] = (counts[tx.isoDate] || 0) + 1;
  });
  return counts;
}

/** Kalender bulan custom (transactions.html): 6 baris x 7 kolom, mulai
 * Senin. Tanggal di luar bulan tetap ditampilkan (redup) dan bisa dipilih. */
function renderCalendar() {
  const el = document.getElementById("calendar");
  if (!el) return;
  const { year, month, selected } = transactionsPage;
  const counts = countTransactionsByDate();
  const todayIso = toIsoDate(new Date());

  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toIsoDate(d);
    const count = counts[iso] || 0;
    const classes = ["calendar-day"];
    if (d.getMonth() !== month) classes.push("is-outside");
    if (iso === todayIso) classes.push("is-today");
    if (iso === selected) classes.push("is-selected");
    if (count) classes.push("has-tx");
    const label = `${formatDateLongID(iso)}${count ? `, ${count} transaksi` : ""}${iso === todayIso ? ", hari ini" : ""}`;
    cells.push(
      `<button type="button" class="${classes.join(" ")}" data-date="${iso}" aria-label="${label}" aria-pressed="${iso === selected}">${d.getDate()}${count ? '<span class="calendar-dot" aria-hidden="true"></span>' : ""}</button>`
    );
  }

  el.innerHTML = `
    <div class="calendar-head">
      <button type="button" class="calendar-nav" data-cal-nav="-1" aria-label="Bulan sebelumnya">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <span class="calendar-title" aria-live="polite">${NAMA_BULAN_PANJANG_ID[month]} ${year}</span>
      <button type="button" class="calendar-nav" data-cal-nav="1" aria-label="Bulan berikutnya">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
    <div class="calendar-weekdays" aria-hidden="true">
      ${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((w) => `<span>${w}</span>`).join("")}
    </div>
    <div class="calendar-grid" role="grid" aria-label="Pilih tanggal">${cells.join("")}</div>
  `;
}

/* ---------- V2.1: cari, filter, dan urutkan daftar transaksi ----------
   Semua fungsi di bawah HANYA membaca financeData.transactions dan
   mengembalikan salinan; data asli tidak pernah diubah. */

/** Filter dianggap aktif kalau salah satu dari search/jenis/kategori/rentang
 * tanggal dipakai. Urutan (sort) SENGAJA tidak dihitung: mengganti urutan
 * tidak mengubah transaksi mana yang tampil, jadi kalender tetap dipakai. */
function hasActiveFilter() {
  const { search, type, category, from, to } = transactionsPage;
  return Boolean(search.trim() || type !== "all" || category !== "all" || from || to);
}

/** Mode filter = panel "Filter & Urutkan" sedang dibuka ATAU ada filter yang
 * terisi. Begitu panel dibuka, halaman langsung beralih ke mode ini
 * (kalender disembunyikan, daftar = hasil dari seluruh transaksi) tanpa
 * menunggu user mengisi apa pun. Keluar dari mode ini lewat "Hapus Filter"
 * (atau menutup panel selagi belum ada filter yang terisi). */
function isFilterMode() {
  return transactionsPage.filterOpen || hasActiveFilter();
}

// Label singkat urutan non-default untuk filter-bar (default "newest" tidak diberi label).
const SORT_LABELS = { oldest: "Terlama", highest: "Nominal terbesar", lowest: "Nominal terkecil" };

/** Seluruh transaksi yang lolos filter aktif (tanpa batas tanggal kalender).
 * Pencarian mencocokkan nama transaksi saja — kategori sudah punya filternya
 * sendiri, jadi tidak perlu ikut dicocokkan di sini. */
function getFilteredTransactions() {
  const { search, type, category, from, to } = transactionsPage;
  const query = search.trim().toLowerCase();
  return financeData.transactions.filter((tx) => {
    if (type !== "all" && tx.type !== type) return false;
    if (category !== "all") {
      // Transaksi yang kategorinya sudah dihapus user dianggap "lainnya",
      // sama seperti tampilannya di kartu transaksi.
      const key = financeData.categories[tx.category] ? tx.category : FALLBACK_CATEGORY.key;
      if (key !== category) return false;
    }
    if (from && (!tx.isoDate || tx.isoDate < from)) return false;
    if (to && (!tx.isoDate || tx.isoDate > to)) return false;
    if (query && !String(tx.title || "").toLowerCase().includes(query)) return false;
    return true;
  });
}

/** Salinan terurut sesuai pilihan user. "newest" memakai getSortedTransactions()
 * yang sudah dipakai V1 supaya urutan default persis sama. */
function sortTransactions(list, mode) {
  if (mode === "oldest") {
    return [...list].sort((a, b) => (a.isoDate || "").localeCompare(b.isoDate || "") || a.id - b.id);
  }
  if (mode === "highest") {
    return [...list].sort((a, b) => b.amount - a.amount || (b.isoDate || "").localeCompare(a.isoDate || ""));
  }
  if (mode === "lowest") {
    return [...list].sort((a, b) => a.amount - b.amount || (b.isoDate || "").localeCompare(a.isoDate || ""));
  }
  return getSortedTransactions(list);
}

/** Halaman "Semua Transaksi" (transactions.html). Dua mode:
 *  - MODE KALENDER (perilaku V1): kalender + transaksi pada tanggal terpilih
 *    saja, maks. DATE_LIST_LIMIT dengan tombol "Lihat semua transaksi".
 *  - MODE FILTER (V2.1, aktif begitu panel dibuka — lihat isFilterMode()):
 *    kalender disembunyikan, daftar menampilkan seluruh hasil filter (tanpa
 *    dipotong) + jumlah hasil; tanpa filter terisi = seluruh transaksi.
 * Dipanggil ulang setelah CRUD supaya titik indikator & daftar tetap sinkron. */
function renderAllTransactionsList() {
  const listEl = document.getElementById("all-transaction-list");
  if (!listEl) return; // bukan di halaman Semua Transaksi

  const filterActive = isFilterMode();
  const calendarSection = document.querySelector(".calendar-section");
  if (calendarSection) calendarSection.hidden = filterActive;
  // Kalender hanya perlu dirender saat benar-benar tampil.
  if (!filterActive) renderCalendar();

  const { selected, expanded, sort } = transactionsPage;
  const base = filterActive
    ? getFilteredTransactions()
    : financeData.transactions.filter((tx) => tx.isoDate === selected);
  const all = sortTransactions(base, sort);
  const shown = filterActive || expanded ? all : all.slice(0, DATE_LIST_LIMIT);

  // Jumlah hasil filter hanya ditampilkan di sini (hint di samping judul
  // "Hasil Filter"), tidak diulang di filter-bar. aria-live="polite" pada
  // hint membuat perubahan jumlah tetap terbaca screen reader.
  const title = document.getElementById("selected-date-title");
  const hint = document.getElementById("selected-date-hint");
  if (title) title.textContent = filterActive ? "Hasil Filter" : formatDateLongID(selected);
  if (hint) {
    if (filterActive) {
      hint.textContent = `${all.length} transaksi`;
    } else {
      const label = getDayLabel(selected);
      hint.textContent = label === "Hari ini" || label === "Kemarin" ? label : "";
    }
    hint.hidden = !hint.textContent;
  }

  const emptyText = !filterActive
    ? "📭 Tidak ada transaksi pada tanggal ini."
    : hasActiveFilter()
      ? "🔍 Tidak ada transaksi yang cocok. Coba ubah kata kunci atau hapus filter."
      : "📭 Belum ada transaksi yang tercatat.";
  // Mode filter: hasil lintas tanggal, jadi tiap card ikut menampilkan
  // tanggalnya (showDate). Mode kalender: tanggal sudah jadi judul daftar.
  // Empty state mode filter membawa tombol Hapus Filter sendiri supaya
  // tetap terjangkau walau panel filter sedang terbuka di atasnya.
  const emptyMarkup = filterActive
    ? `<li class="transaction-empty">${emptyText}<button type="button" class="btn btn--ghost btn--xs" data-filter-reset>Hapus Filter</button></li>`
    : `<li class="transaction-empty">${emptyText}</li>`;
  listEl.innerHTML = all.length
    ? shown.map((tx) => renderTransactionItem(tx, true, { showDate: filterActive })).join("")
    : emptyMarkup;

  const more = document.getElementById("transaction-list-more");
  if (more) {
    // Blok "Lihat semua transaksi" milik mode kalender; di mode filter seluruh
    // hasil sudah ditampilkan sehingga blok ini disembunyikan.
    const hiddenCount = all.length - shown.length;
    more.hidden = filterActive || all.length <= DATE_LIST_LIMIT;
    const note = document.getElementById("transaction-list-more-note");
    note.hidden = expanded;
    note.textContent = `+ ${hiddenCount} transaksi lainnya`;
    const toggle = document.getElementById("btn-toggle-all");
    toggle.textContent = expanded ? "Ringkas kembali" : "Lihat semua transaksi";
    toggle.setAttribute("aria-expanded", String(expanded));
  }

  syncFilterControls();
}

/** Sinkronkan tampilan kontrol filter dengan state (dipanggil tiap render). */
function syncFilterControls() {
  const clearBtn = document.getElementById("btn-clear-filter");
  if (!clearBtn) return; // halaman ini tidak punya panel filter
  const active = isFilterMode();
  clearBtn.hidden = !active;

  // Panel & tombolnya mengikuti state (bukan di-toggle langsung di handler),
  // supaya clearFilters() yang mengeset filterOpen=false ikut menutupnya.
  const panel = document.getElementById("filter-panel");
  const toggleBtn = document.getElementById("btn-filter-toggle");
  panel.hidden = !transactionsPage.filterOpen;
  toggleBtn.setAttribute("aria-expanded", String(transactionsPage.filterOpen));

  // Urutan non-default ditandai secara eksplisit, bukan diam-diam. (Tombol
  // "Filter & Urutkan" sendiri sengaja tanpa badge angka.)
  const sortLabel = document.getElementById("filter-sort-label");
  const sortText = SORT_LABELS[transactionsPage.sort];
  sortLabel.hidden = !sortText;
  sortLabel.textContent = sortText ? `Urut: ${sortText}` : "";

  const searchInput = document.getElementById("tx-search");
  if (searchInput.value !== transactionsPage.search) searchInput.value = transactionsPage.search;
  document.getElementById("tx-search-clear").hidden = !transactionsPage.search;

  document.querySelectorAll("#filter-panel [data-filter-type]").forEach((chip) => {
    const on = chip.dataset.filterType === transactionsPage.type;
    chip.classList.toggle("is-active", on);
    chip.setAttribute("aria-pressed", String(on));
  });
}

/** Kontrol cari, filter, dan urutkan (V2.1) di halaman Semua Transaksi.
 * Semuanya hanya mengubah transactionsPage lalu merender ulang daftar —
 * tidak ada perubahan pada data transaksi maupun localStorage. */
function setupTransactionFilters() {
  const panel = document.getElementById("filter-panel");
  if (!panel) return; // bukan di halaman Semua Transaksi

  const searchInput = document.getElementById("tx-search");
  const categorySelect = document.getElementById("filter-category");
  const fromInput = document.getElementById("filter-from");
  const toInput = document.getElementById("filter-to");
  const sortSelect = document.getElementById("filter-sort");
  const toggleBtn = document.getElementById("btn-filter-toggle");

  // Opsi kategori mengikuti kategori user (+ cadangan "Lainnya"), sama
  // seperti form transaksi supaya pilihannya konsisten.
  const options = Object.entries(financeData.categories).map(
    ([key, cat]) => `<option value="${key}">${cat.emoji} ${cat.name}</option>`
  );
  if (!financeData.categories[FALLBACK_CATEGORY.key]) {
    options.push(`<option value="${FALLBACK_CATEGORY.key}">${FALLBACK_CATEGORY.emoji} ${FALLBACK_CATEGORY.name}</option>`);
  }
  categorySelect.innerHTML = `<option value="all">Semua kategori</option>${options.join("")}`;

  /** Ganti state lalu render ulang. Pilihan tanggal kalender tidak diubah,
   * jadi menghapus filter mengembalikan tampilan persis seperti sebelumnya. */
  function update(patch) {
    Object.assign(transactionsPage, patch);
    renderAllTransactionsList();
  }

  searchInput.addEventListener("input", () => update({ search: searchInput.value }));
  document.getElementById("tx-search-clear").addEventListener("click", () => {
    searchInput.value = "";
    update({ search: "" });
    searchInput.focus();
  });

  panel.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter-type]");
    if (chip) update({ type: chip.dataset.filterType });
  });

  categorySelect.addEventListener("change", () => update({ category: categorySelect.value }));
  sortSelect.addEventListener("change", () => update({ sort: sortSelect.value }));

  // Rentang tanggal: kalau user membalik urutannya, tukar supaya tidak
  // menghasilkan daftar kosong yang membingungkan.
  function onRangeChange() {
    let from = fromInput.value;
    let to = toInput.value;
    if (from && to && from > to) {
      [from, to] = [to, from];
      fromInput.value = from;
      toInput.value = to;
    }
    update({ from, to });
  }
  fromInput.addEventListener("change", onRangeChange);
  toInput.addEventListener("change", onRangeChange);

  // Membuka panel = masuk mode filter (kalender langsung disembunyikan,
  // walau belum ada yang diisi). Menutup panel selagi belum ada filter
  // terisi = kembali ke mode kalender; kalau ada yang terisi, hasil tetap
  // tampil dan keluar lewat "Hapus Filter".
  toggleBtn.addEventListener("click", () => update({ filterOpen: !transactionsPage.filterOpen }));

  /** Satu-satunya mekanisme reset: dipakai tombol "Hapus Filter" di
   * filter-bar dan tombol yang sama di empty state hasil filter. */
  function clearFilters() {
    searchInput.value = "";
    categorySelect.value = "all";
    fromInput.value = "";
    toInput.value = "";
    sortSelect.value = "newest";
    // filterOpen: false -> keluar dari mode filter; kalender muncul kembali
    // dengan tanggal terpilih yang sama seperti sebelumnya (tidak disentuh).
    update({ search: "", type: "all", category: "all", from: "", to: "", sort: "newest", filterOpen: false });
  }
  document.getElementById("btn-clear-filter").addEventListener("click", clearFilters);
  // Empty state dirender ulang tiap kali, jadi didelegasikan ke <ul>-nya.
  // Atribut data-filter-reset (bukan data-action) supaya tidak bersinggungan
  // dengan handler edit/hapus transaksi di daftar yang sama.
  document.getElementById("all-transaction-list").addEventListener("click", (e) => {
    if (e.target.closest("[data-filter-reset]")) clearFilters();
  });
}

/** Interaksi kalender & tombol perluas/ringkas di halaman Semua Transaksi. */
function setupCalendar() {
  const el = document.getElementById("calendar");
  if (!el) return;

  el.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-cal-nav]");
    if (nav) {
      const d = new Date(transactionsPage.year, transactionsPage.month + Number(nav.dataset.calNav), 1);
      transactionsPage.year = d.getFullYear();
      transactionsPage.month = d.getMonth();
      renderCalendar();
      return;
    }
    const day = e.target.closest(".calendar-day");
    if (!day) return;
    const iso = day.dataset.date;
    if (iso !== transactionsPage.selected) transactionsPage.expanded = false;
    transactionsPage.selected = iso;
    // Tanggal di luar bulan yang ditampilkan: pindahkan kalender ke bulan itu.
    const d = new Date(`${iso}T00:00:00`);
    transactionsPage.year = d.getFullYear();
    transactionsPage.month = d.getMonth();
    renderAllTransactionsList();
  });

  document.getElementById("btn-toggle-all").addEventListener("click", () => {
    transactionsPage.expanded = !transactionsPage.expanded;
    renderAllTransactionsList();
  });
}

/**
 * 10. Dropdown Notifikasi (header).
 * Render list ke #notification-list dan toggle dot indikator (#notification-dot)
 * berdasarkan ada/tidaknya notifikasi dengan read: false.
 */
function renderNotifications() {
  const listEl = document.getElementById("notification-list");
  const dot = document.getElementById("notification-dot");
  const notifications = financeData.notifications;

  if (!notifications.length) {
    listEl.innerHTML = `<li class="notification-empty">Belum ada notifikasi.</li>`;
  } else {
    listEl.innerHTML = notifications
      .map(
        (n) => `
          <li class="notification-item ${n.read ? "" : "is-unread"}">
            <span class="notification-item-dot" aria-hidden="true"></span>
            <div class="notification-item-body">
              <span class="notification-item-title">${n.title}</span>
              <span class="notification-item-time">${n.time}</span>
            </div>
          </li>
        `
      )
      .join("");
  }

  // Penanda: notifikasi masih contoh/demo (mock statis), bukan dari data
  // transaksi user. Dihapus saat notifikasi sudah dihitung dari data nyata.
  if (notifications.length) {
    listEl.insertAdjacentHTML("beforeend", `<li class="notification-demo">Contoh notifikasi — belum terhubung ke data kamu.</li>`);
  }

  dot.hidden = !notifications.some((n) => !n.read);
}

/* =========================================================
   4. EVENT HANDLERS
   ========================================================= */

// Diisi oleh setupTransactionModal() — dipakai ulang oleh modal "Semua
// Transaksi" supaya tombol edit di sana bisa membuka modal edit yang sama.
let openTransactionModal = () => {};

// Diisi oleh setupTransactionModal() kalau halaman punya markup modal
// konfirmasi (#confirm-modal-overlay). Dipakai supaya hapus transaksi memakai
// popup yang sama gayanya dengan hapus kategori, bukan window.confirm bawaan.
let confirmDeleteTransaction = null;

/** Handler bersama untuk tombol edit/delete di daftar transaksi manapun. */
function handleTransactionListClick(e) {
  const button = e.target.closest("[data-action]");
  if (!button) return;

  const id = Number(button.dataset.id);
  const tx = financeData.transactions.find((item) => item.id === id);
  if (!tx) return;

  if (button.dataset.action === "edit") {
    openTransactionModal("edit", tx);
  } else if (button.dataset.action === "delete") {
    const removeTransaction = () => {
      financeData.transactions = financeData.transactions.filter((item) => item.id !== id);
      refreshDashboard();
    };
    if (confirmDeleteTransaction) {
      confirmDeleteTransaction(tx, removeTransaction);
    } else if (window.confirm(`Hapus transaksi "${tx.title}"?`)) {
      // Cadangan untuk halaman tanpa markup modal konfirmasi.
      removeTransaction();
    }
  }
}

/**
 * Dropdown Notifikasi & Pengaturan di header.
 * Setiap dropdown = { trigger, panel } — trigger toggle panelnya sendiri,
 * klik di luar wrapper mana pun (atau tombol Escape) menutup semua panel.
 */
function setupHeaderActions() {
  const dropdowns = [
    { trigger: document.getElementById("btn-notification"), panel: document.getElementById("notification-panel") },
    { trigger: document.getElementById("btn-settings"), panel: document.getElementById("settings-panel") },
  ];

  // Dicatat saat panel dibuka; dipakai listener scroll di bawah supaya panel
  // tidak langsung tertutup oleh scroll yang terjadi tepat saat membuka.
  let openedAt = 0;
  let openedScrollY = 0;

  function openPanel(panel, trigger) {
    openedAt = performance.now();
    openedScrollY = window.scrollY;
    // Kalau panel ini masih di tengah animasi keluar, batalkan dulu supaya
    // tidak ada timer lama yang menyembunyikannya sesaat setelah dibuka.
    clearTimeout(panel._closeTimer);
    panel.classList.remove("is-closing");
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    // Sama seperti modal (lihat requestAnimationFrame bersarang di
    // setupTransactionModal): pastikan frame "hidden baru dilepas" sempat
    // digambar dulu sebelum class is-open ditambahkan, supaya transisi
    // fade + translateY tidak terlewat.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => panel.classList.add("is-open"));
    });
  }

  // Tutup dengan animasi keluar dulu (fade + naik sedikit + mengecil, lihat
  // .dropdown-panel.is-closing di CSS, ~220ms), baru display:none. Panel
  // yang sedang menutup dibiarkan menyelesaikan animasinya (tidak di-reset)
  // supaya tidak berkedip kalau scroll memicu closeAllPanels() berkali-kali.
  const PANEL_CLOSE_MS = 220;
  function closePanel(panel, trigger) {
    if (panel.hidden || panel.classList.contains("is-closing")) return;
    panel.classList.remove("is-open");
    panel.classList.add("is-closing");
    trigger.setAttribute("aria-expanded", "false");
    const finish = () => {
      clearTimeout(panel._closeTimer);
      panel.removeEventListener("transitionend", onEnd);
      if (!panel.classList.contains("is-closing")) return; // dibuka lagi di tengah animasi
      panel.classList.remove("is-closing");
      panel.hidden = true;
    };
    const onEnd = (e) => {
      if (e.target === panel && e.propertyName === "opacity") finish();
    };
    panel.addEventListener("transitionend", onEnd);
    // Cadangan kalau transitionend tidak pernah datang (mis. tab di
    // background / reduced-motion): sembunyikan sedikit setelah durasinya.
    panel._closeTimer = setTimeout(finish, PANEL_CLOSE_MS + 60);
  }

  function closeAllPanels() {
    dropdowns.forEach(({ trigger, panel }) => closePanel(panel, trigger));
  }

  dropdowns.forEach(({ trigger, panel }) => {
    trigger.addEventListener("click", (e) => {
      // Tanpa ini, klik pada tombol trigger akan "bubbling" sampai ke
      // listener document di bawah dan langsung dianggap "klik di luar",
      // sehingga panel yang baru saja dibuka langsung tertutup lagi.
      e.stopPropagation();

      // Panel yang sedang menjalankan animasi keluar dianggap tertutup:
      // tap ikon saat itu membukanya kembali, bukan "menutup" lagi.
      const isOpen = !panel.hidden && !panel.classList.contains("is-closing");
      closeAllPanels();
      if (isOpen) return; // sudah terbuka -> toggle jadi tertutup

      openPanel(panel, trigger);

      // Saat panel notifikasi baru dibuka: tandai semua sebagai sudah dibaca,
      // lalu render ulang supaya dot indikator hilang.
      if (panel === document.getElementById("notification-panel")) {
        financeData.notifications.forEach((n) => (n.read = true));
        renderNotifications();
      }
    });
  });

  // Klik di luar .dropdown-wrapper manapun -> tutup semua panel.
  document.addEventListener("click", (e) => {
    if (e.target.closest(".dropdown-wrapper")) return;
    closeAllPanels();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllPanels();
  });

  // Scroll halaman -> tutup panel yang sedang terbuka (animasi close yang
  // sama, 180-200ms). Hanya scroll WINDOW yang dihitung: event scroll tidak
  // bubbling, jadi scroll di dalam .notification-list (yang punya scroll
  // internal sendiri) tidak pernah sampai ke listener ini. Dua pengaman
  // supaya panel tidak berkedip/langsung tertutup:
  //  - ambang 8px: getaran atau penyesuaian layout kecil bukan scroll user,
  //  - jeda 150ms setelah dibuka: scroll yang terjadi bersamaan dengan
  //    pembukaan panel diabaikan.
  // { passive: true } supaya browser tidak menunggu handler ini sebelum
  // menggulir — gesture scroll di HP tetap ringan.
  const SCROLL_CLOSE_THRESHOLD = 8;
  const SCROLL_CLOSE_GRACE_MS = 150;
  // "Terbuka" = tampil dan tidak sedang menjalankan animasi keluar; panel
  // yang sudah is-closing dibiarkan menyelesaikan animasinya.
  const isAnyPanelOpen = () => dropdowns.some(({ panel }) => !panel.hidden && !panel.classList.contains("is-closing"));
  window.addEventListener(
    "scroll",
    () => {
      if (!isAnyPanelOpen()) return;
      if (performance.now() - openedAt < SCROLL_CLOSE_GRACE_MS) return;
      if (Math.abs(window.scrollY - openedScrollY) < SCROLL_CLOSE_THRESHOLD) return;
      closeAllPanels();
    },
    { passive: true }
  );

  // iOS Safari: event scroll bisa datang terlambat/jarang selama jari masih
  // menyentuh layar, sehingga panel terkesan "diam lalu tiba-tiba hilang".
  // Gesture geser di luar panel (>= ambang yang sama) langsung memulai
  // animasi keluar, sehingga panel terlihat menutup seiring gerakan jari.
  // Sentuhan yang dimulai DI DALAM panel tidak dihitung (scroll daftar
  // notifikasi / interaksi di panel tidak menutupnya). Semua passive.
  let touchStartY = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      touchStartY = e.target.closest(".dropdown-panel") ? null : e.touches[0].clientY;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (touchStartY === null || !isAnyPanelOpen()) return;
      if (performance.now() - openedAt < SCROLL_CLOSE_GRACE_MS) return;
      if (Math.abs(e.touches[0].clientY - touchStartY) < SCROLL_CLOSE_THRESHOLD) return;
      closeAllPanels();
    },
    { passive: true }
  );

  // Menu pengaturan. V1: hanya "Preferensi Kategori" yang punya tujuan
  // (budget.html). "Profil" & "Tentang Aplikasi" belum punya fitur — item-nya
  // disembunyikan sementara di index.html (atribut hidden), logikanya
  // dipertahankan di sini supaya tinggal ditampilkan lagi saat siap.
  const SETTINGS_TARGET = { "preferensi-kategori": "budget.html" };
  document.querySelectorAll(".settings-menu-item").forEach((item) => {
    item.addEventListener("click", () => {
      const target = SETTINGS_TARGET[item.dataset.setting];
      closeAllPanels();
      if (target) window.location.href = target;
      // TODO: profil & tentang-aplikasi — arahkan ke halamannya saat fitur tersedia
    });
  });
}

/** Fitur hide/show Saldo Anda — default tersembunyi, toggle via icon mata. */
function setupBalanceToggle() {
  document.getElementById("btn-toggle-balance").addEventListener("click", () => {
    setBalanceVisible(!isBalanceVisible);
  });
}

/**
 * Modal Tambah/Edit Transaksi + CRUD di memori (financeData.transactions).
 * Belum ada backend: add/edit/delete hanya mengubah array di memori,
 * lalu memicu refreshDashboard() supaya summary & analisis kategori ikut update.
 */
function setupTransactionModal() {
  const overlay = document.getElementById("transaction-modal-overlay");
  const modalEntry = { close: () => closeModal() };
  const modalTitle = document.getElementById("modal-title");
  const submitBtn = document.getElementById("modal-submit");
  const form = document.getElementById("transaction-form");
  const typeToggle = document.getElementById("type-toggle");
  const typeIndicator = document.getElementById("type-toggle-indicator");
  const typeButtons = typeToggle.querySelectorAll(".type-toggle-btn");

  const fieldId = document.getElementById("field-id");
  const fieldTitle = document.getElementById("field-title");
  const fieldCategory = document.getElementById("field-category");
  const fieldAmount = document.getElementById("field-amount");
  const fieldDate = document.getElementById("field-date");

  // Opsi kategori mengikuti financeData.categories (bisa diubah user di
  // analytics.html) + "Lainnya" sebagai cadangan. Dibangun ulang tiap modal
  // dibuka supaya selalu sinkron; <option> statis di HTML cuma placeholder.
  function populateCategoryOptions(selected) {
    const options = Object.entries(financeData.categories).map(
      ([key, cat]) => `<option value="${key}">${cat.emoji} ${cat.name}</option>`
    );
    if (!financeData.categories[FALLBACK_CATEGORY.key]) {
      options.push(`<option value="${FALLBACK_CATEGORY.key}">${FALLBACK_CATEGORY.emoji} ${FALLBACK_CATEGORY.name}</option>`);
    }
    fieldCategory.innerHTML = `<option value="" disabled ${selected ? "" : "selected"}>Pilih kategori</option>${options.join("")}`;
    if (selected) {
      // Kategori transaksi lama yang sudah dihapus user -> tampil sebagai Lainnya.
      fieldCategory.value = financeData.categories[selected] ? selected : FALLBACK_CATEGORY.key;
    }
  }

  function getSelectedType() {
    return typeToggle.querySelector(".type-toggle-btn.is-active").dataset.type;
  }

  /** Tandai tombol yang jadi kandidat aktif (warna teks) — dipisah dari
   * setSelectedType() karena selama drag ini perlu update "live" mengikuti
   * jari tanpa ikut memaksa indikator snap ke posisi tombol (lihat pointermove). */
  function markActiveButton(btn) {
    typeButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
  }

  /** Pindahkan pil putih (.type-toggle-indicator) persis menutupi `btn`,
   * dihitung dari offsetLeft/offsetWidth tombol itu (posisinya relatif ke
   * .type-toggle yang position:relative). animate:false dipakai saat modal
   * baru dibuka supaya indikator langsung "teleport" ke tempatnya tanpa
   * animasi nyelonong dari posisi lama/default. */
  function positionIndicator(btn, { animate = true } = {}) {
    if (!btn) return;
    if (!animate) typeIndicator.classList.add("no-transition");
    typeIndicator.style.left = `${btn.offsetLeft}px`;
    typeIndicator.style.width = `${btn.offsetWidth}px`;
    if (!animate) {
      // Paksa reflow supaya posisi baru "dibekukan" dulu tanpa transisi,
      // baru lepas .no-transition di frame berikutnya — supaya perubahan
      // berikutnya (tap/drag ke opsi lain) kembali animasi seperti biasa.
      void typeIndicator.offsetWidth;
      requestAnimationFrame(() => typeIndicator.classList.remove("no-transition"));
    }
  }

  /** Set opsi jenis transaksi yang aktif: update warna teks tombol + pindahkan
   * indikator ke posisi finalnya (dengan animasi snap, kecuali animate:false). */
  function setSelectedType(type, opts = {}) {
    const btn = typeToggle.querySelector(`.type-toggle-btn[data-type="${type}"]`);
    markActiveButton(btn);
    positionIndicator(btn, opts);
  }

  /** Cari tombol dengan titik tengah paling dekat ke koordinat x (relatif
   * ke sisi kiri .type-toggle, satuan sama dengan offsetLeft). */
  function findClosestButton(x) {
    let closest = typeButtons[0];
    let closestDistance = Infinity;
    typeButtons.forEach((btn) => {
      const center = btn.offsetLeft + btn.offsetWidth / 2;
      const distance = Math.abs(center - x);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = btn;
      }
    });
    return closest;
  }

  // --- Drag indikator lewat Pointer Events (mouse/touch/pen seragam) ---
  // dragPointerId dipakai supaya cuma pointer yang memulai gerakan yang
  // diikuti (abaikan pointer lain yang numpang lewat, mis. jari kedua).
  let dragPointerId = null;
  let dragContainerLeft = 0;
  let dragContainerWidth = 0;
  let dragStartX = 0;
  let isDragging = false;

  // Pointer harus bergerak sejauh ini dulu baru dianggap "drag". Tanpa
  // ambang ini, tap biasa pun langsung memindahkan indikator ke bawah jari
  // (teleport tanpa animasi) — padahal tap seharusnya membuat indikator
  // meluncur halus ke tombol yang di-tap.
  const DRAG_THRESHOLD_PX = 4;

  function updateDragPosition(clientX) {
    const x = clientX - dragContainerLeft;
    const indicatorWidth = typeIndicator.offsetWidth;
    const minLeft = 2; // sama dengan padding kiri .type-toggle
    const maxLeft = Math.max(dragContainerWidth - indicatorWidth - 2, minLeft);
    const left = Math.min(Math.max(x - indicatorWidth / 2, minLeft), maxLeft);
    typeIndicator.style.left = `${left}px`;
    // Opsi terdekat dari posisi jari jadi kandidat aktif secara live
    // (cuma warna teks yang berubah; indikator tetap bebas mengikuti jari,
    // baru di-snap ke tombol terdekat saat pointerup/cancel).
    markActiveButton(findClosestButton(x));
  }

  /** Selesai: baik setelah drag betulan maupun setelah tap biasa, opsi
   * terdekat dari posisi pointer terakhir jadi pilihan final. Class
   * .is-dragging dilepas DULU supaya transisi CSS-nya aktif lagi — jadi
   * perpindahan terakhir ke posisi tombol terasa sebagai "snap" halus,
   * bukan lompatan. */
  function endDrag(e) {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return;
    dragPointerId = null;
    isDragging = false;
    typeIndicator.classList.remove("is-dragging");
    const x = e.clientX - dragContainerLeft;
    setSelectedType(findClosestButton(x).dataset.type);
  }

  typeToggle.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return; // klik kiri/touch/pen utama saja
    if (dragPointerId !== null) return; // sudah ada pointer lain yang dilacak

    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    isDragging = false; // belum dianggap drag sampai lewat DRAG_THRESHOLD_PX

    const rect = typeToggle.getBoundingClientRect();
    dragContainerLeft = rect.left;
    dragContainerWidth = rect.width;

    // Semua pointer event berikutnya diarahkan ke .type-toggle walau jari
    // sudah keluar dari kotaknya — drag tetap mulus & pointerup tetap
    // kebaca meski dilepas di luar toggle.
    typeToggle.setPointerCapture(e.pointerId);
  });

  typeToggle.addEventListener("pointermove", (e) => {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return;

    if (!isDragging) {
      if (Math.abs(e.clientX - dragStartX) < DRAG_THRESHOLD_PX) return;
      // Lewat ambang -> baru masuk mode drag: matikan transisi supaya
      // indikator bisa menempel real-time di jari.
      isDragging = true;
      typeIndicator.classList.add("is-dragging");
    }

    e.preventDefault();
    updateDragPosition(e.clientX);
  });

  typeToggle.addEventListener("pointerup", endDrag);
  typeToggle.addEventListener("pointercancel", endDrag);

  // Rotate device / resize browser -> hitung ulang posisi & lebar indikator
  // (offsetLeft/offsetWidth tombol aktif bisa berubah). Tidak ada gunanya
  // kalau modal-nya sedang tidak tampil (display:none -> offset selalu 0).
  window.addEventListener("resize", () => {
    if (overlay.hidden) return;
    positionIndicator(typeToggle.querySelector(".type-toggle-btn.is-active"), { animate: false });
  });

  function resetForm() {
    form.reset();
    fieldId.value = "";
    populateCategoryOptions();
    setSelectedType("expense", { animate: false });
    // Tanggal LOKAL (toIsoDate), bukan toISOString() yang berbasis UTC: di
    // WIB antara 00:00-07:00, tanggal UTC masih hari kemarin sehingga
    // transaksi baru "hilang" dari kalender hari ini / masuk grup Kemarin.
    fieldDate.value = toIsoDate(new Date());
  }

  function openModal(mode, tx) {
    resetForm();

    let typeToSelect = "expense";

    if (mode === "edit" && tx) {
      modalTitle.textContent = "Edit Transaksi";
      submitBtn.textContent = "Simpan Perubahan";
      fieldId.value = tx.id;
      fieldTitle.value = tx.title;
      populateCategoryOptions(tx.category);
      fieldAmount.value = formatAmountDigits(String(tx.amount));
      fieldDate.value = tx.isoDate || toIsoDate(new Date());
      typeToSelect = tx.type;
    } else {
      modalTitle.textContent = "Tambah Transaksi";
      submitBtn.textContent = "Simpan Transaksi";
    }

    overlay.hidden = false;
    pushModal(modalEntry);
    // Satu requestAnimationFrame kadang tidak cukup: browser bisa
    // menggabungkan state "hidden baru dilepas" dengan state "is-open"
    // jadi satu frame yang sama sehingga transisi terlewat/langsung
    // muncul tanpa animasi (lebih sering terjadi di Safari/iOS
    // dibanding Chrome). rAF bersarang memastikan frame awal (belum
    // is-open) benar-benar sempat digambar dulu sebelum transisi mulai.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add("is-open");
        // offsetLeft/offsetWidth (dipakai positionIndicator) hanya akurat
        // setelah modal benar-benar dirender (bukan display:none lagi) —
        // makanya baru dipanggil di sini, dengan animate:false supaya
        // indikator langsung "teleport" ke opsi yang benar (mis.
        // "Investasi" saat mode edit) tanpa animasi nyelonong.
        setSelectedType(typeToSelect, { animate: false });
      });
    });
    // Sengaja TIDAK auto-focus ke field manapun (termasuk Nama Transaksi)
    // saat modal dibuka — di mobile ini langsung memunculkan keyboard
    // tanpa diminta. User klik sendiri ke field yang mau diisi.
  }

  function closeModal() {
    popModal(modalEntry);
    overlay.classList.remove("is-open");
    setTimeout(() => {
      overlay.hidden = true;
    }, 180);
  }

  // Listener click per tombol dipertahankan (bukan cuma drag) supaya tap
  // biasa tetap jalan DAN supaya toggle tetap bisa dioperasikan lewat
  // keyboard (fokus tombol + Enter/Space memicu event 'click', bukan
  // Pointer Events drag di atas).
  typeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setSelectedType(btn.dataset.type));
  });

  // Format nominal secara live saat diketik: "500000" -> "500.000" supaya
  // user langsung bisa membaca besaran yang sedang diinput. Yang disimpan
  // tetap angka murni — handler submit di bawah menghapus semua non-digit
  // sebelum di-Number(). Caret otomatis loncat ke ujung tiap kali value
  // ditulis ulang; untuk input numerik yang diketik berurutan dari keypad
  // HP itu memang posisi yang diinginkan.
  fieldAmount.addEventListener("input", () => {
    fieldAmount.value = formatAmountDigits(fieldAmount.value);
  });

  // Diekspos supaya tombol edit di daftar transaksi mana pun bisa membuka
  // form edit yang sama.
  openTransactionModal = openModal;

  // Satu-satunya pemicu "Tambah": tombol Aksi Cepat di dashboard
  // ([data-action="add-transaction"]). Di halaman lain modal ini hanya
  // dipakai untuk edit (dibuka lewat handleTransactionListClick).
  document
    .querySelectorAll('[data-action="add-transaction"]')
    .forEach((btn) => btn.addEventListener("click", () => openModal("add")));
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);

  // Klik area gelap di luar kartu modal juga menutup modal
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const amountDigits = fieldAmount.value.replace(/\D/g, "");
    if (!fieldTitle.value.trim() || !fieldCategory.value || !amountDigits || Number(amountDigits) <= 0 || !fieldDate.value) {
      form.reportValidity();
      return;
    }

    const editId = fieldId.value ? Number(fieldId.value) : null;
    const payload = {
      title: fieldTitle.value.trim(),
      category: fieldCategory.value,
      type: getSelectedType(),
      amount: Number(amountDigits),
      isoDate: fieldDate.value,
      time: formatDateID(fieldDate.value),
    };

    if (editId) {
      const tx = financeData.transactions.find((item) => item.id === editId);
      Object.assign(tx, payload);
    } else {
      financeData.transactions.unshift({ id: nextTransactionId++, ...payload });
    }

    refreshDashboard();
    closeModal();
  });

  // Konfirmasi hapus transaksi memakai modal custom yang sama gayanya dengan
  // konfirmasi hapus kategori (markup #confirm-modal-overlay di halaman ini).
  const confirmOverlay = document.getElementById("confirm-modal-overlay");
  if (confirmOverlay) {
    const confirmModal = createModalController(confirmOverlay);
    const confirmBtn = document.getElementById("confirm-delete");
    let pendingDelete = null;
    confirmBtn.addEventListener("click", () => {
      if (!pendingDelete) return;
      const run = pendingDelete;
      pendingDelete = null;
      confirmModal.close();
      run();
    });
    confirmDeleteTransaction = (tx, onConfirm) => {
      document.getElementById("confirm-title").textContent = `Yakin ingin menghapus "${tx.title}"?`;
      document.getElementById("confirm-text").textContent = `${formatRupiah(tx.amount)} · ${getCategoryLabel(tx.category)}. Transaksi yang dihapus tidak bisa dikembalikan.`;
      confirmBtn.textContent = "Hapus Transaksi";
      pendingDelete = onConfirm;
      confirmModal.open();
    };
  }

  // Delegasi klik untuk tombol edit/delete di dalam daftar transaksi
  // (list-nya sering di-render ulang, jadi listener dipasang di parent).
  // Hanya #all-transaction-list (halaman Semua Transaksi) yang punya tombol
  // aksi; daftar "Transaksi Terbaru" di dashboard cuma preview.
  const allList = document.getElementById("all-transaction-list");
  if (allList) allList.addEventListener("click", handleTransactionListClick);
}

/* ---------- Tumpukan modal: satu listener Escape untuk semua modal ----------
   Sebelumnya tiap modal memasang listener keydown sendiri, sehingga saat
   modal bertumpuk (mis. konfirmasi hapus di atas modal edit kategori) satu
   tekan Escape menutup semuanya sekaligus. Sekarang modal mendaftar saat
   dibuka; Escape hanya menutup entri paling atas. */
const openModals = [];

/** Tandai modal sebagai yang paling atas (dipanggil saat dibuka). */
function pushModal(entry) {
  popModal(entry); // kalau dibuka ulang, pindahkan ke puncak
  openModals.push(entry);
}

/** Lepaskan modal dari tumpukan (dipanggil saat ditutup). */
function popModal(entry) {
  const i = openModals.indexOf(entry);
  if (i !== -1) openModals.splice(i, 1);
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !openModals.length) return;
  openModals[openModals.length - 1].close();
});

/**
 * Kontrol buka/tutup generik untuk overlay modal (pola yang sama dengan modal
 * transaksi & check-in: hidden -> is-open lewat rAF bersarang, tutup lewat
 * [data-modal-close], klik latar, atau Escape lewat tumpukan modal di atas).
 */
function createModalController(overlay) {
  const entry = { close: () => close() };
  function open() {
    overlay.hidden = false;
    pushModal(entry);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add("is-open"));
    });
  }
  function close() {
    if (overlay.hidden) return;
    popModal(entry);
    overlay.classList.remove("is-open");
    setTimeout(() => {
      overlay.hidden = true;
    }, 180);
  }
  overlay.querySelectorAll("[data-modal-close]").forEach((btn) => btn.addEventListener("click", close));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  return { open, close, isOpen: () => !overlay.hidden };
}

/** Key kategori dari nama ("Kopi & Jajan" -> "kopi-jajan"), unik terhadap
 * kategori yang sudah ada. Key transaksi lama tidak pernah diubah. */
function makeCategoryKey(name) {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kategori";
  let key = base;
  let n = 2;
  while (financeData.categories[key]) key = `${base}-${n++}`;
  return key;
}

/**
 * analytics.html: edit budget bulanan, edit/tambah/hapus kategori.
 * Tiga popup custom (bukan prompt/confirm browser) dengan bahasa visual
 * yang sama dengan modal lain. Setiap simpan -> saveBudget() (localStorage)
 * lalu render ulang card budget, daftar kategori, dan sorotan. Menghapus
 * kategori TIDAK menyentuh transaksi: key-nya tetap tersimpan di transaksi,
 * hanya tampil sebagai "Lainnya" (lihat getCategory()).
 */
function setupBudgetEditor() {
  const budgetOverlay = document.getElementById("budget-modal-overlay");
  if (!budgetOverlay) return; // bukan di halaman analytics

  const budgetModal = createModalController(budgetOverlay);
  const categoryOverlay = document.getElementById("category-modal-overlay");
  const categoryModal = createModalController(categoryOverlay);
  const confirmOverlay = document.getElementById("confirm-modal-overlay");
  const confirmModal = createModalController(confirmOverlay);

  function rerender() {
    renderBudgetPage(); // ikut bulan yang sedang dilihat (budgetViewDate)
  }

  function persistAndRerender() {
    saveBudget();
    rerender();
  }

  /** Nominal dari input "Rp" yang diformat ("1.250.000" -> 1250000). */
  function readAmount(input) {
    const digits = input.value.replace(/\D/g, "");
    return digits ? Number(digits) : 0;
  }

  // ---------- 1. Budget bulanan ----------
  const budgetForm = document.getElementById("budget-form");
  const fieldMonthly = document.getElementById("field-budget-monthly");
  const quickAmounts = document.getElementById("budget-quick-amounts");

  fieldMonthly.addEventListener("input", () => {
    fieldMonthly.value = formatAmountDigits(fieldMonthly.value);
    fieldMonthly.setCustomValidity("");
    markActiveQuickAmount();
  });

  function markActiveQuickAmount() {
    const current = readAmount(fieldMonthly);
    quickAmounts.querySelectorAll(".quick-amount").forEach((chip) => {
      chip.classList.toggle("is-active", Number(chip.dataset.amount) === current);
    });
  }

  /** Pilihan cepat: total budget kategori saat ini (kalau ada) + tiga
   * nominal bulat. Duplikat nominal dibuang supaya tidak ada dua chip sama. */
  function renderQuickAmounts() {
    const totalCategory = getTotalCategoryBudget();
    const choices = [];
    if (totalCategory > 0) choices.push({ label: "Total kategori", amount: totalCategory });
    [
      { emoji: "💵", amount: 1000000 },
      { emoji: "💰", amount: 2000000 },
      { emoji: "🔥", amount: 3000000 },
    ].forEach((c) => {
      if (!choices.some((x) => x.amount === c.amount)) choices.push(c);
    });
    quickAmounts.innerHTML = choices
      .map(
        (c) => `<button type="button" class="quick-amount" data-amount="${c.amount}">${c.emoji ? `${c.emoji} ` : ""}${c.label ? `${c.label} · ` : ""}<span class="num">${formatRupiah(c.amount)}</span></button>`
      )
      .join("");
    markActiveQuickAmount();
  }

  quickAmounts.addEventListener("click", (e) => {
    const chip = e.target.closest(".quick-amount");
    if (!chip) return;
    fieldMonthly.value = formatAmountDigits(chip.dataset.amount);
    fieldMonthly.setCustomValidity("");
    markActiveQuickAmount();
  });

  document.getElementById("btn-edit-budget").addEventListener("click", () => {
    fieldMonthly.value = formatAmountDigits(String(financeData.budget.monthly));
    fieldMonthly.setCustomValidity("");
    renderQuickAmounts();
    budgetModal.open();
  });

  budgetForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = readAmount(fieldMonthly);
    if (amount <= 0) {
      fieldMonthly.setCustomValidity("Masukkan nominal budget bulanan.");
      budgetForm.reportValidity();
      return;
    }
    financeData.budget.monthly = amount;
    persistAndRerender();
    budgetModal.close();
  });

  // ---------- 2. Tambah / edit kategori ----------
  const categoryForm = document.getElementById("category-form");
  const categoryTitle = document.getElementById("category-modal-title");
  const categorySub = document.getElementById("category-modal-sub");
  const categorySubmit = document.getElementById("category-modal-submit");
  const fieldKey = document.getElementById("field-category-key");
  const fieldName = document.getElementById("field-category-name");
  const fieldBudget = document.getElementById("field-category-budget");
  const emojiPicker = document.getElementById("emoji-picker");
  const deleteBtn = document.getElementById("btn-delete-category");

  let selectedEmoji = EMOJI_CHOICES[0];

  function renderEmojiPicker(current) {
    // Emoji kategori lama yang tidak ada di daftar pilihan tetap ditampilkan
    // (di depan) supaya tidak "hilang" saat user mengedit.
    const choices = EMOJI_CHOICES.includes(current) ? EMOJI_CHOICES : [current, ...EMOJI_CHOICES];
    emojiPicker.innerHTML = choices
      .map(
        (emoji) => `<button type="button" class="emoji-option${emoji === current ? " is-active" : ""}" data-emoji="${emoji}" role="radio" aria-checked="${emoji === current}" aria-label="Emoji ${emoji}">${emoji}</button>`
      )
      .join("");
    selectedEmoji = current;
  }

  emojiPicker.addEventListener("click", (e) => {
    const option = e.target.closest(".emoji-option");
    if (!option) return;
    selectedEmoji = option.dataset.emoji;
    emojiPicker.querySelectorAll(".emoji-option").forEach((el) => {
      const active = el === option;
      el.classList.toggle("is-active", active);
      el.setAttribute("aria-checked", String(active));
    });
    if (fieldKey.value) categoryTitle.textContent = `${selectedEmoji} Edit Kategori ${fieldName.value.trim() || getCategoryLabel(fieldKey.value)}`;
  });

  fieldBudget.addEventListener("input", () => {
    fieldBudget.value = formatAmountDigits(fieldBudget.value);
    fieldBudget.setCustomValidity("");
  });
  fieldName.addEventListener("input", () => fieldName.setCustomValidity(""));

  function openCategoryModal(mode, key) {
    categoryForm.reset();
    fieldName.setCustomValidity("");
    fieldBudget.setCustomValidity("");
    if (mode === "edit" && financeData.categories[key]) {
      const cat = financeData.categories[key];
      fieldKey.value = key;
      fieldName.value = cat.name;
      fieldBudget.value = formatAmountDigits(String(cat.budget));
      renderEmojiPicker(cat.emoji || FALLBACK_CATEGORY.emoji);
      categoryTitle.textContent = `${cat.emoji} Edit Kategori ${cat.name}`;
      categorySub.textContent = "Atur budget kategori ini sesuai kebutuhan kamu.";
      categorySubmit.textContent = "Simpan Perubahan";
      deleteBtn.hidden = false;
    } else {
      fieldKey.value = "";
      renderEmojiPicker("💡");
      categoryTitle.textContent = "➕ Tambah Kategori";
      categorySub.textContent = "Buat pos pengeluaran baru dan tentukan budgetnya.";
      categorySubmit.textContent = "Tambah Kategori";
      deleteBtn.hidden = true;
    }
    categoryModal.open();
  }

  document.getElementById("btn-add-category").addEventListener("click", () => openCategoryModal("add"));

  // Tombol Edit di tiap card kategori (list sering dirender ulang -> delegasi).
  document.getElementById("category-list").addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="edit-category"]');
    if (btn) openCategoryModal("edit", btn.dataset.key);
  });

  categoryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = fieldName.value.trim();
    const budget = readAmount(fieldBudget);
    if (!name) {
      fieldName.setCustomValidity("Isi nama kategori.");
      categoryForm.reportValidity();
      return;
    }
    if (budget <= 0) {
      fieldBudget.setCustomValidity("Masukkan nominal budget kategori.");
      categoryForm.reportValidity();
      return;
    }
    const key = fieldKey.value || makeCategoryKey(name);
    // Edit: key tetap (transaksi lama tetap terhubung), hanya isinya diganti.
    financeData.categories[key] = { name, emoji: selectedEmoji, budget };
    persistAndRerender();
    categoryModal.close();
  });

  // ---------- 3. Hapus kategori (konfirmasi custom) ----------
  const confirmText = document.getElementById("confirm-text");
  const confirmDelete = document.getElementById("confirm-delete");
  let pendingDeleteKey = null;

  deleteBtn.addEventListener("click", () => {
    const key = fieldKey.value;
    if (!financeData.categories[key]) return;
    pendingDeleteKey = key;
    const cat = financeData.categories[key];
    const count = financeData.transactions.filter((tx) => tx.category === key).length;
    document.getElementById("confirm-title").textContent = `Yakin ingin menghapus kategori ${cat.name}?`;
    confirmText.textContent = count
      ? `${count} transaksi yang memakai kategori ini tidak akan ikut terhapus — semuanya tetap tersimpan dan akan tampil sebagai "Lainnya".`
      : "Transaksi yang sudah ada tidak akan ikut terhapus.";
    confirmModal.open();
  });

  confirmDelete.addEventListener("click", () => {
    if (!pendingDeleteKey) return;
    delete financeData.categories[pendingDeleteKey]; // transaksi tidak disentuh
    pendingDeleteKey = null;
    persistAndRerender();
    confirmModal.close();
    categoryModal.close();
  });
}

/**
 * Popup ringkasan saat dashboard pertama kali dibuka. Dipakai sessionStorage
 * (bukan data sensitif) supaya tidak muncul berulang-ulang di sesi/tab yang
 * sama, tapi tetap muncul lagi di sesi baru.
 */
function shouldShowCheckin() {
  try {
    return sessionStorage.getItem("checkinDismissed") !== "true";
  } catch (err) {
    return true;
  }
}

/**
 * Popup Financial Check-in — tampil sekali per sesi saat dashboard dibuka
 * (sessionStorage), bukan tiap interaksi. Sementara terbuka, scroll body
 * dikunci supaya latar tidak bisa di-scroll/ditekan.
 */
function setupCheckin() {
  const overlay = document.getElementById("checkin-overlay");
  if (!overlay) return; // bukan di dashboard
  const checkinEntry = { close: () => closeCheckin() };

  function closeCheckin() {
    popModal(checkinEntry);
    overlay.classList.remove("is-open");
    document.body.classList.remove("is-modal-open");
    setTimeout(() => {
      overlay.hidden = true;
    }, 220);
    try {
      sessionStorage.setItem("checkinDismissed", "true");
    } catch (err) {
      // sessionStorage tidak tersedia — abaikan; popup cukup tidak muncul
      // lagi selama tab ini masih terbuka.
    }
  }

  function openCheckin() {
    renderCheckin();
    overlay.hidden = false;
    pushModal(checkinEntry);
    document.body.classList.add("is-modal-open");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add("is-open"));
    });
  }

  document.getElementById("checkin-close").addEventListener("click", closeCheckin);
  document.getElementById("checkin-cta").addEventListener("click", closeCheckin);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeCheckin();
  });

  if (shouldShowCheckin()) openCheckin();
}


/* =========================================================
   5. INIT
   ========================================================= */
function initDashboard() {
  // Transaksi tersimpan (localStorage) mungkin sudah dimuat menimpa mock data
  // di financeData.transactions (lihat loadTransactions() di bagian MOCK DATA)
  // — recalc dulu supaya Financial Summary tidak menampilkan angka mock lama.
  recalcFromTransactions();

  renderGreeting("Rizqi");
  renderSummary(financeData.summary);
  setBalanceVisible(false); // default: saldo tersembunyi saat dashboard dibuka
  renderBudgetSummary();
  renderRecentTransactions();
  renderNotifications();

  setupHeaderActions();
  setupBalanceToggle();
  setupTransactionModal();
  setupCheckin();
}

/**
 * Halaman "Semua Transaksi" (transactions.html) — dibuka dari link "Lihat
 * semua" di dashboard. Halaman penuh, bukan popup, supaya daftar panjang
 * enak di-scroll. Tetap mendukung tambah (FAB), edit, dan hapus lewat
 * modal & handler yang sama dengan dashboard; perubahan langsung
 * dipersist ke localStorage sehingga dashboard ikut update saat kembali.
 */
function initTransactionsPage() {
  setupTransactionFilters(); // isi opsi kategori sebelum render pertama
  renderAllTransactionsList();
  setupCalendar();
  setupTransactionModal();
}

/**
 * Halaman "Budget & Kategori" (budget.html): Budget Bulan Ini + semua
 * kategori ditumpuk, semuanya bisa diedit (setupBudgetEditor()). Angkanya
 * dihitung dari transaksi yang sama (localStorage) lewat getCategoryUsed().
 */
function initBudgetPage() {
  recalcFromTransactions();
  budgetViewDate = startOfMonth(new Date()); // default: bulan berjalan
  renderBudgetPage();
  setupBudgetEditor();
  setupBudgetPeriodNav();
}

/**
 * Halaman "Analisis" (analytics.html): ringkasan, chart pengeluaran per
 * waktu & per kategori, dan Insight Keuangan — semuanya dari transaksi +
 * budget yang sama di localStorage, tidak ada dataset terpisah.
 */
function initAnalyticsPage() {
  recalcFromTransactions();
  renderAnalytics();
  setupChartScrub();

  const detail = document.getElementById("chart-detail");
  if (detail) {
    detail.addEventListener("click", (e) => {
      if (e.target.closest("#btn-reset-selection")) {
        analyticsPage.selectedKey = null;
        analyticsPage.detailExpanded = false;
        renderAnalytics();
      } else if (e.target.closest("#btn-detail-toggle")) {
        analyticsPage.detailExpanded = !analyticsPage.detailExpanded;
        renderAnalytics();
      }
    });
  }
}

// Satu app.js dipakai dua halaman; <body data-page="..."> yang menentukan
// init mana yang jalan. Default (tanpa atribut) = dashboard.
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "transactions") {
    initTransactionsPage();
  } else if (page === "analytics") {
    initAnalyticsPage();
  } else if (page === "budget") {
    initBudgetPage();
  } else {
    initDashboard();
  }
});

// iOS Safari (terutama versi lama) baru mau memicu pseudo-class :active saat
// disentuh kalau ada listener touchstart di dokumen. Listener kosong &
// passive ini tidak mengubah perilaku apa pun — murni supaya efek "tombol
// ditekan" di CSS ikut bekerja di layar sentuh, bukan cuma di mouse.
document.addEventListener("touchstart", () => {}, { passive: true });

/**
 * Press feedback lintas-device (melengkapi :active di CSS).
 * :active di iOS Safari sering tidak konsisten dan tap jari hanya
 * berlangsung ~60–90ms — lebih singkat dari transisi masuknya, jadi
 * tombol tidak sempat terlihat mengecil. Di sini class .is-pressed
 * dipasang saat pointerdown pada kontrol yang bisa ditekan, dan dilepas
 * pada pointerup/pointercancel dengan tahanan minimal 120ms supaya tap
 * secepat apa pun tetap memperlihatkan "masuk → kembali".
 * Murni visual: tidak mencegah default, tidak menyentuh handler klik.
 */
(function setupPressFeedback() {
  const PRESSABLE = ".btn, .icon-btn, .icon-btn-sm, .modal-close, .type-toggle-btn, .filter-chip, .settings-menu-item, .link-see-all, .balance-toggle, .quick-amount, .emoji-option, .calendar-nav, .calendar-day, .bar-col";
  const MIN_HOLD_MS = 120;
  let pressed = null;
  let pressedAt = 0;

  function release() {
    if (!pressed) return;
    const el = pressed;
    pressed = null;
    const wait = Math.max(0, MIN_HOLD_MS - (performance.now() - pressedAt));
    setTimeout(() => el.classList.remove("is-pressed"), wait);
  }

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.target.closest(PRESSABLE);
    if (!el || el.disabled) return;
    release(); // pointer kedua saat yang pertama masih ditahan
    pressed = el;
    pressedAt = performance.now();
    el.classList.add("is-pressed");
  });

  // Dipasang di fase capture supaya tetap kebaca walau target sudah
  // dialihkan oleh setPointerCapture (mis. drag toggle jenis transaksi).
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", release, true); // jari jadi scroll
  window.addEventListener("blur", release);
})();