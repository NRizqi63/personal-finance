/**
 * settings.js — kode khusus settings.html (refactor JS tahap 5C).
 * Dimuat SETELAH core.js; dispatcher DOMContentLoaded di core.js yang
 * memanggil initSettingsPage() di sini. Isi disalin verbatim dari app.js,
 * urutan deklarasi asli dipertahankan. Berisi: export backup JSON/CSV
 * (Blob + <a download>), import backup (FileReader -> validateBackup ->
 * modal konfirmasi -> snapshot/tulis/rollback), reset data parsial, status
 * area Data & Backup, profil & preferensi, dan initSettingsPage.
 * Loader/saver, normalizeSettings/normalizeGoal, escapeHtml, modal &
 * focus, dan renderGreeting ada di core.js.
 */

/* ---------- Data & Backup: export (Settings V1 Tahap 3A) ----------
   Semua file dibuat di browser (Blob + <a download>). Tidak ada fetch/
   jaringan, tidak ada eval/new Function, tidak ada data yang dikirim ke
   mana pun. Import & reset menyusul di tahap berikutnya. */

// Versi FORMAT file backup (bukan versi aplikasi) — dinaikkan hanya kalau
// struktur file berubah, dipakai import nanti untuk menolak file yang lebih baru.
const BACKUP_SCHEMA_VERSION = 1;

const BACKUP_APP_ID = "personal-finance";

/**
 * Isi file backup JSON: HANYA data yang benar-benar dipersist (tiga key
 * localStorage). Mock (notifications, goal), state sesi (checkinDismissed,
 * isBalanceVisible, budgetViewDate, filter/sort, nextTransactionId) sengaja
 * TIDAK ikut — semuanya dihitung/di-reset sendiri saat aplikasi dibuka.
 */
function buildBackup(now = new Date()) {
  return {
    app: BACKUP_APP_ID,
    appName: "Personal Finance",
    schema: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(), // metadata saja; nama file memakai tanggal lokal
    counts: {
      transactions: financeData.transactions.length,
      categories: Object.keys(financeData.categories).length,
    },
    data: {
      transactions: financeData.transactions,
      budget: { monthly: financeData.budget.monthly, categories: financeData.categories },
      settings: financeData.settings,
    },
  };
}

/** Simpan teks sebagai file lewat Blob + <a download> (murni lokal). */
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Beri jeda sebelum URL dilepas supaya unduhan sempat dimulai.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nama file dengan tanggal LOKAL (toIsoDate, bukan toISOString yang UTC). */
function backupFileName(extension, now = new Date()) {
  const slug = extension === "csv" ? "transaksi" : "backup";
  return `personal-finance-${slug}-${toIsoDate(now)}.${extension}`;
}

/** Satu sel CSV: selalu dikutip (aman untuk koma, kutip, newline, emoji) +
 * lindungi dari CSV injection — sel yang diawali = + - @ (juga tab/CR)
 * diberi awalan apostrof supaya spreadsheet membacanya sebagai teks. */
function toCsvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

const CSV_HEADER = ["tanggal", "jenis", "judul", "kategori", "kategori_nama", "jumlah", "waktu"];

/** Seluruh transaksi sebagai CSV (urut terbaru dulu). Nominal ditulis
 * mentah (angka, tanpa "Rp"/pemisah ribuan) supaya bisa dihitung di
 * spreadsheet. BOM UTF-8 di depan supaya Excel membaca emoji & huruf
 * Indonesia dengan benar. */
