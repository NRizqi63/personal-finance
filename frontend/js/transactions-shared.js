/**
 * transactions-shared.js — modal Tambah/Edit/Hapus transaksi & refresh
 * setelah CRUD (refactor JS tahap 1). Dipakai index.html dan
 * transactions.html; dimuat SETELAH core.js, SEBELUM file halaman.
 * Isi disalin verbatim dari app.js; satu-satunya perubahan adalah guard
 * `typeof` di refreshDashboard() (lihat komentarnya).
 */

/**
 * Render ulang bagian-bagian yang bergantung pada data transaksi, setelah
 * CRUD. Dipanggil dari dua halaman (dashboard & halaman Semua Transaksi)
 * yang punya set elemen berbeda — masing-masing render function sudah
 * no-op sendiri kalau elemen targetnya tidak ada di halaman ini.
 */
function refreshDashboard() {
  // Hasil penulisan diteruskan ke pemanggil: CRUD transaksi tidak boleh
  // mengklaim "tersimpan" kalau localStorage menolak (private browsing /
  // kuota penuh). Render tetap dijalankan supaya layar selalu memperlihatkan
  // isi financeData yang sebenarnya — termasuk sesudah pemanggil rollback.
  const stored = saveTransactions();
  recalcFromTransactions();
  // Guard `typeof`: render function halaman lain kini hidup di file halaman
  // masing-masing (dashboard.js / budget.js / transactions.js) dan tidak
  // dimuat di semua halaman. Dulu semuanya ada di app.js dan no-op sendiri
  // kalau elemennya tidak ada — guard ini mempertahankan no-op yang sama.
  if (typeof renderSummary === "function") renderSummary(financeData.summary);
  renderBudgetSummary(); // core.js: dipakai dashboard & budget
  if (typeof renderCategoryList === "function") renderCategoryList();
  if (typeof renderRecentTransactions === "function") renderRecentTransactions();
  if (typeof renderAllTransactionsList === "function") renderAllTransactionsList();
  return stored;
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
      // Simpan posisi & objeknya dulu: kalau penulisan gagal, daftar
      // dikembalikan persis seperti semula (pola yang sama dengan hapus
      // target di goals.js).
      const index = financeData.transactions.findIndex((item) => item.id === id);
      if (index === -1) return;
      const [removed] = financeData.transactions.splice(index, 1);
      if (!refreshDashboard()) {
        financeData.transactions.splice(index, 0, removed);
        refreshDashboard();
        showTransactionFeedback("Transaksi tidak bisa dihapus — penyimpanan browser penuh atau tidak tersedia. Coba lagi.", "error");
        return;
      }
      showTransactionFeedback("Transaksi dihapus.");
    };
    if (confirmDeleteTransaction) {
      confirmDeleteTransaction(tx, removeTransaction);
    } else {
      // Halaman tanpa markup modal konfirmasi: jangan pakai dialog browser —
      // lebih baik tidak melakukan apa-apa dan memberi tahu user.
      showTransactionFeedback("Konfirmasi hapus tidak tersedia di halaman ini.", "error");
    }
  }
}

/**
 * Modal Tambah/Edit Transaksi + CRUD di memori (financeData.transactions).
 * Belum ada backend: add/edit/delete hanya mengubah array di memori,
 * lalu memicu refreshDashboard() supaya summary & analisis kategori ikut update.
 */
