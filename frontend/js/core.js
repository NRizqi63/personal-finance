/**
 * core.js — fondasi bersama SEMUA halaman (refactor JS tahap 1).
 * Dipisah dari app.js: isi disalin apa adanya (verbatim) dan urutan
 * deklarasi/eksekusi parse-time dipertahankan. Berisi:
 *   - konstanta, financeData, key & loader/saver localStorage
 *   - helper data target (G-1), format angka/tanggal, kalkulasi budget & target
 *   - komponen render bersama (sapaan, card budget, daftar transaksi, feedback)
 *   - tumpukan modal + focus trap + press feedback + dispatcher DOMContentLoaded
 * Harus dimuat PERTAMA (sebelum transactions-shared.js dan file halaman).
 * app.js lama sudah dihapus (refactor tahap 6); file ini dan file halaman
 * tidak boleh dimuat dua kali di halaman yang sama (deklarasi const/let ganda).
 */

/* =========================================================
   1. MOCK DATA
   Nantinya bagian ini bisa diganti dengan hasil fetch() ke API,
   tanpa perlu mengubah fungsi render di bawah.
   ========================================================= */

// Nilai awal budget untuk pengguna baru — dipakai financeData di bawah DAN
// sebagai "default aplikasi" saat file backup yang diimport tidak membawa
// budget yang bisa dibaca. Dibekukan supaya tidak ikut termodifikasi saat
// user mengedit kategorinya.
const DEFAULT_MONTHLY_BUDGET = 2400000;

const DEFAULT_CATEGORIES = Object.freeze({
  makanan: Object.freeze({ name: "Makanan", emoji: "🍜", budget: 800000 }),
  bensin: Object.freeze({ name: "Bensin", emoji: "⛽", budget: 300000 }),
  belanja: Object.freeze({ name: "Belanja", emoji: "🛍️", budget: 500000 }),
  tagihan: Object.freeze({ name: "Tagihan", emoji: "🧾", budget: 600000 }),
  hiburan: Object.freeze({ name: "Hiburan", emoji: "🎬", budget: 200000 }),
});

/** Salinan baru kategori default (boleh diubah user tanpa menyentuh template). */
function cloneDefaultCategories() {
  const categories = {};
  Object.entries(DEFAULT_CATEGORIES).forEach(([key, cat]) => {
    categories[key] = { name: cat.name, emoji: cat.emoji, budget: cat.budget };
  });
  return categories;
}

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
    monthly: DEFAULT_MONTHLY_BUDGET,
  },

  // Konfigurasi budget per kategori (key = value <option> kategori di form
  // transaksi). Emoji adalah identitas kategori (ikon di card kategori &
  // card transaksi). Nama, emoji, dan budget bisa diubah user; kategori
  // bisa ditambah/dihapus (setupBudgetEditor()) — semuanya dipersist ke
  // localStorage bersama budget bulanan (lihat saveBudget()).
  // "Terpakai" TIDAK disimpan di sini — dihitung dari transaksi pengeluaran
  // aktual lewat getCategoryUsed(), supaya dashboard dan analytics.html
  // selalu membaca data yang sama dengan daftar transaksi.
  categories: cloneDefaultCategories(),

  // Pengaturan user (Settings V1 Tahap 2): nama panggilan untuk sapaan,
  // preferensi saldo saat dashboard dibuka, dan izin popup check-in.
  // Nilai di sini = default; ditimpa hasil merge dari localStorage
  // (loadSettings()). Disimpan di key terpisah "financeData.settings" —
  // key transaksi & budget lama tidak disentuh.
  settings: {
    name: "Rizqi",
    hideBalanceOnOpen: false,
    showCheckin: true,
  },

  // Target keuangan user (Target Keuangan G-1). Array — bukan objek ber-key
  // seperti categories — supaya urutan tampil bebas diatur saat render dan
  // tidak ada key hasil parsing yang perlu dicurigai. Kosong untuk pengguna
  // baru, lalu diisi dari localStorage (loadGoals()).
  // Nilai turunan (persen, sisa, selesai/tidak) TIDAK disimpan di sini:
  // semuanya dihitung dari target & saved lewat getGoalProgress() /
  // getGoalStatus(), prinsip yang sama dengan "terpakai" pada kategori yang
  // selalu dihitung ulang dari transaksi — supaya tidak ada dua sumber
  // kebenaran yang bisa berbeda.
  goals: [],

  // Data goal CONTOH — ditampilkan di popup Financial Check-in
  // (renderCheckin()) dengan penanda "contoh". Belum terhubung dengan
  // financeData.goals di atas; Check-in baru membaca target sungguhan pada
  // tahap G-8, dan objek ini dihapus di tahap itu.
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