function buildTransactionsCsv() {
  const rows = getSortedTransactions(financeData.transactions).map((tx) =>
    [tx.isoDate, tx.type, tx.title, tx.category, getCategoryLabel(tx.category), tx.amount, tx.time]
      .map(toCsvCell)
      .join(",")
  );
  return `\uFEFF${[CSV_HEADER.map(toCsvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

/**
 * SATU area status untuk semua aksi di card Data & Backup (export, import,
 * reset). Pesan terbaru menggantikan yang lama supaya tidak pernah ada dua
 * pesan menumpuk. Kebijakan tampil: pesan sukses hilang sendiri setelah
 * 4 detik, pesan error menetap sampai ada aksi berikutnya.
 */
let dataStatusTimer = 0;

function showDataStatus(text, type = "success") {
  const el = document.getElementById("settings-data-status");
  if (!el) return; // halaman ini tidak punya area status
  clearTimeout(dataStatusTimer);
  el.textContent = text;
  el.dataset.type = type;
  el.hidden = !text;
  if (type === "success" && text) dataStatusTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

/** Alias lama — dipertahankan supaya pemanggil yang sudah ada (export,
 * import, reset) tidak perlu diubah satu per satu. */
function showDataFeedback(text, type) {
  showDataStatus(text, type);
}

function exportBackupJson() {
  try {
    const backup = buildBackup();
    const name = backupFileName("json");
    downloadFile(name, JSON.stringify(backup, null, 2), "application/json");
    showDataFeedback(`Backup tersimpan sebagai ${name} (${backup.counts.transactions} transaksi, ${backup.counts.categories} kategori).`, "success");
  } catch (err) {
    showDataFeedback("Gagal membuat file backup. Coba lagi, atau periksa pengaturan unduhan browser.", "error");
  }
}

function exportTransactionsCsv() {
  try {
    const total = financeData.transactions.length;
    if (!total) {
      showDataFeedback("Belum ada transaksi yang bisa diexport.", "error");
      return;
    }
    const name = backupFileName("csv");
    downloadFile(name, buildTransactionsCsv(), "text/csv;charset=utf-8");
    showDataFeedback(`${total} transaksi tersimpan sebagai ${name}.`, "success");
  } catch (err) {
    showDataFeedback("Gagal membuat file CSV. Coba lagi, atau periksa pengaturan unduhan browser.", "error");
  }
}

const IMPORT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const IMPORT_TITLE_MAX = 120;

const IMPORT_TIME_MAX = 40;

const IMPORT_NAME_MAX = 40;

const IMPORT_EMOJI_MAX = 8;

// Key kategori yang aman dipakai sebagai atribut & key objek.
const CATEGORY_KEY_PATTERN = /^[A-Za-z0-9_.:@+-]{1,40}$/;

// Notifikasi hasil operasi data (import & reset) yang bertahan satu kali
// melewati reload. Key sendiri — TIDAK pernah menyentuh "checkinDismissed".
// Nilai key sengaja tidak diubah supaya notice yang sudah tersimpan di sesi
// berjalan tetap terbaca setelah pembaruan ini.
const DATA_NOTICE_KEY = "financeData.importNotice";

// Tiga key yang boleh disentuh proses import (urutan penulisan: yang paling
// besar dulu, supaya kegagalan kuota terjadi sebelum key lain berubah).
const IMPORT_STORAGE_KEYS = [TRANSACTIONS_STORAGE_KEY, BUDGET_STORAGE_KEY, SETTINGS_STORAGE_KEY];

// Key yang dihapus per jenis reset. Menghapus key = aplikasi kembali memakai
// nilai awalnya sendiri: transaksi kosong, budget seed (Rp2.400.000 + 5
// kategori bawaan), settings default ({Rizqi, false, true}). Reset seluruh
// data belum termasuk di sini.
const DATA_RESET_TARGETS = {
  transactions: [TRANSACTIONS_STORAGE_KEY],
  budget: [BUDGET_STORAGE_KEY],
  settings: [SETTINGS_STORAGE_KEY],
};

// Pesan hasil per jenis reset (dipakai notice setelah reload).
const DATA_RESET_MESSAGES = {
  transactions: "Semua transaksi sudah dihapus. Budget, kategori, dan pengaturan tidak berubah.",
  budget: "Budget & kategori sudah dikembalikan ke pengaturan bawaan. Transaksi tidak berubah.",
  settings: "Profil & preferensi sudah dikembalikan ke default. Transaksi dan budget tidak berubah.",
};

// Label singkat untuk pesan kegagalan.
const DATA_RESET_LABELS = {
  transactions: "Hapus semua transaksi",
  budget: "Reset budget & kategori",
  settings: "Reset profil & preferensi",
};

// Hasil pemeriksaan file terakhir — HANYA di memori, tidak dipersist.
// Diisi di Tahap 3B-1, dipakai untuk menerapkan data di tahap berikutnya.
let pendingImport = null;

/** Hasil pemeriksaan file yang sedang menunggu konfirmasi (null kalau tidak
 * ada). Dipakai tahap berikutnya saat menerapkan backup. */
function getPendingImport() {
  return pendingImport;
}

/** Key kategori dari file: harus string, berpola aman, dan bukan key yang
 * bisa mengutak-atik prototype. Selain itu -> "lainnya". */
function normalizeCategoryKey(key) {
  if (typeof key !== "string" || !isSafeObjectKey(key) || !CATEGORY_KEY_PATTERN.test(key)) return null;
  return key;
}

/** Budget dari file -> bentuk aplikasi { monthly, categories }. Objek baru
 * (bukan hasil JSON mentah), key berbahaya dilewati, kategori tidak lengkap
 * dilewati dan dihitung. Rusak total -> default aplikasi. */
function normalizeBudgetData(raw) {
  const fallback = () => ({ budget: { monthly: DEFAULT_MONTHLY_BUDGET, categories: cloneDefaultCategories() }, usedFallback: true, skipped: 0 });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback();

  const monthly = Number.isFinite(raw.monthly) && raw.monthly >= 0 ? raw.monthly : null;
  if (!raw.categories || typeof raw.categories !== "object" || Array.isArray(raw.categories)) {
    const fb = fallback();
    if (monthly !== null) fb.budget.monthly = monthly; // monthly masih bisa dipakai
    return fb;
  }

  const categories = {};
  let skipped = 0;
  Object.entries(raw.categories).forEach(([key, cat]) => {
    const safeKey = normalizeCategoryKey(key);
    if (!safeKey || !cat || typeof cat !== "object" || Array.isArray(cat)) { skipped += 1; return; }
    const name = typeof cat.name === "string" ? cat.name.trim() : "";
    if (!name || name.length > IMPORT_NAME_MAX) { skipped += 1; return; }
    if (!Number.isFinite(cat.budget) || cat.budget < 0) { skipped += 1; return; }
    const emoji = typeof cat.emoji === "string" && cat.emoji && cat.emoji.length <= IMPORT_EMOJI_MAX ? cat.emoji : FALLBACK_CATEGORY.emoji;
    categories[safeKey] = { name, emoji, budget: cat.budget };
  });

  return {
    budget: { monthly: monthly === null ? DEFAULT_MONTHLY_BUDGET : monthly, categories },
    usedFallback: monthly === null,
    skipped,
  };
}

/**
 * Periksa isi file backup JSON. FUNGSI MURNI: tidak menyentuh DOM,
 * localStorage, maupun state aplikasi — hanya menerima teks dan
 * mengembalikan hasil pemeriksaan.
 *
 * Hasil: { ok, errors[], warnings[], data|null, counts{totalRows,validRows,
 * skippedRows}, skipped{alasan:n}, meta{...} }. `data` hanya diisi kalau ok.
 */
function validateBackup(rawText) {
  const errors = [];
  const warnings = [];
  const skipped = { shape: 0, title: 0, amount: 0, type: 0, isoDate: 0 };
  const meta = {
    exportedAt: null, appVersion: null, schema: null,
    budgetFound: false, settingsFound: false, budgetFallback: false, settingsFallback: false,
    categories: 0, categoriesSkipped: 0, monthly: 0,
    unknownCategories: [], idsRenumbered: false, duplicateIds: 0, invalidIds: 0,
  };
  const fail = (message) => {
    errors.push(message);
    return { ok: false, errors, warnings, data: null, counts: { totalRows: 0, validRows: 0, skippedRows: 0 }, skipped, meta };
  };

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    return fail("File ini bukan file backup JSON yang bisa dibaca. Pilih file hasil Export Backup (JSON) dari aplikasi ini.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail("Isi file tidak sesuai format backup aplikasi ini.");
  }
  if (parsed.app !== BACKUP_APP_ID) {
    return fail("File ini sepertinya berasal dari aplikasi lain. Import hanya menerima backup dari Personal Finance.");
  }
  if (!Number.isFinite(parsed.schema)) {
    return fail("File backup tidak menyebutkan versi formatnya, jadi tidak bisa dibaca.");
  }
  if (parsed.schema > BACKUP_SCHEMA_VERSION) {
    return fail(`File ini dibuat oleh versi aplikasi yang lebih baru (format ${parsed.schema}). Perbarui aplikasi dulu, lalu coba lagi.`);
  }
  if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
    return fail("Bagian data tidak ditemukan di file ini.");
  }
  if (!Array.isArray(parsed.data.transactions)) {
    return fail("Bagian data transaksi tidak ditemukan di file ini.");
  }

  meta.schema = parsed.schema;
  meta.exportedAt = typeof parsed.exportedAt === "string" && !isNaN(Date.parse(parsed.exportedAt)) ? parsed.exportedAt : null;
  meta.appVersion = typeof parsed.appVersion === "string" ? parsed.appVersion : null;

  // ---------- transaksi ----------
  const rawRows = parsed.data.transactions;
  const seenIds = new Set();
  const rows = [];
  rawRows.forEach((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { skipped.shape += 1; return; }

    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title || title.length > IMPORT_TITLE_MAX) { skipped.title += 1; return; }

    // Nominal WAJIB number: string angka sengaja tidak diterima diam-diam.
    if (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount <= 0) { skipped.amount += 1; return; }

    // "investment" = jenis lama yang sudah menyatu ke pengeluaran.
    const type = raw.type === "investment" ? "expense" : raw.type;
    if (type !== "income" && type !== "expense") { skipped.type += 1; return; }

    if (!isValidIsoDate(raw.isoDate)) { skipped.isoDate += 1; return; }

    const category = normalizeCategoryKey(raw.category) || FALLBACK_CATEGORY.key;
    const time = typeof raw.time === "string" && raw.time.length <= IMPORT_TIME_MAX ? raw.time : "";

    // id dari file dicatat untuk laporan, TAPI tidak dipakai sebagai id final.
    if (!Number.isFinite(raw.id)) meta.invalidIds += 1;
    else if (seenIds.has(raw.id)) meta.duplicateIds += 1;
    else seenIds.add(raw.id);

    rows.push({ title, category, type, amount: raw.amount, isoDate: raw.isoDate, time });
  });

  const skippedRows = Object.values(skipped).reduce((sum, n) => sum + n, 0);
  if (rawRows.length > 0 && rows.length === 0) {
    return fail("Tidak ada transaksi yang bisa dibaca dari file ini, jadi import dibatalkan. Data kamu tidak berubah.");
  }

  // Penomoran ulang MENURUN mengikuti urutan file: elemen pertama mendapat id
  // tertinggi, sama seperti transaksi terbaru di aplikasi (urutan tampilan
  // tetap sama, dan id berikutnya tidak akan bentrok).
  const total = rows.length;
  const transactions = rows.map((row, index) => ({ id: total - index, ...row }));
  meta.idsRenumbered = meta.invalidIds > 0 || meta.duplicateIds > 0 || total > 0;

  // ---------- budget ----------
  meta.budgetFound = !!parsed.data.budget && typeof parsed.data.budget === "object" && !Array.isArray(parsed.data.budget);
  const budgetResult = normalizeBudgetData(parsed.data.budget);
  meta.budgetFallback = !meta.budgetFound || budgetResult.usedFallback;
  meta.categories = Object.keys(budgetResult.budget.categories).length;
  meta.categoriesSkipped = budgetResult.skipped;
  meta.monthly = budgetResult.budget.monthly;
  if (!meta.budgetFound) warnings.push("Data budget tidak ada di file, jadi budget default aplikasi yang akan dipakai.");
  else if (budgetResult.usedFallback) warnings.push("Budget bulanan di file tidak terbaca, jadi nilai default yang akan dipakai.");
  if (budgetResult.skipped) warnings.push(`${budgetResult.skipped} kategori dilewati karena datanya tidak lengkap.`);

  // ---------- settings ----------
  meta.settingsFound = !!parsed.data.settings && typeof parsed.data.settings === "object" && !Array.isArray(parsed.data.settings);
  const settings = normalizeSettings(meta.settingsFound ? parsed.data.settings : null);
  meta.settingsFallback = !meta.settingsFound;
  if (!meta.settingsFound) warnings.push("Pengaturan tidak ada di file, jadi pengaturan default yang akan dipakai.");

  // ---------- kategori transaksi yang tidak dikenal ----------
  const unknown = new Set();
  transactions.forEach((tx) => {
    if (!Object.prototype.hasOwnProperty.call(budgetResult.budget.categories, tx.category)) unknown.add(tx.category);
  });
  meta.unknownCategories = [...unknown];
  if (unknown.size) warnings.push(`${unknown.size} kategori pada transaksi tidak ada di daftar budget dan akan tampil sebagai "${FALLBACK_CATEGORY.name}".`);
  if (skippedRows) warnings.push(`${skippedRows} baris transaksi dilewati karena datanya tidak lengkap atau tidak valid.`);

  return {
    ok: true,
    errors,
    warnings,
    data: { transactions, budget: budgetResult.budget, settings },
    counts: { totalRows: rawRows.length, validRows: transactions.length, skippedRows },
    skipped,
    meta,
  };
}

/** Salin nilai ASLI ketiga key sebelum ditimpa. null = key memang belum ada
 * (rollback akan menghapusnya lagi, bukan menulis "null"). Hanya di memori,
 * tidak pernah ditulis balik ke storage sebagai key cadangan. */
function snapshotStorage(keys = IMPORT_STORAGE_KEYS) {
  const snapshot = {};
  keys.forEach((key) => {
    snapshot[key] = localStorage.getItem(key); // string atau null
  });
  return snapshot;
}

/** Tulis data HASIL VALIDASI (bukan JSON mentah dari file) ke tiga key.
 * Melempar kalau salah satu setItem gagal — pemanggil yang melakukan
 * rollback. Sengaja tidak memakai saveTransactions/saveBudget/saveSettings
 * yang menelan error di dalam try/catch-nya sendiri. */
function writeImportedData(data) {
  localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(data.transactions));
  localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify({ monthly: data.budget.monthly, categories: data.budget.categories }));
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data.settings));
}

/** Kembalikan ketiga key ke kondisi snapshot. Key yang tadinya tidak ada
 * DIHAPUS lagi (removeItem), bukan diisi string kosong. Tidak pernah
 * memakai localStorage.clear() dan tidak menyentuh key lain.
 * Mengembalikan true kalau semua berhasil dipulihkan. */
function rollbackStorage(snapshot, keys = IMPORT_STORAGE_KEYS) {
  let restored = true;
  keys.forEach((key) => {
    const value = snapshot[key];
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (err) {
      restored = false;
    }
  });
  return restored;
}

/** Hapus beberapa key localStorage. HANYA removeItem, hanya key yang
 * diberikan — tidak pernah localStorage.clear(). Melempar kalau gagal
 * supaya pemanggil bisa melakukan rollback. */
function removeStorageKeys(keys) {
  keys.forEach((key) => {
    localStorage.removeItem(key);
  });
}

/** Simpan pesan sukses satu kali pakai (dibaca setelah reload) — dipakai
 * bersama oleh import dan reset. */
function setDataNotice(text) {
  try {
    sessionStorage.setItem(DATA_NOTICE_KEY, text);
  } catch (err) {
    // sessionStorage tidak tersedia — pesan cukup dilewati.
  }
}

/** Baca pesan hasil operasi data lalu HAPUS (sekali tampil). null kalau
 * tidak ada. Tidak menyentuh checkinDismissed. */
function consumeDataNotice() {
  try {
    const text = sessionStorage.getItem(DATA_NOTICE_KEY);
    if (text !== null) sessionStorage.removeItem(DATA_NOTICE_KEY);
    return text;
  } catch (err) {
    return null;
  }
}

/** Muat ulang halaman — dipisah supaya alur import bisa diuji tanpa reload. */
function reloadPage() {
  window.location.reload();
}

/**
 * Terapkan hasil pemeriksaan file ke localStorage: snapshot -> tulis tiga
 * key -> (gagal) rollback. Tidak menyentuh DOM dan tidak memuat ulang
 * halaman; pemanggil yang mengurus tampilan & reload.
 * Hasil: { ok, code, message }.
 */
function applyPendingImport() {
  // Data diambil dari hasil validator di memori, BUKAN dibaca ulang dari DOM.
  const pending = getPendingImport();
  if (!pending || !pending.ok || !pending.data || !Array.isArray(pending.data.transactions)) {
    return { ok: false, code: "no-pending", message: "File backup sudah tidak tersedia. Pilih ulang filenya lalu coba lagi." };
  }

  let snapshot;
  try {
    snapshot = snapshotStorage();
  } catch (err) {
    return { ok: false, code: "storage-unavailable", message: "Penyimpanan browser tidak bisa diakses, jadi import dibatalkan. Data kamu tidak berubah." };
  }

  try {
    writeImportedData(pending.data);
  } catch (err) {
    const restored = rollbackStorage(snapshot);
    return restored
      ? { ok: false, code: "write-failed", message: "Import gagal di tengah jalan (penyimpanan browser penuh atau tidak bisa ditulis). Data lama sudah dikembalikan seperti semula." }
      : { ok: false, code: "rollback-failed", message: "⚠️ Import gagal dan data lama belum bisa dikembalikan sepenuhnya. Jangan tutup atau menyegarkan halaman ini dulu — coba import ulang file backup kamu sekarang." };
  }

  const counts = pending.counts;
  pendingImport = null; // sudah diterapkan; jangan bisa dipakai dua kali
  setDataNotice(`Import berhasil: ${counts.validRows} transaksi dipulihkan dari file backup.`);
  return { ok: true, code: "applied", message: `Import berhasil: ${counts.validRows} transaksi dipulihkan.` };
}

/**
 * Jalankan satu jenis reset: snapshot -> hapus key target -> (gagal)
 * rollback. Tidak menyentuh DOM, tidak memuat ulang halaman, tidak pernah
 * memakai localStorage.clear(), dan tidak menyentuh key di luar targetnya
 * (termasuk sessionStorage "checkinDismissed").
 * Hasil: { ok, code, message }.
 */
function applyDataReset(targetName) {
  const keys = Object.prototype.hasOwnProperty.call(DATA_RESET_TARGETS, targetName) ? DATA_RESET_TARGETS[targetName] : null;
  if (!keys) {
    return { ok: false, code: "unknown-target", message: "Jenis reset tidak dikenali. Muat ulang halaman lalu coba lagi." };
  }

  let snapshot;
  try {
    snapshot = snapshotStorage(keys);
  } catch (err) {
    return { ok: false, code: "storage-unavailable", message: "Penyimpanan browser tidak bisa diakses, jadi tidak ada yang dihapus." };
  }

  try {
    removeStorageKeys(keys);
  } catch (err) {
    const restored = rollbackStorage(snapshot, keys);
    const label = DATA_RESET_LABELS[targetName];
    return restored
      ? { ok: false, code: "reset-failed", message: `${label} gagal dijalankan. Data lama sudah dikembalikan seperti semula.` }
      : { ok: false, code: "rollback-failed", message: `⚠️ ${label} gagal dan data lama belum bisa dikembalikan sepenuhnya. Jangan tutup atau menyegarkan halaman ini dulu.` };
  }

  // Hasil pemeriksaan file lama tidak lagi relevan setelah data berubah.
  pendingImport = null;
  const message = DATA_RESET_MESSAGES[targetName];
  setDataNotice(message);
  return { ok: true, code: "reset-applied", message };
}

/** Baca file sebagai teks di browser (FileReader) — tanpa jaringan. */
function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-error"));
    reader.onabort = () => reject(new Error("read-abort"));
    reader.readAsText(file);
  });
}

/** Alias lama untuk status import/reset — kini menulis ke area status yang
 * sama dengan export (lihat showDataStatus). */
function showImportFeedback(text, type) {
  showDataStatus(text, type);
}

/** Ringkasan isi file — dibangun dengan textContent (tidak pernah innerHTML),
 * jadi isi file tidak bisa menyuntikkan markup. */
function renderImportSummary(result, target) {
  const box = target || document.getElementById("import-summary");
  if (!box) return;
  box.textContent = "";
  if (!result) {
    box.hidden = true;
    return;
  }
  renderMetaRows(box, [
    ["Diexport", result.meta.exportedAt ? formatDateLongID(toIsoDate(new Date(result.meta.exportedAt))) : "tidak diketahui"],
    ["Transaksi valid", `${result.counts.validRows} dari ${result.counts.totalRows}`],
    ["Baris dilewati", String(result.counts.skippedRows)],
    ["Kategori", `${result.meta.categories}${result.meta.budgetFallback ? " (default aplikasi)" : ""}`],
    ["Budget bulanan", formatRupiah(result.meta.monthly)],
    ["Pengaturan", result.meta.settingsFallback ? "default aplikasi" : "dari file"],
    ["Data saat ini", `${financeData.transactions.length} transaksi akan diganti`],
  ]);
}

/** Isi <dl class="settings-meta"> dengan pasangan label-nilai. Selalu
 * textContent — nilai yang berasal dari data user tidak pernah jadi HTML. */
function renderMetaRows(box, rows) {
  box.textContent = "";
  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "settings-meta-row";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    row.append(dt, dd);
    box.append(row);
  });
  box.hidden = false;
}

/** Proses satu file yang dipilih user: cek ukuran & jenis, baca, validasi.
 * TIDAK menyentuh localStorage sama sekali. */
async function handleImportFile(file) {
  pendingImport = null;
  renderImportSummary(null);

  if (!file) return;
  const isJsonName = /\.json$/i.test(file.name || "");
  const isJsonType = file.type === "application/json" || file.type === "text/json";
  if (!isJsonName && !isJsonType) {
    showImportFeedback("Pilih file .json hasil Export Backup dari aplikasi ini.", "error");
    return;
  }
  if (!file.size) {
    showImportFeedback("File yang dipilih kosong.", "error");
    return;
  }
  if (file.size > IMPORT_MAX_BYTES) {
    showImportFeedback("Ukuran file melebihi 5 MB, jadi tidak bisa diproses. Gunakan file backup yang lebih baru.", "error");
    return;
  }

  let text;
  try {
    text = await readBackupFile(file);
  } catch (err) {
    showImportFeedback("File tidak bisa dibaca. Coba pilih ulang filenya.", "error");
    return;
  }

  const result = validateBackup(text);
  if (!result.ok) {
    showImportFeedback(result.errors[0], "error");
    return;
  }

  pendingImport = result;
  renderImportSummary(result);
  const extra = result.warnings.length ? ` ${result.warnings.join(" ")}` : "";
  showImportFeedback(`File backup valid: ${result.counts.validRows} transaksi siap dipulihkan.${extra} Data kamu BELUM diganti — periksa ringkasannya, lalu pilih "Timpa Data" kalau sudah yakin.`, "success");
}

// Sedang menulis/menghapus data? Satu guard untuk SEMUA operasi data
// (import & reset), supaya keduanya tidak pernah berjalan bersamaan dan
// klik ganda tidak menjalankan operasi dua kali.
let dataOpBusy = false;

/** Pasang tombol & input file import + modal konfirmasinya. */
function setupSettingsImport() {
  const pickBtn = document.getElementById("btn-import-pick");
  if (!pickBtn) return; // bukan di halaman pengaturan
  const input = document.getElementById("import-file");
  const overlay = document.getElementById("import-modal-overlay");
  // Ditutup lewat jalur mana pun (tombol Batal, ikon ✕, klik latar, Escape
  // dari tumpukan modal global) -> hasil pemeriksaan dibuang.
  const modal = createModalController(overlay, { onClose: handleImportModalClosed });
  const applyBtn = document.getElementById("btn-import-apply");
  const cancelBtn = document.getElementById("btn-import-cancel");
  const closeBtn = document.getElementById("import-modal-close");
  const exportFirstBtn = document.getElementById("btn-import-export-first");
  const status = document.getElementById("import-modal-status");
  // true = modal ditutup oleh kode (mis. setelah error), bukan dibatalkan user.
  let silentClose = false;

  function setStatus(text, type) {
    status.textContent = text;
    status.dataset.type = type || "success";
    status.hidden = !text;
  }

  /** Dipanggil setiap modal tertutup: buang hasil pemeriksaan supaya file
   * harus dipilih ulang. Tidak menyentuh data sama sekali. */
  function handleImportModalClosed() {
    if (dataOpBusy) return; // ditutup saat proses menulis berjalan
    pendingImport = null;
    renderImportSummary(null);
    setStatus("", "success");
    if (!silentClose) showImportFeedback("Import dibatalkan. Tidak ada data yang berubah.", "error");
    silentClose = false;
  }

  // "Export dulu": memakai fungsi export JSON yang sama dengan Tahap 3A.
  // Tidak menyentuh data aktif dan TIDAK membuang hasil pemeriksaan, jadi
  // user bisa langsung melanjutkan ke "Timpa Data".
  cancelBtn.addEventListener("click", () => modal.close());
  closeBtn.addEventListener("click", () => modal.close());

  exportFirstBtn.addEventListener("click", () => {
    exportBackupJson();
    setStatus("Backup data saat ini sudah diunduh. Kamu bisa lanjut menimpa data.", "success");
  });

  applyBtn.addEventListener("click", () => {
    if (dataOpBusy) return; // klik ganda / operasi lain sedang jalan
    dataOpBusy = true;
    [applyBtn, cancelBtn, closeBtn, exportFirstBtn].forEach((btn) => { btn.disabled = true; });
    setStatus("Menerapkan data…", "success");

    const result = applyPendingImport();
    if (result.ok) {
      // Semua penulisan sukses -> muat ulang supaya seluruh halaman membaca
      // data baru (termasuk nomor id transaksi berikutnya).
      renderImportSummary(null);
      reloadPage();
      return;
    }

    dataOpBusy = false;
    [applyBtn, cancelBtn, closeBtn, exportFirstBtn].forEach((btn) => { btn.disabled = false; });
    setStatus(result.message, "error");
    if (result.code !== "rollback-failed") {
      silentClose = true; // pesan errornya sendiri yang ditampilkan
      modal.close();
      showImportFeedback(result.message, "error");
    }
  });

  pickBtn.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    // Kosongkan value supaya memilih file yang SAMA dua kali tetap memicu change.
    input.value = "";
    handleImportFile(file).then(() => {
      if (!getPendingImport()) return; // file ditolak -> modal tidak dibuka
      renderImportSummary(getPendingImport(), document.getElementById("import-modal-summary"));
      setStatus("", "success");
      modal.open();
    });
  });
}

/** Judul, penjelasan, label tombol, dan ringkasan dampak tiap jenis reset —
 * dihitung dari data yang sedang aktif saat modal dibuka. */
function getResetPlan(target) {
  const txCount = financeData.transactions.length;
  const defaultCategoryCount = Object.keys(DEFAULT_CATEGORIES).length;
  if (target === "transactions") {
    return {
      title: "Hapus Semua Transaksi?",
      sub: "Seluruh catatan pemasukan dan pengeluaran akan dihapus dari browser ini. Tindakan ini tidak bisa dibatalkan.",
      action: "Hapus Transaksi",
      rows: [
        ["Transaksi dihapus", `${txCount} transaksi`],
        ["Budget & kategori", "tetap"],
        ["Profil & preferensi", "tetap"],
      ],
    };
  }
  if (target === "budget") {
    return {
      title: "Reset Budget & Kategori?",
      sub: "Budget bulanan dan daftar kategori kembali ke pengaturan bawaan aplikasi. Transaksi tidak dihapus.",
      action: "Reset Budget",
      rows: [
        ["Budget bulanan", `kembali ke ${formatRupiah(DEFAULT_MONTHLY_BUDGET)}`],
        ["Kategori", `kembali ke ${defaultCategoryCount} kategori bawaan`],
        ["Transaksi", `tetap (${txCount} transaksi)`],
        ["Profil & preferensi", "tetap"],
      ],
    };
  }
  return {
    title: "Reset Profil & Preferensi?",
    sub: "Nama panggilan dan preferensi tampilan kembali ke setelan awal. Transaksi dan budget tidak disentuh.",
    action: "Reset Profil",
    rows: [
      ["Nama pengguna", `kembali ke "${DEFAULT_SETTINGS.name}"`],
      ["Sembunyikan saldo saat dibuka", "kembali ke: tidak"],
      ["Check-in harian", "kembali ke: tampil"],
      ["Transaksi & budget", "tetap"],
    ],
  };
}

/** Zona Berbahaya: tiga tombol reset + satu modal konfirmasi yang dipakai
 * bersama. Tidak ada perubahan data sampai tombol aksi di modal ditekan. */
function setupSettingsReset() {
  const zone = document.getElementById("reset-actions");
  if (!zone) return; // bukan di halaman pengaturan
  const overlay = document.getElementById("reset-modal-overlay");
  const modal = createModalController(overlay, { onClose: handleResetModalClosed });
  const titleEl = document.getElementById("reset-modal-title");
  const subEl = document.getElementById("reset-modal-sub");
  const summaryEl = document.getElementById("reset-modal-summary");
  const status = document.getElementById("reset-modal-status");
  const confirmBtn = document.getElementById("btn-reset-confirm");
  const cancelBtn = document.getElementById("btn-reset-cancel");
  const closeBtn = document.getElementById("reset-modal-close");
  const exportFirstBtn = document.getElementById("btn-reset-export-first");
  const buttons = [confirmBtn, cancelBtn, closeBtn, exportFirstBtn];

  let activeTarget = null;
  let silentClose = false;

  function setStatus(text, type) {
    status.textContent = text;
    status.dataset.type = type || "success";
    status.hidden = !text;
  }

  function handleResetModalClosed() {
    if (dataOpBusy) return; // sedang menghapus; jangan ganggu
    activeTarget = null;
    setStatus("", "success");
    if (!silentClose) showImportFeedback("Reset dibatalkan. Tidak ada data yang berubah.", "error");
    silentClose = false;
  }

  zone.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reset-target]");
    if (!btn || dataOpBusy) return;
    const target = btn.dataset.resetTarget;
    if (!Object.prototype.hasOwnProperty.call(DATA_RESET_TARGETS, target)) return;
    activeTarget = target;
    const plan = getResetPlan(target);
    titleEl.textContent = plan.title;
    subEl.textContent = plan.sub;
    confirmBtn.textContent = plan.action;
    renderMetaRows(summaryEl, plan.rows);
    setStatus("", "success");
    modal.open();
  });

  cancelBtn.addEventListener("click", () => modal.close());
  closeBtn.addEventListener("click", () => modal.close());

  // Export memakai fungsi yang sama dengan tombol Export Backup (Tahap 3A):
  // isinya data yang MASIH aktif, dan modal tetap terbuka.
  exportFirstBtn.addEventListener("click", () => {
    exportBackupJson();
    setStatus("Backup data saat ini sudah diunduh. Kamu bisa lanjut menghapus.", "success");
  });

  confirmBtn.addEventListener("click", () => {
    if (dataOpBusy || !activeTarget) return;
    dataOpBusy = true;
    buttons.forEach((btn) => { btn.disabled = true; });
    setStatus("Menghapus data…", "success");

    const result = applyDataReset(activeTarget);
    if (result.ok) {
      // Reload hanya setelah removeItem selesai tanpa error, supaya seluruh
      // halaman (dan nextTransactionId) dihitung ulang dari data terbaru.
      reloadPage();
      return;
    }

    dataOpBusy = false;
    buttons.forEach((btn) => { btn.disabled = false; });
    setStatus(result.message, "error");
    if (result.code !== "rollback-failed") {
      silentClose = true; // pesan errornya sendiri yang ditampilkan
      modal.close();
      showImportFeedback(result.message, "error");
    }
  });
}

/** Pasang tombol export di section Data & Backup. */
function setupSettingsData() {
  const jsonBtn = document.getElementById("btn-export-json");
  if (!jsonBtn) return; // bukan di halaman pengaturan
  jsonBtn.addEventListener("click", exportBackupJson);
  document.getElementById("btn-export-csv").addEventListener("click", exportTransactionsCsv);
}

/**
 * Halaman "Pengaturan" (settings.html) — Settings V1 Tahap 1: fondasi.
 * Belum ada state yang disimpan; isinya tautan ke budget.html, info
 * keamanan, dan Tentang Aplikasi. Fungsi ini aman dipanggil di halaman
 * mana pun (no-op kalau elemennya tidak ada). Tahap berikutnya (profil,
 * preferensi, export/import, reset) ditambahkan di sini.
 */
const APP_VERSION = "V2.2";

function initSettingsPage() {
  const version = document.getElementById("settings-app-version");
  if (!version) return; // bukan di halaman pengaturan
  version.textContent = APP_VERSION;

  setupSettingsProfile();
  setupSettingsPreferences();
  setupSettingsData();
  setupSettingsImport();
  setupSettingsReset();

  // Pesan hasil operasi data (import/reset) dari sesi sebelum reload —
  // ditampilkan sekali lalu key-nya dihapus.
  const notice = consumeDataNotice();
  if (notice) showImportFeedback(notice, "success");

  // Deep-link dari dropdown dashboard ("Tentang Aplikasi" -> #tentang):
  // scroll halus ke section-nya setelah render, tanpa mengubah URL lagi.
  const hash = window.location.hash.replace(/^#/, "");
  const target = hash && document.getElementById(hash);
  if (target && target.classList.contains("settings-section")) {
    requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
}

/**
 * Settings > Profil Akun: nama panggilan. Preview sapaan ikut ketikan
 * (tanpa menyimpan); localStorage hanya ditulis saat "Simpan Perubahan".
 * Validasi: kosong / hanya spasi ditolak, dipangkas, maks. 40 karakter.
 * Feedback inline (#settings-name-feedback), bukan alert().
 */
function setupSettingsProfile() {
  const form = document.getElementById("settings-profile-form");
  if (!form) return; // bukan di halaman pengaturan
  const input = document.getElementById("settings-name");
  const preview = document.getElementById("settings-name-preview");
  const feedback = document.getElementById("settings-name-feedback");
  let feedbackTimer = 0;

  function renderPreview() {
    const name = normalizeUserName(input.value) || DEFAULT_SETTINGS.name;
    preview.textContent = `${getGreetingWord()}, ${name}`;
  }

  function showFeedback(text, type) {
    clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.dataset.type = type;
    feedback.hidden = !text;
    // Pesan sukses hilang sendiri; pesan error tetap sampai input diperbaiki.
    if (type === "success") feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 2500);
  }

  input.value = getUserName();
  input.maxLength = USER_NAME_MAX_LENGTH;
  renderPreview();

  input.addEventListener("input", () => {
    input.setCustomValidity("");
    input.removeAttribute("aria-invalid");
    if (feedback.dataset.type === "error") showFeedback("", "");
    renderPreview();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value;
    const name = normalizeUserName(raw);
    if (!name) {
      const msg = raw.trim().length > USER_NAME_MAX_LENGTH
        ? `Nama maksimal ${USER_NAME_MAX_LENGTH} karakter.`
        : "Nama tidak boleh kosong.";
      input.setAttribute("aria-invalid", "true");
      showFeedback(msg, "error");
      input.focus();
      return;
    }
    financeData.settings.name = name;
    saveSettings();
    input.value = name; // tampilkan versi yang sudah dipangkas
    renderPreview();
    renderGreeting(); // no-op di sini; dashboard membaca settings saat dibuka
    showFeedback(`Nama tersimpan. Sapaan di dashboard: "${getGreetingWord()}, ${name}".`, "success");
  });
}

/**
 * Settings > Preferensi Aplikasi: dua switch (checkbox) yang langsung
 * disimpan saat diubah. hideBalanceOnOpen = preferensi awal saat dashboard
 * dibuka (tombol mata tetap bekerja); showCheckin = izin popup check-in
 * (dismiss per sesi tetap lewat sessionStorage).
 */
function setupSettingsPreferences() {
  const hideBalance = document.getElementById("pref-hide-balance");
  const showCheckin = document.getElementById("pref-show-checkin");
  if (!hideBalance || !showCheckin) return; // bukan di halaman pengaturan
  const feedback = document.getElementById("settings-pref-feedback");
  let feedbackTimer = 0;

  hideBalance.checked = financeData.settings.hideBalanceOnOpen;
  showCheckin.checked = financeData.settings.showCheckin;

  function saved(text) {
    clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.hidden = false;
    feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 2500);
  }

  hideBalance.addEventListener("change", () => {
    financeData.settings.hideBalanceOnOpen = hideBalance.checked;
    saveSettings();
    saved(hideBalance.checked ? "Saldo akan disembunyikan saat dashboard dibuka." : "Saldo akan langsung tampil saat dashboard dibuka.");
  });
  showCheckin.addEventListener("change", () => {
    financeData.settings.showCheckin = showCheckin.checked;
    saveSettings();
    saved(showCheckin.checked ? "Check-in harian akan tampil saat membuka dashboard." : "Check-in harian tidak akan tampil otomatis.");
  });
}