function setupTransactionModal() {
  const overlay = document.getElementById("transaction-modal-overlay");
  // Jenis transaksi yang harus disorot begitu modal selesai dirender.
  // Dipakai oleh onOpenFrame di bawah (offsetLeft/offsetWidth indikator baru
  // akurat setelah modal tidak lagi display:none).
  let typeToSelect = "expense";
  // Lifecycle (timer hide, frame animasi, tumpukan modal, kunci scroll, fokus
  // awal & focus restore) sepenuhnya dipegang createModalController() di
  // core.js — file ini hanya mengurus isi form.
  const modal = createModalController(overlay, {
    onOpenFrame: () => setSelectedType(typeToSelect, { animate: false }),
    onClose: () => setTransactionModalStatus(""), // pesan gagal simpan tidak tertinggal
  });
  const closeModal = () => modal.close();
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
  // Metode pembayaran: opsional. Nilai yang dipakai selalu key canonical dari
  // PAYMENT_METHODS (core.js), tidak pernah label yang tampil di <option>.
  const fieldMethod = document.getElementById("field-method");
  // Metode yang SUDAH tersimpan pada transaksi yang sedang diedit. Dipakai
  // kalau key-nya tidak ada di daftar aktif (mis. key generik versi pertama):
  // <select> tidak bisa menampilkannya, tapi menyimpan ulang transaksi TIDAK
  // boleh menghapus metode yang dulu dipilih user.
  let editingMethod = PAYMENT_UNSET;
  // Grid tombol metode: lapisan TAMPILAN di atas <select>. Nilai sebenarnya
  // tetap hidup di fieldMethod — grid hanya menulis ke sana lalu menyesuaikan
  // penanda aktifnya, jadi submit/edit/rollback tidak berubah sama sekali.
  // Peta <option> bawaan, diambil SEBELUM ada yang dilepas — elemen yang sama
  // dipasang kembali saat metodenya diaktifkan lagi, jadi label & optgroup-nya
  // tidak pernah dibangun ulang dari tebakan.
  const methodOptions = new Map();
  [...fieldMethod.querySelectorAll("option")].forEach((el) => {
    methodOptions.set(el.value, { el, group: el.parentElement });
  });
  const methodGrid = document.getElementById("method-grid");
  // :not([hidden]) — metode yang dimatikan user tetap ada di markup tapi
  // tidak boleh ikut apa pun: tidak disorot, tidak jadi tab stop, dan tidak
  // dilewati panah. Satu filter di sini menutup ketiganya sekaligus.
  const methodButtons = () => (methodGrid ? [...methodGrid.querySelectorAll(".method-option[data-method]:not([hidden])")] : []);

  /** Samakan tampilan grid dengan nilai <select>. Roving tabindex: hanya satu
   * tombol yang bisa dicapai lewat Tab supaya jumlah tab stop tidak bertambah
   * (fokus antar tombol dipindah dengan panah — lihat UI-1c). */
  function syncMethodGrid() {
    const buttons = methodButtons();
    if (!buttons.length) return;
    const value = fieldMethod.value;
    let hasActive = false;
    buttons.forEach((btn) => {
      const active = btn.dataset.method === value;
      if (active) hasActive = true;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
      btn.tabIndex = active ? 0 : -1;
    });
    // Tidak ada yang aktif (transaksi lama tanpa metode / metode di luar
    // daftar aktif): grid tetap harus bisa dimasuki lewat Tab.
    if (!hasActive) buttons[0].tabIndex = 0;
  }

  /** Metode lama (key generik versi pertama) tidak ada di daftar aktif, jadi
   * tidak punya tombol. Supaya user tahu apa yang dulu dipilih — dan tidak
   * mengira datanya hilang — tombol non-aktif ditampilkan di depan grid.
   * Labelnya diambil dari konstanta (PAYMENT_LEGACY_METHODS), tidak pernah
   * dari isi data, dan ditulis lewat textContent. Tombol ini sengaja TANPA
   * data-method supaya tidak ikut sinkronisasi maupun navigasi panah. */
  function renderLegacyMethod(key) {
    if (!methodGrid) return;
    const existing = methodGrid.querySelector(".method-option.is-legacy");
    if (existing) existing.remove();
    if (!key || isPaymentMethodActive(key)) return;
    const meta = findPaymentMethod(key);
    if (!meta) return;
    // Tiga sebab sebuah metode tidak bisa dipilih lagi, dan user berhak tahu
    // bedanya: key generik versi pertama (tidak akan pernah kembali), metode
    // yang SEDANG dimatikan user (bisa dinyalakan lagi di Pengaturan), atau
    // metode custom yang sudah dihapus. Kelasnya tetap .is-legacy — satu gaya
    // untuk "tidak bisa dipilih".
    const custom = findCustomPaymentMethod(key);
    const reason = custom && custom.deleted ? "dihapus"
      : (custom || PAYMENT_METHOD_KEYS.includes(key)) ? "nonaktif"
      : "tidak lagi tersedia";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "method-option is-legacy is-active";
    btn.disabled = true;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "true");
    btn.setAttribute("aria-disabled", "true");
    btn.tabIndex = -1;

    const logo = document.createElement("span");
    logo.className = "method-logo";
    logo.setAttribute("aria-hidden", "true");
    logo.textContent = meta.emoji;
    fillMethodLogo(logo, meta); // metode bawaan punya logo; key legacy tetap emoji

    const name = document.createElement("span");
    name.className = "method-name";
    name.textContent = `${meta.name} — ${reason}`;

    btn.append(logo, name);
    methodGrid.prepend(btn);
  }

  /** Satu-satunya jalan grid mengubah nilai. Lewat normalizePaymentMethod
   * supaya data-method yang diutak-atik dari luar tidak bisa masuk. */
  function setMethod(key) {
    const value = normalizePaymentMethod(key);
    fieldMethod.value = value;
    if (fieldMethod.value !== value) fieldMethod.selectedIndex = -1;
    editingMethod = value; // pilihan baru menggantikan metode lama
    renderLegacyMethod(value);
    syncMethodGrid();
  }

  /** UI-2: isi slot logo dengan berkas dari metadata (PAYMENT_METHODS[].logo).
   * Emoji yang sudah ada di markup dipakai sebagai CADANGAN: kalau berkasnya
   * gagal dimuat, isi slot dikembalikan ke emoji itu, jadi tombol tidak pernah
   * tampil kosong. Ukuran slot tetap (.method-logo 18x18), jadi pergantian ini
   * tidak menggeser tata letak. Key legacy tidak punya logo -> tetap emoji. */
  function fillMethodLogo(slot, meta) {
    if (!slot || !meta || !meta.logo) return;
    const fallback = slot.textContent;
    const img = document.createElement("img");
    img.alt = ""; // slot sudah aria-hidden; namanya dibaca dari .method-name
    // Listener dipasang SEBELUM src supaya kegagalan pasti tertangkap.
    img.addEventListener("error", () => { slot.textContent = fallback; }, { once: true });
    img.src = meta.logo;
    slot.textContent = "";
    slot.appendChild(img);
  }

  function upgradeMethodLogo(btn) {
    fillMethodLogo(btn.querySelector(".method-logo"), findPaymentMethod(btn.dataset.method));
  }

  /** UI-2b1: metode buatan user tidak punya markup statis, jadi tombol dan
   * <option>-nya dibuat di sini. SELURUH teks lewat textContent / properti
   * value — tidak pernah innerHTML — karena namanya berasal dari ketikan user.
   * Metode custom tidak punya berkas logo, jadi slot logonya berisi emoji
   * jenisnya (dari PAYMENT_GROUP_EMOJI). */
  function buildCustomTile(method) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "method-option";
    btn.dataset.method = method.key;
    btn.dataset.group = method.group;
    btn.dataset.custom = "true"; // penanda supaya mudah dibersihkan & diuji
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.tabIndex = -1;

    const logo = document.createElement("span");
    logo.className = "method-logo";
    logo.setAttribute("aria-hidden", "true");
    logo.textContent = method.emoji;

    const name = document.createElement("span");
    name.className = "method-name";
    name.textContent = method.name;

    btn.append(logo, name);
    return btn;
  }

  /** Tombol & opsi custom dibangun ulang dari nol tiap kali dipanggil, jadi
   * memanggilnya dua kali tidak pernah menggandakan apa pun. */
  function renderCustomMethods(aktif) {
    if (methodGrid) {
      methodGrid.querySelectorAll(".method-option[data-custom]").forEach((el) => el.remove());
    }
    const grupLama = fieldMethod.querySelector("optgroup[data-custom]");
    if (grupLama) grupLama.remove();

    const custom = aktif.filter((method) => method.key.startsWith(PAYMENT_CUSTOM_PREFIX));
    if (!custom.length) return;

    const grup = document.createElement("optgroup");
    grup.label = "Metode Saya";
    grup.dataset.custom = "true";
    custom.forEach((method) => {
      if (methodGrid) methodGrid.appendChild(buildCustomTile(method));
      const option = document.createElement("option");
      option.value = method.key;
      option.textContent = `${method.emoji} ${method.name}`;
      grup.appendChild(option);
    });
    fieldMethod.appendChild(grup);
  }

  /** UI-2a: samakan isi selector dengan daftar metode aktif. Grid dan <select>
   * dibangun dari SATU sumber (getActivePaymentMethods()), jadi tidak mungkin
   * keduanya berbeda isi. <option> metode nonaktif benar-benar DILEPAS, bukan
   * disembunyikan: dengan begitu menyunting transaksi bermetode nonaktif jatuh
   * ke jalur selectedIndex === -1 yang sudah ada sejak P-2 — nilai lamanya
   * dipertahankan tanpa mekanisme baru. */
  function applyActiveMethods() {
    const aktif = getActivePaymentMethods();
    const active = new Set(aktif.map((method) => method.key));
    renderCustomMethods(aktif); // sumber daftarnya sama persis dengan grid bawaan
    if (methodGrid) {
      methodGrid.querySelectorAll(".method-option[data-method]").forEach((btn) => {
        const on = active.has(btn.dataset.method);
        btn.hidden = !on;
        if (on) return;
        btn.classList.remove("is-active"); // jangan tinggalkan sisa state
        btn.setAttribute("aria-checked", "false");
        btn.tabIndex = -1;
      });
    }
    PAYMENT_METHOD_KEYS.forEach((key, index) => {
      const option = methodOptions.get(key);
      if (!option) return;
      const wanted = active.has(key);
      if (wanted === option.el.isConnected) return; // sudah sesuai: JANGAN disentuh
      if (!wanted) {
        option.el.remove();
        return;
      }
      // Dipasang kembali tepat sebelum opsi aktif berikutnya di grup yang sama,
      // supaya urutannya tetap urutan kanonik PAYMENT_METHODS.
      const next = PAYMENT_METHOD_KEYS.slice(index + 1)
        .map((k) => methodOptions.get(k))
        .find((rec) => rec && rec.el.isConnected && rec.group === option.group);
      option.group.insertBefore(option.el, next ? next.el : null);
    });
  }


  /* ---------- UI-2c: tambah metode langsung dari modal transaksi ---------- */
  const methodMore = document.getElementById("method-more");
  const ADD_REASON = {
    kosong: "Isi nama metodenya dulu.",
    panjang: `Nama metode maksimal ${PAYMENT_NAME_MAX} karakter.`,
    karakter: "Nama metode memuat karakter yang tidak didukung.",
    duplikat: "Sudah ada metode dengan nama itu.",
    penuh: `Maksimal ${PAYMENT_CUSTOM_MAX} metode buatan sendiri. Matikan atau hapus yang tidak dipakai lewat Pengaturan.`,
  };
  const ADD_SAVE_FAILED = "Metode tidak bisa disimpan — penyimpanan browser penuh atau tidak tersedia. Coba lagi.";
  let addOpenBtn = null;
  let addPanel = null;
  let addName = null;
  let addGroup = null;
  let addStatus = null;

  function setAddStatus(text) {
    if (!addStatus) return;
    addStatus.textContent = text;
    addStatus.dataset.type = "error"; // panel ini hanya memberi kabar saat gagal
    addStatus.hidden = !text;
  }

  /** Isi slot #method-more: satu tombol + panel kecil yang tersembunyi.
   * Semuanya dibuat lewat DOM API; tidak ada innerHTML di jalur ini karena
   * nama metode berasal dari ketikan user. */
  function buildAddPanel() {
    if (!methodMore) return;

    addOpenBtn = document.createElement("button");
    addOpenBtn.type = "button"; // WAJIB: elemen ini ada di dalam <form> transaksi
    addOpenBtn.className = "btn btn--ghost btn--xs";
    addOpenBtn.id = "method-more-open";
    addOpenBtn.textContent = "+ Tambah metode";
    addOpenBtn.setAttribute("aria-expanded", "false");
    addOpenBtn.setAttribute("aria-controls", "method-more-form");

    addPanel = document.createElement("div");
    addPanel.id = "method-more-form";
    addPanel.hidden = true;

    const nameField = document.createElement("div");
    nameField.className = "form-field";
    const nameLabel = document.createElement("label");
    nameLabel.setAttribute("for", "method-new-name");
    nameLabel.textContent = "Nama metode";
    addName = document.createElement("input");
    addName.type = "text";
    addName.id = "method-new-name";
    addName.maxLength = PAYMENT_NAME_MAX;
    addName.autocomplete = "off";
    addName.placeholder = "Contoh: Seabank";
    nameField.append(nameLabel, addName);

    const groupField = document.createElement("div");
    groupField.className = "form-field";
    const groupLabel = document.createElement("label");
    groupLabel.setAttribute("for", "method-new-group");
    groupLabel.textContent = "Jenis";
    addGroup = document.createElement("select");
    addGroup.id = "method-new-group";
    [["mbanking", "Bank"], ["ewallet", "E-Wallet"], ["other", "Lain"]].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      addGroup.appendChild(option);
    });
    addGroup.value = "ewallet";
    groupField.append(groupLabel, addGroup);

    addStatus = document.createElement("p");
    addStatus.className = "settings-feedback";
    addStatus.id = "method-new-status";
    addStatus.setAttribute("role", "status");
    addStatus.setAttribute("aria-live", "polite");
    addStatus.hidden = true;

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn--ghost btn--sm";
    cancelBtn.id = "method-new-cancel";
    cancelBtn.textContent = "Batal";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button"; // bukan submit: form ini milik transaksi
    saveBtn.className = "btn btn--primary btn--sm";
    saveBtn.id = "method-new-save";
    saveBtn.textContent = "Tambah";
    actions.append(cancelBtn, saveBtn);

    addPanel.append(nameField, groupField, addStatus, actions);
    methodMore.append(addOpenBtn, addPanel);
    methodMore.hidden = false;

    addOpenBtn.addEventListener("click", () => (addPanel.hidden ? openAddPanel() : closeAddPanel()));
    cancelBtn.addEventListener("click", () => closeAddPanel());
    saveBtn.addEventListener("click", submitNewMethod);
  }

  function openAddPanel() {
    if (!addPanel) return;
    addName.value = "";
    addGroup.value = "ewallet";
    setAddStatus("");
    addPanel.hidden = false;
    addOpenBtn.setAttribute("aria-expanded", "true");
    addName.focus();
  }

  /** Menutup panel TIDAK menyentuh isian transaksi sama sekali — judul,
   * nominal, kategori, tanggal, dan metode yang sudah dipilih tetap apa
   * adanya. Itu sebabnya panel ini tidak pernah memanggil resetForm(). */
  function closeAddPanel(options) {
    if (!addPanel) return;
    addPanel.hidden = true;
    addOpenBtn.setAttribute("aria-expanded", "false");
    addName.value = "";
    setAddStatus("");
    if (!options || options.focusBack !== false) addOpenBtn.focus();
  }

  /** Satu-satunya jalan menambah metode dari sini. Aturannya milik core
   * (addCustomPaymentMethod): nama kosong/panjang/duplikat/batas 20 dan
   * menghidupkan kembali entri yang sudah dihapus semuanya diputuskan di sana,
   * jadi perilakunya persis sama dengan layar tambah di Pengaturan. */
  function submitNewMethod() {
    if (!addPanel || addPanel.hidden) return;
    const sebelum = {
      disabled: financeData.paymentMethods.disabled.slice(),
      custom: financeData.paymentMethods.custom.map((entry) => ({ ...entry })),
    };
    const hasil = addCustomPaymentMethod(addName.value, addGroup.value);
    if (!hasil.ok) {
      setAddStatus(ADD_REASON[hasil.reason] || "Metode tidak bisa ditambahkan.");
      addName.focus();
      return;
    }
    if (!savePaymentMethods()) {
      financeData.paymentMethods.disabled = sebelum.disabled;
      financeData.paymentMethods.custom = sebelum.custom;
      setAddStatus(ADD_SAVE_FAILED);
      return; // panel tetap terbuka, isian transaksi tidak tersentuh
    }
    applyActiveMethods(); // tombol & <option>-nya muncul tanpa memuat ulang halaman
    setMethod(hasil.key); // langsung terpilih supaya user tidak mencarinya lagi
    closeAddPanel({ focusBack: false });
    const tile = methodGrid && methodGrid.querySelector(`.method-option[data-method="${hasil.key}"]`);
    if (tile) tile.focus();
  }

  if (methodGrid) {
    applyActiveMethods();
    methodButtons().forEach(upgradeMethodLogo);
    buildAddPanel();

    methodGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".method-option");
      if (!btn || btn.disabled || !btn.dataset.method) return;
      setMethod(btn.dataset.method);
    });

    // Pola radiogroup: panah memindah pilihan SEKALIGUS fokus, Home/End ke
    // ujung. Space/Enter tidak perlu ditangani — elemennya <button>, jadi
    // browser sudah memicu click. Listener sengaja dipasang di grid (bukan
    // document) supaya Escape & Tab tetap milik tumpukan modal di core.js.
    methodGrid.addEventListener("keydown", (e) => {
      const buttons = methodButtons().filter((btn) => !btn.disabled);
      const current = buttons.indexOf(document.activeElement);
      if (current === -1 || !buttons.length) return;
      let next = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (current + 1) % buttons.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = buttons.length - 1;
      else return;
      e.preventDefault(); // panah tidak ikut menggulir modal
      setMethod(buttons[next].dataset.method);
      buttons[next].focus();
    });
  }
  const fieldDate = document.getElementById("field-date");

  // Opsi kategori mengikuti financeData.categories (bisa diubah user di
  // analytics.html) + "Lainnya" sebagai cadangan. Dibangun ulang tiap modal
  // dibuka supaya selalu sinkron; <option> statis di HTML cuma placeholder.
  function populateCategoryOptions(selected) {
    const options = Object.entries(financeData.categories).map(
      ([key, cat]) => `<option value="${escapeHtml(key)}">${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}</option>`
    );
    if (!hasCategory(FALLBACK_CATEGORY.key)) {
      options.push(`<option value="${FALLBACK_CATEGORY.key}">${FALLBACK_CATEGORY.emoji} ${FALLBACK_CATEGORY.name}</option>`);
    }
    fieldCategory.innerHTML = `<option value="" disabled ${selected ? "" : "selected"}>Pilih kategori</option>${options.join("")}`;
    if (selected) {
      // Kategori transaksi lama yang sudah dihapus user -> tampil sebagai Lainnya.
      fieldCategory.value = hasCategory(selected) ? selected : FALLBACK_CATEGORY.key;
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

  // Pesan gagal SIMPAN (bukan validasi field) ditampilkan di dalam popup
  // supaya tidak tertutup overlay. Elemennya opsional: halaman tanpa markup
  // ini tetap berjalan, pesannya jatuh ke area status halaman.
  const modalStatus = document.getElementById("transaction-modal-status");
  function setTransactionModalStatus(text) {
    if (!modalStatus) {
      if (text) showTransactionFeedback(text, "error");
      return;
    }
    modalStatus.textContent = text;
    // Atribut hanya dipasang saat ada pesan (lihat catatan di budget.js).
    if (text) modalStatus.dataset.type = "error";
    else delete modalStatus.dataset.type;
    modalStatus.hidden = !text;
  }

  function resetForm() {
    form.reset();
    fieldId.value = "";
    [fieldTitle, fieldCategory, fieldAmount, fieldMethod, fieldDate].forEach((field) => field.setCustomValidity(""));
    // Transaksi baru dimulai dari metode AKTIF pertama — biasanya Cash, tapi
    // kalau user mematikan Cash form tidak boleh default ke metode yang
    // tombolnya tidak ada. form.reset() mengembalikan <option selected> bawaan
    // markup, jadi baris ini yang menentukan.
    const firstActive = getActivePaymentMethods()[0];
    fieldMethod.value = firstActive ? firstActive.key : PAYMENT_UNSET;
    renderLegacyMethod(PAYMENT_UNSET);
    syncMethodGrid();
    closeAddPanel({ focusBack: false }); // panel tidak pernah tertinggal terbuka
    populateCategoryOptions();
    setSelectedType("expense", { animate: false });
    // Tanggal LOKAL (toIsoDate), bukan toISOString() yang berbasis UTC: di
    // WIB antara 00:00-07:00, tanggal UTC masih hari kemarin sehingga
    // transaksi baru "hilang" dari kalender hari ini / masuk grup Kemarin.
    fieldDate.value = toIsoDate(new Date());
  }

  function openModal(mode, tx) {
    resetForm();
    typeToSelect = "expense";
    editingMethod = PAYMENT_UNSET;

    if (mode === "edit" && tx) {
      modalTitle.textContent = "Edit Transaksi";
      submitBtn.textContent = "Simpan Perubahan";
      fieldId.value = tx.id;
      fieldTitle.value = tx.title;
      populateCategoryOptions(tx.category);
      fieldAmount.value = formatAmountDigits(String(tx.amount));
      // Transaksi lama belum punya metode: JANGAN diisi "cash" diam-diam —
      // pilihan dikosongkan (selectedIndex -1) supaya menyimpan ulang tanpa
      // menyentuh field ini tidak mengarang data yang tidak pernah dipilih user.
      // Hal yang sama terjadi untuk key yang tidak ada di daftar aktif: tidak
      // ditampilkan, tapi tetap disimpan lewat editingMethod di bawah.
      editingMethod = normalizePaymentMethod(tx.method);
      fieldMethod.value = editingMethod;
      if (fieldMethod.value !== editingMethod) fieldMethod.selectedIndex = -1;
      renderLegacyMethod(editingMethod);
      syncMethodGrid();
      fieldDate.value = tx.isoDate || toIsoDate(new Date());
      typeToSelect = tx.type;
    } else {
      modalTitle.textContent = "Tambah Transaksi";
      submitBtn.textContent = "Simpan Transaksi";
    }

    // Sengaja TIDAK auto-focus ke field manapun (termasuk Nama Transaksi)
    // saat modal dibuka — di mobile ini langsung memunculkan keyboard
    // tanpa diminta. User klik sendiri ke field yang mau diisi; fokus awal
    // ke tombol tutup diurus controller.
    modal.open();
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
    fieldAmount.setCustomValidity("");
  });

  // Pesan validasi dibersihkan begitu field-nya diperbaiki, supaya tidak
  // ada pesan lama yang menempel saat submit berikutnya.
  fieldTitle.addEventListener("input", () => fieldTitle.setCustomValidity(""));
  fieldCategory.addEventListener("change", () => fieldCategory.setCustomValidity(""));
  fieldMethod.addEventListener("change", () => fieldMethod.setCustomValidity(""));
  fieldDate.addEventListener("change", () => fieldDate.setCustomValidity(""));

  // Diekspos supaya tombol edit di daftar transaksi mana pun bisa membuka
  // form edit yang sama.
  openTransactionModal = openModal;

  // Satu-satunya pemicu "Tambah": tombol Aksi Cepat di dashboard
  // ([data-action="add-transaction"]). Di halaman lain modal ini hanya
  // dipakai untuk edit (dibuka lewat handleTransactionListClick).
  document
    .querySelectorAll('[data-action="add-transaction"]')
    .forEach((btn) => btn.addEventListener("click", () => openModal("add")));
  // Tombol tutup & Batal; klik latar dan Escape sudah diurus controller.
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    // UI-2c: kolom nama metode berada DI DALAM form transaksi, jadi Enter di
    // sana memicu submit implisit (tanpa e.submitter). Selama panel tambah
    // terbuka dan fokus ada di kolom itu, Enter berarti "Tambah metode".
    // Ditangani di sini, bukan lewat listener keydown baru, supaya jumlah
    // listener keydown aplikasi tidak bertambah.
    if (addPanel && !addPanel.hidden && !e.submitter && document.activeElement === addName) {
      submitNewMethod();
      return;
    }

    // Validasi per field dengan pesan sendiri (pola yang sama dengan form
    // kategori & profil). Tanpa ini, kasus seperti judul berisi spasi atau
    // nominal 0 lolos dari atribut `required` sehingga reportValidity()
    // tidak menampilkan apa pun dan tombol Simpan terasa "tidak bereaksi".
    const title = fieldTitle.value.trim();
    const amountDigits = fieldAmount.value.replace(/\D/g, "");
    const amount = amountDigits ? Number(amountDigits) : 0;
    fieldTitle.setCustomValidity(title ? "" : "Isi nama transaksi.");
    fieldCategory.setCustomValidity(fieldCategory.value ? "" : "Pilih kategori dulu.");
    fieldAmount.setCustomValidity(amount > 0 ? "" : "Nominal harus lebih dari 0.");
    fieldDate.setCustomValidity(fieldDate.value ? "" : "Pilih tanggal transaksi.");
    if (!form.reportValidity()) return; // tidak ada yang disimpan

    const editId = fieldId.value ? Number(fieldId.value) : null;
    const payload = {
      title,
      category: fieldCategory.value,
      type: getSelectedType(),
      amount,
      // Dinormalisasi lagi di sini: apa pun isi <select> (termasuk kalau DOM
      // diubah dari luar), yang tersimpan hanya key yang dikenal atau "".
      // selectedIndex -1 = tidak ada opsi yang terpilih (transaksi lama tanpa
      // metode, atau metodenya di luar daftar aktif) -> pertahankan nilai lama.
      method: fieldMethod.selectedIndex === -1 ? editingMethod : normalizePaymentMethod(fieldMethod.value),
      isoDate: fieldDate.value,
      time: formatDateID(fieldDate.value),
    };

    // Cara mengembalikan keadaan kalau penulisan gagal (diisi di bawah).
    let undoMemoryChange = null;

    if (editId) {
      const tx = financeData.transactions.find((item) => item.id === editId);
      if (!tx) {
        // Datanya sudah hilang (mis. dihapus/di-import dari tab lain) —
        // tutup dengan aman, jangan menulis ke objek yang tidak ada dan
        // jangan menyimpan ulang data lama dari memori.
        closeModal();
        showTransactionFeedback("Transaksi tidak ditemukan, mungkin sudah dihapus.", "error");
        return;
      }
      const before = { ...tx };
      Object.assign(tx, payload);
      undoMemoryChange = () => Object.assign(tx, before);
    } else {
      financeData.transactions.unshift({ id: nextTransactionId++, ...payload });
      undoMemoryChange = () => financeData.transactions.shift();
    }

    // Posisi kalender/daftar juga dikembalikan kalau gagal, supaya layar
    // tidak berpindah ke tanggal transaksi yang batal tersimpan.
    const beforeView = { selected: transactionsPage.selected, year: transactionsPage.year, month: transactionsPage.month };

    // Halaman Semua Transaksi hanya menampilkan SATU tanggal terpilih. Tanpa
    // ini, transaksi yang baru disimpan untuk tanggal lain (termasuk hasil
    // edit yang tanggalnya diubah) tidak kelihatan sama sekali dan terasa
    // seperti gagal tersimpan — jadi kalender & daftar ikut pindah ke tanggal
    // transaksinya. Filter, urutan, dan mode filter tidak disentuh.
    const savedDate = new Date(`${payload.isoDate}T00:00:00`);
    if (!Number.isNaN(savedDate.getTime())) {
      transactionsPage.selected = payload.isoDate;
      transactionsPage.year = savedDate.getFullYear();
      transactionsPage.month = savedDate.getMonth();
    }

    if (!refreshDashboard()) {
      undoMemoryChange();
      transactionsPage.selected = beforeView.selected;
      transactionsPage.year = beforeView.year;
      transactionsPage.month = beforeView.month;
      refreshDashboard();
      // Modal sengaja TIDAK ditutup: isian user tetap ada supaya bisa dicoba
      // lagi tanpa mengetik ulang.
      setTransactionModalStatus("Transaksi tidak bisa disimpan — penyimpanan browser penuh atau tidak tersedia. Coba lagi.");
      return;
    }

    closeModal();
    showTransactionFeedback(editId ? "Perubahan tersimpan." : "Transaksi tersimpan.");
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