/** Apakah key benar-benar kategori milik user? Memakai hasOwnProperty supaya
 * key bawaan Object ("constructor", "__proto__", "toString", …) tidak
 * disangka kategori yang ada. */
function hasCategory(key) {
  return isSafeObjectKey(key) && Object.prototype.hasOwnProperty.call(financeData.categories, key);
}

/** Data kategori untuk sebuah key — kategori user, atau cadangan "Lainnya". */
function getCategory(key) {
  return hasCategory(key) ? financeData.categories[key] : FALLBACK_CATEGORY;
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

const SETTINGS_STORAGE_KEY = "financeData.settings";

// Target keuangan disimpan di key SENDIRI, bukan menumpang di key budget:
// "Reset Budget & Kategori" menghapus key budget seluruhnya, jadi target yang
// ikut di sana akan hilang tanpa diminta. Tiga key di atas tidak diubah nama
// maupun bentuknya.
const GOALS_STORAGE_KEY = "financeData.goals";

// Default pengaturan — sumber kebenaran untuk merge di loadSettings() dan
// fallback di getUserName(). Dibekukan supaya tidak termodifikasi tak sengaja.
const DEFAULT_SETTINGS = Object.freeze({ name: "Rizqi", hideBalanceOnOpen: false, showCheckin: true });

const USER_NAME_MAX_LENGTH = 40;

/** Nama valid = string, dipangkas, tidak kosong, maks. 40 karakter; selain
 * itu null (pemanggil memakai default). Dipakai loadSettings() & form profil. */
function normalizeUserName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > USER_NAME_MAX_LENGTH) return null;
  return name;
}

/** Boolean dari nilai tersimpan yang mungkin sudah rusak/bertipe lain:
 * true/false, "true"/"false", 1/0 diterima; lainnya -> fallback. */
function toBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

/** Gabungkan objek mentah (dari localStorage) dengan DEFAULT_SETTINGS —
 * properti yang hilang/rusak jatuh ke default, properti asing dibuang. */
function normalizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    name: normalizeUserName(src.name) || DEFAULT_SETTINGS.name,
    hideBalanceOnOpen: toBoolean(src.hideBalanceOnOpen, DEFAULT_SETTINGS.hideBalanceOnOpen),
    showCheckin: toBoolean(src.showCheckin, DEFAULT_SETTINGS.showCheckin),
  };
}

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
    return true;
  } catch (err) {
    // localStorage tidak tersedia/penuh (mis. private browsing). Perubahan
    // tetap ada di memori sesi ini, tapi pemanggil WAJIB tahu supaya tidak
    // mengklaim "tersimpan" — kontrak yang sama dengan saveGoals().
    return false;
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
        // Key berbahaya (__proto__ dkk) dilewati seperti kategori tidak valid
        // lainnya: datanya tidak dipakai, aplikasi tetap jalan normal.
        if (!isSafeObjectKey(key)) return;
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
    return true;
  } catch (err) {
    // Gagal menulis: pemanggil yang memutuskan (rollback + pesan error).
    return false;
  }
}

/** Muat pengaturan dari localStorage (kalau ada) dan MERGE dengan default:
 * user lama tanpa key ini, key parsial ({ name } saja), atau nilai rusak
 * ("true" sebagai string, nama kosong) semuanya aman. Tidak menulis apa pun
 * ke localStorage saat load — disimpan hanya saat user mengubah sesuatu. */
