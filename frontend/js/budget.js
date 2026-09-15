/**
 * budget.js — kode khusus budget.html (refactor JS tahap 5A).
 * Dimuat SETELAH core.js; dispatcher DOMContentLoaded di core.js yang
 * memanggil initBudgetPage() di sini. Isi disalin verbatim dari app.js,
 * urutan deklarasi asli dipertahankan. Berisi: bulan yang dilihat
 * (budgetViewDate), card per kategori + baris "pengeluaran lain", navigator
 * bulan, editor budget bulanan/kategori + konfirmasi hapus
 * (setupBudgetEditor), dan initBudgetPage. Card Budget Bulan Ini
 * (renderBudgetSummary) dan kalkulasi budget (getCategoryUsed,
 * getCategoryBudgetStatus, dst.) ada di core.js.
 */

// Bulan yang sedang DILIHAT di budget.html (V2.2 Tahap B). Hanya state
// halaman — tidak disimpan ke localStorage. Default bulan berjalan; hanya
// boleh mundur (bulan masa depan tidak bisa dipilih). Dashboard tidak
// memakai ini: card Budget Bulan Ini di sana selalu bulan berjalan.
let budgetViewDate = startOfMonth(new Date());

/** Markup satu panel Analisis Kategori. Isinya PERSIS sama dengan card
 * Analisis Kategori versi lama (nama, status, budget, terpakai, progress
 * bar, sisa) — yang berubah cuma: sekarang dicetak satu panel per kategori
 * di dalam carousel, bukan satu card yang innerHTML-nya diganti-ganti. */
