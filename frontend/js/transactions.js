/**
 * transactions.js — kode khusus transactions.html (refactor JS tahap 5B).
 * Dimuat SETELAH core.js dan transactions-shared.js; dispatcher
 * DOMContentLoaded di core.js yang memanggil initTransactionsPage() di sini.
 * Isi disalin verbatim dari app.js, urutan deklarasi asli dipertahankan.
 * Berisi: kalender bulan, cari & filter & urutkan, daftar semua transaksi
 * (dengan tombol edit/hapus), dan initTransactionsPage. State halaman
 * (transactionsPage), modal tambah/edit/hapus, handleTransactionListClick,
 * dan refreshDashboard ada di transactions-shared.js; komponen item
 * transaksi & helper tanggal ada di core.js.
 */

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
      const key = hasCategory(tx.category) ? tx.category : FALLBACK_CATEGORY.key;
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
    ([key, cat]) => `<option value="${escapeHtml(key)}">${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}</option>`
  );
  if (!hasCategory(FALLBACK_CATEGORY.key)) {
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