function loadSettings() {
  let parsed = null;
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) parsed = JSON.parse(saved);
  } catch (err) {
    // localStorage tidak tersedia / data korup — pakai default.
  }
  financeData.settings = normalizeSettings(parsed);
}

/** Simpan financeData.settings saat ini ke localStorage (key sendiri). */
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(financeData.settings));
    return true;
  } catch (err) {
    // Gagal menulis: pemanggil yang memutuskan (rollback + pesan error).
    return false;
  }
}

/** Nama panggilan untuk sapaan — selalu string valid, tidak pernah
 * undefined/null (fallback ke default "Rizqi"). */
function getUserName() {
  return normalizeUserName(financeData.settings && financeData.settings.name) || DEFAULT_SETTINGS.name;
}

/** Escape teks user sebelum dimasukkan ke template innerHTML — dipakai untuk
 * ISI teks maupun nilai atribut ber-kutip (", ' ikut di-escape). Semua data
 * yang berasal dari localStorage (judul transaksi, nama/emoji/key kategori,
 * time, nama user) harus melewati ini sebelum masuk innerHTML, supaya tetap
 * tampil sebagai teks walau isinya markup. */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// Key yang tidak boleh dipakai sebagai key objek hasil parsing localStorage:
// menugaskan "__proto__" pada objek literal MENGUBAH prototype objek itu
// (prototype pollution); "constructor"/"prototype" ditolak sekalian.
const UNSAFE_OBJECT_KEYS = ["__proto__", "constructor", "prototype"];

/** Aman dipakai sebagai key kategori hasil parsing? (string non-kosong &
 * bukan key yang bisa mengutak-atik prototype). */
function isSafeObjectKey(key) {
  return typeof key === "string" && key.length > 0 && !UNSAFE_OBJECT_KEYS.includes(key);
}

// Panjang nama target: batas yang sama dengan nama kategori & nama profil
// (IMPORT_NAME_MAX / USER_NAME_MAX_LENGTH) supaya satu nada di seluruh app.
const GOAL_NAME_MAX = 40;

// Batas jumlah target — menjaga localStorage & render tetap wajar. Dipakai
// form saat MENAMBAH target baru (tahap G-3). Data yang terlanjur tersimpan
// melebihi batas ini sengaja TIDAK dipotong saat load: menghapus data user
// diam-diam lebih buruk daripada daftar yang kepanjangan.
const GOAL_LIMIT = 50;

// Deadline tinggal <= 30 hari (dan target belum tercapai) = "mendesak".
const GOAL_URGENT_DAYS = 30;

/**
 * Satu baris goals mentah (localStorage / nanti file backup) -> objek target
 * yang aman dipakai, atau null kalau tidak bisa diselamatkan. Pemanggil
 * melewati yang null, persis seperti kategori tidak lengkap di loadBudget():
 * satu baris rusak tidak boleh menjatuhkan seluruh daftar.
 *
 * `fallbackId` dipakai kalau id-nya hilang/rusak — datanya sendiri masih
 * berguna, jadi jangan dibuang hanya karena penomorannya kacau.
 */
function normalizeGoal(raw, fallbackId = 0) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > GOAL_NAME_MAX) return null;

  // Nominal WAJIB number (string angka tidak diterima diam-diam, sama dengan
  // aturan amount pada import transaksi).
  if (!Number.isFinite(raw.target) || raw.target <= 0) return null;
  // saved boleh 0, dan boleh LEBIH BESAR dari target — menabung melebihi
  // target itu sah, bukan data rusak.
  if (!Number.isFinite(raw.saved) || raw.saved < 0) return null;

  const id = Number.isInteger(raw.id) && raw.id >= 1 ? raw.id : fallbackId;
  if (!Number.isInteger(id) || id < 1) return null;

  // Deadline opsional: "" = tanpa tanggal target. Tanggal LAMPAU tetap valid
  // (target yang terlewat tetap boleh dicatat); yang ditolak hanya format
  // yang tidak terbaca — jatuh ke "" supaya target itu sendiri tidak hilang.
  const deadline = isValidIsoDate(raw.deadline) ? raw.deadline : "";

  // createdAt memakai tanggal LOKAL (toIsoDate), bukan toISOString().
  const createdAt = isValidIsoDate(raw.createdAt) ? raw.createdAt : toIsoDate(new Date());

  return { id, name, target: raw.target, saved: raw.saved, deadline, createdAt };
}