function renderCategoryPanel(key, categoryData, now = new Date()) {
  const { name, budget, emoji } = categoryData;
  const used = getCategoryUsed(key, now);
  const status = getCategoryBudgetStatus(used, budget);
  // Nama, emoji, dan key berasal dari localStorage -> escape sebelum masuk
  // innerHTML, baik sebagai teks maupun sebagai nilai atribut.
  const safeName = escapeHtml(name);
  const safeEmoji = escapeHtml(emoji || FALLBACK_CATEGORY.emoji);
  const safeKey = escapeHtml(key);
  const head = `
      <div class="category-card-head">
        <span class="category-name"><span class="category-emoji" aria-hidden="true">${safeEmoji}</span>${safeName}</span>
        <span class="category-status" data-status="${status.key}">${status.label}</span>
        <button type="button" class="btn btn--ghost btn--xs" data-action="edit-category" data-key="${safeKey}" aria-label="Edit kategori ${safeName}">${ICON_EDIT} Edit</button>
      </div>`;

  // Budget 0 = belum diatur: kategori tetap ada (dipakai form transaksi),
  // tapi tanpa persen/progress/status palsu — hanya pengeluaran aktualnya.
  if (status.key === "unset") {
    return `
    <article class="category-card category-card--unset" data-category="${safeKey}">${head}
      <div class="category-card-foot">
        <span>Terpakai: <strong class="num">${formatRupiah(used)}</strong></span>
        <button type="button" class="btn btn--ghost btn--xs btn-set-budget" data-action="edit-category" data-key="${safeKey}" aria-label="Atur budget kategori ${safeName}">Atur Budget</button>
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
    <article class="category-card" data-category="${safeKey}">${head}
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

  // Empty state budget: ada kategori, tapi semuanya masih 0. Ditaruh di ATAS
  // card (bukan menggantikannya) supaya tombol Atur Budget/Edit tetap ada,
  // dan baris "Pengeluaran lain tanpa budget" di bawah tetap tampil.
  const noBudgetYet = entries.length > 0 && entries.every(([, cat]) => !(cat.budget > 0));
  const emptyBudget = noBudgetYet
    ? `<p class="category-empty category-empty--budget" id="category-empty-budget">💡 Belum ada budget yang diatur. Tekan <strong>Atur Budget</strong> atau <strong>Edit</strong> pada kategori untuk mulai menentukan batas pengeluarannya.</p>`
    : "";
  list.innerHTML = emptyBudget + cards + renderUnbudgetedRow(now);
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
  while (hasCategory(key)) key = `${base}-${n++}`;
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
  const clearBudgetBtn = document.getElementById("btn-clear-budget");

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
    if (mode === "edit" && hasCategory(key)) {
      const cat = financeData.categories[key];
      const hasBudget = cat.budget > 0;
      fieldKey.value = key;
      fieldName.value = cat.name;
      // Budget 0 = belum diatur: kotak dibiarkan kosong (placeholder "0"),
      // bukan "0" — supaya user langsung mengetik nominal barunya.
      fieldBudget.value = hasBudget ? formatAmountDigits(String(cat.budget)) : "";
      renderEmojiPicker(cat.emoji || FALLBACK_CATEGORY.emoji);
      categoryTitle.textContent = hasBudget ? `${cat.emoji} Edit Kategori ${cat.name}` : `${cat.emoji} Atur Budget ${cat.name}`;
      categorySub.textContent = hasBudget
        ? "Atur budget kategori ini sesuai kebutuhan kamu."
        : "Kategori ini belum punya budget. Tentukan nominalnya untuk mulai memantau pengeluarannya.";
      categorySubmit.textContent = hasBudget ? "Simpan Perubahan" : "Atur Budget";
      clearBudgetBtn.hidden = !hasBudget; // hanya ada budget yang bisa dikosongkan
      deleteBtn.hidden = false;
    } else {
      fieldKey.value = "";
      renderEmojiPicker("💡");
      categoryTitle.textContent = "➕ Tambah Kategori";
      categorySub.textContent = "Buat pos pengeluaran baru dan tentukan budgetnya.";
      categorySubmit.textContent = "Tambah Kategori";
      clearBudgetBtn.hidden = true;
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
    if (!name) {
      fieldName.setCustomValidity("Isi nama kategori.");
      categoryForm.reportValidity();
      return;
    }
    // Validasi nominal dari teks mentah: kosong, ada minus, atau karakter
    // selain angka/pemisah ribuan -> tolak dengan pesan yang jelas. Nilai 0
    // sengaja TIDAK bisa lewat sini — mengosongkan budget hanya lewat tombol
    // "Kosongkan Budget" supaya tidak terjadi tanpa sengaja.
    const raw = fieldBudget.value.trim();
    const budget = readAmount(fieldBudget);
    let budgetError = "";
    if (!raw) budgetError = "Isi nominal budget kategori.";
    else if (/-/.test(raw) || !/^[\d.]+$/.test(raw)) budgetError = "Nominal budget harus berupa angka positif, tanpa tanda minus atau huruf.";
    else if (budget <= 0) budgetError = fieldKey.value
      ? 'Nominal budget harus lebih dari 0. Untuk menghapus budget, gunakan tombol "Kosongkan Budget".'
      : "Nominal budget harus lebih dari 0.";
    if (budgetError) {
      fieldBudget.setCustomValidity(budgetError);
      categoryForm.reportValidity();
      return;
    }
    const key = fieldKey.value || makeCategoryKey(name);
    // Edit: key tetap (transaksi lama tetap terhubung), hanya isinya diganti.
    financeData.categories[key] = { name, emoji: selectedEmoji, budget };
    persistAndRerender();
    categoryModal.close();
  });

  // ---------- 2b. Kosongkan budget (budget -> 0, kategori & transaksi tetap) ----------
  // Bukan aksi destruktif (bisa diatur lagi kapan saja), jadi tanpa
  // konfirmasi. Nama/emoji yang sedang diubah di form ikut disimpan supaya
  // tidak hilang diam-diam; bulan yang sedang dilihat tidak disentuh.
  clearBudgetBtn.addEventListener("click", () => {
    const key = fieldKey.value;
    if (!hasCategory(key)) return;
    const cat = financeData.categories[key];
    const name = fieldName.value.trim() || cat.name;
    financeData.categories[key] = { name, emoji: selectedEmoji || cat.emoji, budget: 0 };
    persistAndRerender();
    categoryModal.close();
  });

  // ---------- 3. Hapus kategori (konfirmasi custom) ----------
  const confirmText = document.getElementById("confirm-text");
  const confirmDelete = document.getElementById("confirm-delete");
  let pendingDeleteKey = null;

  deleteBtn.addEventListener("click", () => {
    const key = fieldKey.value;
    if (!hasCategory(key)) return;
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