/** Muat target tersimpan dari localStorage. Tidak ada key / JSON korup /
 * bentuk bukan array -> daftar tetap kosong dan aplikasi jalan normal
 * (pola loadTransactions()). Baris rusak dilewati, baris valid tetap dipakai. */
function loadGoals() {
  try {
    const saved = localStorage.getItem(GOALS_STORAGE_KEY);
    if (!saved) return; // pengguna lama / belum pernah membuat target
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return;

    const usedIds = new Set();
    const goals = [];
    parsed.forEach((raw, index) => {
      const goal = normalizeGoal(raw, index + 1);
      if (!goal) return;
      // id wajib unik: kalau storage membawa duplikat, yang kedua diberi nomor
      // baru supaya edit & hapus tidak pernah mengenai dua target sekaligus.
      // Datanya tetap dipertahankan, hanya penomorannya yang dirapikan.
      if (usedIds.has(goal.id)) goal.id = Math.max(0, ...usedIds) + 1;
      usedIds.add(goal.id);
      goals.push(goal);
    });
    financeData.goals = goals;
  } catch (err) {
    // localStorage tidak tersedia / data korup — tetap pakai daftar kosong.
  }
}

/** Simpan financeData.goals saat ini ke localStorage (key sendiri).
 * Mengembalikan true kalau benar-benar tertulis, false kalau storage tidak
 * tersedia/penuh — pemanggil (form Tambah Target) memakai ini untuk TIDAK
 * mengklaim "tersimpan" pada sesuatu yang cuma ada di memori.
 * Kontrak boolean yang sama dipakai saveTransactions/saveBudget/saveSettings. */
function saveGoals() {
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(financeData.goals));
    return true;
  } catch (err) {
    return false; // localStorage tidak tersedia — data tetap ada di memori sesi ini.
  }
}

/** Id untuk target baru: integer naik, di-seed dari id terbesar yang ada
 * (pola nextTransactionId). Sengaja dihitung ulang tiap dipanggil, bukan
 * disimpan sebagai counter, supaya tetap benar setelah import atau reset. */
function nextGoalId() {
  return financeData.goals.reduce((max, goal) => Math.max(max, goal.id), 0) + 1;
}

loadTransactions();
loadBudget();
loadSettings();
loadGoals();

const ICON_EDIT = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>`;

const ICON_DELETE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>`;

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
    (tx) => tx.type === "expense" && !hasCategory(tx.category) && isSameMonth(tx.isoDate, now)
  );
  return { amount: list.reduce((sum, tx) => sum + tx.amount, 0), count: list.length };
}

/** Hitung status budget kategori berdasarkan persentase pemakaian */
function getBudgetStatus(percent) {
  if (percent >= 90) return { key: "danger", label: "Melebihi batas aman" };
  if (percent >= 70) return { key: "warning", label: "Perlu diperhatikan" };
  return { key: "safe", label: "Masih aman" };
}

/**
 * Selisih hari kalender dari hari ini ke `isoDate` (negatif = sudah lewat),
 * atau null kalau tanggalnya kosong/tidak valid.
 * Keduanya dibuat sebagai tengah malam LOKAL lewat new Date(y, m, d) — bukan
 * Date.parse/UTC — supaya tanggal tidak bergeser satu hari di zona waktu
 * seperti WIB. Math.round menetralkan pergeseran satu jam saat pergantian DST
 * di zona yang memakainya, sehingga hasilnya selalu bilangan hari bulat.
 */
function getDaysUntil(isoDate, today = new Date()) {
  if (!isValidIsoDate(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - start) / 86400000);
}

/**
 * Keterangan deadline sebuah target: { key, days, label }.
 *   none    : tidak ada tanggal target
 *   overdue : tanggalnya sudah lewat
 *   today   : jatuh tempo hari ini
 *   soon    : tinggal <= GOAL_URGENT_DAYS hari
 *   future  : masih lebih dari itu
 * `days` ikut dikembalikan supaya pemanggil bisa mengurutkan/menyaring tanpa
 * mengurai teks labelnya lagi.
 */
function describeDeadline(isoDate, today = new Date()) {
  const days = getDaysUntil(isoDate, today);
  if (days === null) return { key: "none", days: null, label: "Tanpa tanggal target" };
  if (days < 0) {
    const late = -days;
    return { key: "overdue", days, label: late === 1 ? "Terlewat 1 hari" : `Terlewat ${late} hari` };
  }
  if (days === 0) return { key: "today", days, label: "Hari ini" };
  if (days <= GOAL_URGENT_DAYS) return { key: "soon", days, label: days === 1 ? "Tinggal 1 hari" : `Tinggal ${days} hari` };
  return { key: "future", days, label: `${days} hari lagi` };
}

/**
 * Persen progress untuk TAMPILAN: selalu 0-100, tidak pernah NaN/Infinity.
 * target <= 0 atau data rusak -> 0 (tanpa progress palsu); saved melebihi
 * target -> tetap 100 supaya lebar progress bar tidak melampaui kotaknya.
 * Nominal aslinya tetap bisa dibaca pemanggil langsung dari objek target.
 */
function getGoalProgress(goal) {
  if (!goal || !Number.isFinite(goal.target) || goal.target <= 0) return 0;
  if (!Number.isFinite(goal.saved) || goal.saved <= 0) return 0;
  return Math.min((goal.saved / goal.target) * 100, 100);
}

/**
 * Status sebuah target — SELALU diturunkan, tidak pernah disimpan:
 *   saved >= target                -> done    : "Tercapai"
 *   deadline lewat & belum selesai -> overdue : "Terlewat"
 *   deadline <= 30 hari & belum    -> urgent  : "Mendesak"
 *   selain itu                     -> active  : "Aktif"
 * Bentuk hasilnya mengikuti getCategoryBudgetStatus(): { key, label, percent,
 * remaining } + keterangan deadline. remaining tidak pernah negatif (kelebihan
 * tabungan bukan "sisa"), percent sudah dipotong ke 100.
 */
function getGoalStatus(goal, today = new Date()) {
  const target = goal && Number.isFinite(goal.target) ? goal.target : 0;
  const saved = goal && Number.isFinite(goal.saved) ? goal.saved : 0;
  const percent = getGoalProgress(goal);
  const remaining = Math.max(target - saved, 0);
  const deadline = describeDeadline(goal ? goal.deadline : "", today);

  if (target > 0 && saved >= target) return { key: "done", label: "Tercapai", percent: 100, remaining: 0, deadline };
  if (deadline.key === "overdue") return { key: "overdue", label: "Terlewat", percent, remaining, deadline };
  if (deadline.key === "today" || deadline.key === "soon") return { key: "urgent", label: "Mendesak", percent, remaining, deadline };
  return { key: "active", label: "Aktif", percent, remaining, deadline };
}

/**
 * Urutan tampil target: yang belum selesai lebih dulu (deadline terdekat di
 * atas, target tanpa deadline paling bawah), target yang sudah tercapai
 * paling akhir. Seri tanggal dipecah oleh id menurun = target terbaru di atas,
 * sama dengan urutan transaksi.
 * Mengembalikan array BARU: Array.prototype.sort memutasi array aslinya,
 * sedangkan financeData.goals dipakai bersama seluruh aplikasi.
 */
function sortGoals(goals = financeData.goals, today = new Date()) {
  return [...goals].sort((a, b) => {
    const aDone = getGoalStatus(a, today).key === "done";
    const bDone = getGoalStatus(b, today).key === "done";
    if (aDone !== bDone) return aDone ? 1 : -1;

    const aDays = getDaysUntil(a.deadline, today);
    const bDays = getDaysUntil(b.deadline, today);
    if (aDays === null && bDays === null) return b.id - a.id;
    if (aDays === null) return 1; // tanpa deadline -> paling bawah
    if (bDays === null) return -1;
    if (aDays !== bDays) return aDays - bDays;
    return b.id - a.id;
  });
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

/** 1. Header: sapaan dinamis — nama dari financeData.settings (getUserName()). */
function renderGreeting(userName = getUserName()) {
  const el = document.getElementById("greeting-text");
  if (!el) return; // bukan di dashboard
  el.textContent = `${getGreetingWord()}, ${userName}`;
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

/** Pesan singkat hasil CRUD transaksi (tambah/edit/hapus). Memakai elemen
 * role="status" di dashboard & halaman Semua Transaksi; halaman lain tidak
 * punya elemennya, jadi fungsinya no-op di sana. Hanya dipanggil SETELAH
 * operasi berhasil — tidak pernah untuk validasi gagal atau pembatalan. */
let transactionFeedbackTimer = 0;

function showTransactionFeedback(text, type = "success") {
  const el = document.getElementById("transaction-feedback");
  if (!el) return; // halaman ini tidak punya area status
  clearTimeout(transactionFeedbackTimer);
  el.textContent = text;
  el.dataset.type = type;
  el.hidden = false;
  transactionFeedbackTimer = setTimeout(() => { el.hidden = true; }, 3000);
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
  // Judul, kategori, emoji, dan time berasal dari localStorage -> escape
  // sekali di sini, lalu dipakai di teks maupun aria-label. id dipaksa
  // menjadi angka (defense-in-depth untuk atribut data-id).
  const safeTitle = escapeHtml(tx.title);
  const safeId = Number(tx.id);
  const categoryLabel = escapeHtml(getCategoryLabel(tx.category));
  const timeLabel = escapeHtml(getTransactionTimeLabel(tx));
  const timeMarkup = timeLabel ? `<span class="transaction-time"> · ${timeLabel}</span>` : "";
  // showDate: tanggal ikut di baris meta (dipakai card detail di halaman
  // Analisis yang daftarnya bisa lintas tanggal; di daftar lain tanggal
  // sudah jadi judul kelompok/kalender).
  const dateMarkup = options.showDate && tx.isoDate ? `<span class="transaction-date"> · ${formatDateID(tx.isoDate)}</span>` : "";
  const actionsMarkup = showActions
    ? `
        <div class="transaction-actions">
          <button type="button" class="icon-btn-sm" data-action="edit" data-id="${safeId}" aria-label="Edit transaksi ${safeTitle}">${ICON_EDIT}</button>
          <button type="button" class="icon-btn-sm" data-action="delete" data-id="${safeId}" aria-label="Hapus transaksi ${safeTitle}">${ICON_DELETE}</button>
        </div>`
    : "";

  return `
    <li class="transaction-item ${showActions ? "transaction-item--actions" : ""}" data-id="${safeId}">
      <span class="transaction-icon transaction-icon--${escapeHtml(tx.type)}" aria-hidden="true">${escapeHtml(getTransactionEmoji(tx))}</span>
      <div class="transaction-info">
        <span class="transaction-title">${safeTitle}</span>
        <span class="transaction-meta">${categoryLabel}${dateMarkup}${timeMarkup}</span>
      </div>
      <div class="transaction-right">
        <span class="transaction-amount ${amountClass}">${sign} ${formatRupiah(tx.amount)}</span>${actionsMarkup}
      </div>
    </li>
  `;
}

const openModals = [];

// Kontrol yang bisa menerima fokus di dalam modal. input[type=hidden] &
// elemen ber-atribut hidden sengaja dikecualikan.
const MODAL_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** Kontrol yang benar-benar terlihat & bisa difokus di dalam sebuah overlay. */
function getFocusable(overlay) {
  return [...overlay.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)].filter(
    (el) => !el.hidden && !el.closest("[hidden]") && el.getClientRects().length > 0
  );
}

/** Kunci scroll latar selama modal terbuka (kelas yang sama dengan check-in). */
function lockBodyScroll() {
  document.body.classList.add("is-modal-open");
}

/** Lepas kunci scroll — hanya kalau TIDAK ada modal lain yang masih terbuka
 * (penting untuk modal bertumpuk: konfirmasi di atas modal kategori). */
function unlockBodyScroll() {
  if (!openModals.length) document.body.classList.remove("is-modal-open");
}

/** Fokus awal saat modal dibuka: tombol tutup kalau ada, kalau tidak container
 * .modal-nya sendiri. Sengaja BUKAN field teks — di HP itu langsung memunculkan
 * keyboard tanpa diminta (lihat catatan di openModal transaksi). */
function focusModal(overlay) {
  const closeBtn = overlay.querySelector(".modal-close");
  if (closeBtn) {
    closeBtn.focus({ preventScroll: true });
    return;
  }
  const box = overlay.querySelector(".modal") || overlay;
  if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
  box.focus({ preventScroll: true });
}

/** Tombol pengganti untuk pemicu yang sudah hilang karena daftarnya dirender
 * ulang (mis. tombol Edit transaksi): dicocokkan lewat data-* yang sama. */
function findEquivalentTrigger(trigger) {
  const ds = trigger.dataset || {};
  if (!ds.action && !ds.resetTarget) return null;
  return (
    [...document.querySelectorAll("[data-action], [data-reset-target]")].find(
      (el) =>
        el.dataset.action === ds.action &&
        el.dataset.id === ds.id &&
        el.dataset.key === ds.key &&
        el.dataset.resetTarget === ds.resetTarget
    ) || null
  );
}

/** Kembalikan fokus ke elemen pemicu setelah modal ditutup. Dipanggil SEGERA
 * (tidak menunggu animasi), supaya pengguna keyboard tidak "terlempar" ke
 * awal halaman. */
function restoreFocus(trigger) {
  if (!trigger || typeof trigger.focus !== "function") return;
  const target = document.contains(trigger) ? trigger : findEquivalentTrigger(trigger);
  if (target) target.focus({ preventScroll: true });
}

/** Jaga Tab/Shift+Tab tetap berputar di dalam modal teratas. */
function trapTabInModal(e, overlay) {
  const focusable = getFocusable(overlay);
  if (!focusable.length) {
    e.preventDefault();
    focusModal(overlay);
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const inside = overlay.contains(active);
  if (e.shiftKey && (active === first || !inside)) {
    e.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!e.shiftKey && (active === last || !inside)) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  }
}

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

// Satu listener untuk SEMUA modal: Escape menutup yang teratas, Tab
// diputar di dalam modal teratas (focus trap). Sengaja tidak menambah
// listener keydown baru supaya tumpukan modal tetap satu sumber kebenaran.
document.addEventListener("keydown", (e) => {
  if (!openModals.length) return;
  const top = openModals[openModals.length - 1];
  if (e.key === "Escape") {
    top.close();
    return;
  }
  if (e.key === "Tab" && top.overlay) trapTabInModal(e, top.overlay);
});

/**
 * Kontrol buka/tutup generik untuk SEMUA overlay modal: hidden -> is-open
 * lewat rAF bersarang, tutup lewat [data-modal-close], klik latar, atau
 * Escape lewat tumpukan modal di atas. Sejak M2 ini satu-satunya pemilik
 * lifecycle modal (timer hide, frame animasi, tumpukan, kunci scroll, fokus).
 *
 * options.duration    lama animasi tutup dalam ms sebelum hidden dipasang
 *                     kembali (default 180; check-in memakai 220).
 * options.onOpenFrame dipanggil di dalam rAF bersarang tepat setelah .is-open
 *                     terpasang — untuk pekerjaan yang butuh modal sudah
 *                     benar-benar dirender (mis. offsetLeft/offsetWidth).
 * options.onClose     dipanggil setiap modal benar-benar tertutup lewat jalur
 *                     mana pun (tombol, latar, Escape, close programatik),
 *                     tepat satu kali per siklus buka — guard `showing` di
 *                     close() yang menjaga close ganda tidak memanggilnya dua
 *                     kali. Pemanggil jadi tidak perlu listener Escape sendiri.
 */
function createModalController(overlay, options = {}) {
  const entry = { close: () => close(), overlay };
  const duration = Number.isFinite(options.duration) ? options.duration : 180;
  let lastTrigger = null;
  // State buka/tutup yang sebenarnya. TIDAK boleh disimpulkan dari
  // overlay.hidden: selama animasi tutup (180ms) hidden masih false padahal
  // modal sudah dianggap tertutup, dan modal yang dibuka ulang di jendela
  // itu akan terbaca "masih terbuka" sehingga pemicunya tidak tercatat.
  let showing = false;
  // Pekerjaan tertunda dari siklus sebelumnya, dibatalkan setiap kali state
  // berubah:
  // - hideTimer: setTimeout(hidden = true) milik close(). Kalau tidak
  //   dibatalkan, membuka ulang modal < 180ms setelah ditutup membuat timer
  //   lama menyembunyikan modal yang BARU dibuka.
  // - openFrame: rAF bersarang milik open() yang memasang .is-open. Kalau
  //   tidak dibatalkan, kelas itu bisa terpasang pada modal yang sudah
  //   tertutup dan bocor ke siklus berikutnya.
  let hideTimer = null;
  let openFrame = null;
  function cancelPending() {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (openFrame !== null) {
      cancelAnimationFrame(openFrame);
      openFrame = null;
    }
  }
  function open() {
    // Pemicu hanya dicatat saat modal benar-benar baru dibuka, supaya
    // membuka ulang modal yang sudah tampil tidak menimpa pemicu aslinya.
    if (!showing) lastTrigger = document.activeElement;
    cancelPending();
    showing = true;
    overlay.hidden = false;
    pushModal(entry);
    lockBodyScroll();
    // Fokus ke tombol tutup, BUKAN ke field: di HP, fokus ke input langsung
    // memunculkan keyboard tanpa diminta.
    focusModal(overlay);
    // Satu requestAnimationFrame kadang tidak cukup: browser bisa
    // menggabungkan state "hidden baru dilepas" dengan state "is-open" jadi
    // satu frame yang sama sehingga transisi terlewat (lebih sering di
    // Safari/iOS). rAF bersarang memastikan frame awal sempat digambar dulu.
    openFrame = requestAnimationFrame(() => {
      openFrame = requestAnimationFrame(() => {
        openFrame = null;
        overlay.classList.add("is-open");
        if (typeof options.onOpenFrame === "function") options.onOpenFrame();
      });
    });
  }
  function close() {
    if (!showing) return; // termasuk saat close() dipanggil dua kali
    cancelPending();
    showing = false;
    popModal(entry);
    overlay.classList.remove("is-open");
    hideTimer = setTimeout(() => {
      hideTimer = null;
      overlay.hidden = true;
    }, duration);
    unlockBodyScroll();
    restoreFocus(lastTrigger); // segera, bukan setelah animasi selesai
    lastTrigger = null;
    if (typeof options.onClose === "function") options.onClose();
  }
  overlay.querySelectorAll("[data-modal-close]").forEach((btn) => btn.addEventListener("click", close));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  return { open, close, isOpen: () => !overlay.hidden };
}

// Satu core.js dipakai semua halaman; <body data-page="..."> yang menentukan
// init mana yang jalan. Default (tanpa atribut) = dashboard. Guard `typeof`
// mempertahankan perilaku no-op kalau file halaman yang bersangkutan tidak
// dimuat — fungsi init kini berada di file per halaman, bukan di file ini.
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "transactions") {
    if (typeof initTransactionsPage === "function") initTransactionsPage();
  } else if (page === "analytics") {
    if (typeof initAnalyticsPage === "function") initAnalyticsPage();
  } else if (page === "budget") {
    if (typeof initBudgetPage === "function") initBudgetPage();
  } else if (page === "goals") {
    if (typeof initGoalsPage === "function") initGoalsPage();
  } else if (page === "settings") {
    if (typeof initSettingsPage === "function") initSettingsPage();
  } else {
    if (typeof initDashboard === "function") initDashboard();
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
  const PRESSABLE = ".btn, .icon-btn, .icon-btn-sm, .modal-close, .type-toggle-btn, .filter-chip, .settings-row-link, .link-see-all, .balance-toggle, .quick-amount, .emoji-option, .calendar-nav, .calendar-day, .bar-col";
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
