/**
 * goals.js — kode khusus goals.html (refactor JS tahap 3).
 * Dimuat SETELAH core.js; dispatcher DOMContentLoaded di core.js yang
 * memanggil initGoalsPage() di sini. Isi disalin verbatim dari app.js,
 * urutan deklarasi asli dipertahankan. Berisi: card & daftar target,
 * ringkasan, feedback, popup tambah/edit + konfirmasi hapus
 * (setupGoalEditor), dan initGoalsPage. Helper data/kalkulasi target
 * (normalizeGoal, getGoalStatus, sortGoals, dst.) ada di core.js.
 */

/** Markup satu card target. Nama dari localStorage -> escapeHtml, baik
 * sebagai teks maupun nilai atribut (aria-label). Status memakai kunci
 * milik target sendiri (done/urgent/overdue/active), BUKAN kunci status
 * budget: pada budget mendekati 100% = bahaya, pada target = bagus.
 * Tombol Edit/Hapus memakai data-action + data-id (delegasi klik di
 * setupGoalEditor()); id juga dipakai restoreFocus() untuk menemukan tombol
 * pengganti setelah daftar dirender ulang. */
function renderGoalCard(goal, today = new Date()) {
  const status = getGoalStatus(goal, today);
  const safeName = escapeHtml(goal.name);
  const percentLabel = status.percent.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  const done = status.key === "done";
  const over = goal.saved - goal.target;

  // Baris kanan foot: sisa dana, atau "Tercapai" (+ kelebihan kalau ada).
  let remainingMarkup;
  if (!done) remainingMarkup = `<span class="goal-remaining">Sisa <strong class="num">${formatRupiah(status.remaining)}</strong></span>`;
  else if (over > 0) remainingMarkup = `<span class="goal-remaining is-done">Tercapai 🎉 · lebih <strong class="num">${formatRupiah(over)}</strong></span>`;
  else remainingMarkup = `<span class="goal-remaining is-done">Tercapai 🎉</span>`;

  // Deadline: tanggal + keterangan (Tinggal N hari / Terlewat N hari), atau
  // "Tanpa tanggal target". Target yang sudah tercapai tidak perlu lagi
  // diperingatkan soal tenggat — keterangannya dibuat netral.
  const dl = status.deadline;
  const deadlineText = dl.key === "none"
    ? dl.label
    : `${formatDateID(goal.deadline)} · ${done && dl.key === "overdue" ? "sudah lewat" : dl.label}`;

  return `
    <article class="category-card goal-card" data-goal-id="${goal.id}" data-status="${status.key}">
      <div class="category-card-head">
        <span class="category-name"><span class="category-emoji" aria-hidden="true">🎯</span>${safeName}</span>
        <span class="category-status goal-status" data-status="${status.key}">${status.label}</span>
      </div>
      <div class="category-budget-row">
        <span>Target: <strong class="num">${formatRupiah(goal.target)}</strong></span>
        <span class="progress-percent goal-percent">${percentLabel}%</span>
      </div>
      <div class="progress-bar progress-bar--goal" role="progressbar" aria-valuenow="${Math.round(status.percent)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progress target ${safeName}">
        <div class="progress-bar-fill" style="width:${status.percent}%"></div>
      </div>
      <div class="category-card-foot goal-card-foot">
        <span>Terkumpul: <strong class="num">${formatRupiah(goal.saved)}</strong></span>
        ${remainingMarkup}
      </div>
      <p class="goal-deadline" data-deadline="${dl.key}">📅 ${deadlineText}</p>
      <div class="goal-card-actions">
        <button type="button" class="btn btn--ghost btn--xs" data-action="edit-goal" data-id="${goal.id}" aria-label="Edit target ${safeName}">${ICON_EDIT} Edit</button>
        <button type="button" class="btn btn--danger-ghost btn--xs" data-action="delete-goal" data-id="${goal.id}" aria-label="Hapus target ${safeName}">${ICON_DELETE} Hapus</button>
      </div>
    </article>
  `;
}

/** Daftar target (urutan dari sortGoals(), array sumber tidak disentuh) +
 * sub-judul jumlah + empty state. */
function renderGoalList(today = new Date()) {
  const list = document.getElementById("goal-list");
  if (!list) return; // bukan di halaman target
  const goals = sortGoals(financeData.goals, today);
  const countSub = document.getElementById("goals-count-sub");
  const hint = document.getElementById("goals-hint");

  if (!goals.length) {
    if (countSub) countSub.textContent = "";
    if (hint) hint.hidden = true;
    list.innerHTML = `<p class="category-empty goal-empty">🎯 Belum ada target keuangan.<br>Tekan <strong>Tambah Target</strong> untuk membuat yang pertama — misalnya dana darurat, beli laptop, atau liburan.</p>`;
    return;
  }

  if (countSub) countSub.textContent = goals.length === 1 ? "1 target" : `${goals.length} target`;
  if (hint) hint.hidden = false;
  list.innerHTML = goals.map((goal) => renderGoalCard(goal, today)).join("");
}

/** Tile ringkasan: total terkumpul vs total target, jumlah aktif, jumlah
 * tercapai. Section-nya disembunyikan kalau belum ada target. */
function renderGoalsSummary(today = new Date()) {
  const el = document.getElementById("goals-summary");
  if (!el) return; // bukan di halaman target
  const section = document.getElementById("goals-summary-section");
  const goals = financeData.goals;
  if (!goals.length) {
    if (section) section.hidden = true;
    el.innerHTML = "";
    return;
  }

  const totalTarget = goals.reduce((sum, g) => sum + g.target, 0);
  const totalSaved = goals.reduce((sum, g) => sum + g.saved, 0);
  const doneCount = goals.filter((g) => getGoalStatus(g, today).key === "done").length;
  const activeCount = goals.length - doneCount;

  if (section) section.hidden = false;
  el.innerHTML = `
    <div class="stat stat--wide">
      <span class="stat-label">Total Terkumpul</span>
      <span class="stat-value num">${formatRupiah(totalSaved)}</span>
      <span class="stat-sub">dari total target <strong class="num">${formatRupiah(totalTarget)}</strong></span>
    </div>
    <div class="stat">
      <span class="stat-label">Target Aktif</span>
      <span class="stat-value num">${activeCount}</span>
      <span class="stat-sub">belum tercapai</span>
    </div>
    <div class="stat">
      <span class="stat-label">Tercapai</span>
      <span class="stat-value num">${doneCount}</span>
      <span class="stat-sub">target selesai</span>
    </div>
  `;
}

/** Render seluruh halaman goals.html dengan satu "hari ini" yang sama
 * supaya status di ringkasan & daftar tidak pernah berbeda. */
function renderGoalsPage() {
  const today = new Date();
  renderGoalsSummary(today);
  renderGoalList(today);
}

/** Pesan singkat hasil aksi target (pola showTransactionFeedback): elemen
 * role="status" di goals.html; halaman lain tidak punya -> no-op. Hanya
 * dipanggil SETELAH operasi selesai, bukan untuk validasi field. */
let goalsFeedbackTimer = 0;

function showGoalsFeedback(text, type = "success") {
  const el = document.getElementById("goals-feedback");
  if (!el) return; // halaman ini tidak punya area status
  clearTimeout(goalsFeedbackTimer);
  el.textContent = text;
  el.dataset.type = type;
  el.hidden = false;
  if (type === "success") goalsFeedbackTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

/**
 * goals.html — G-3A/G-3B: popup Tambah/Edit Target + konfirmasi Hapus.
 * Modal dikelola createModalController() (fokus awal, focus trap, Escape,
 * klik overlay, scroll lock, kembalikan fokus). Validasi per field memakai
 * setCustomValidity() + reportValidity() seperti form transaksi & kategori;
 * penjaga terakhir sebelum disimpan tetap normalizeGoal() supaya aturan data
 * G-1 tidak bisa dilewati lewat form. Tidak ada yang ditulis ke
 * financeData.goals maupun localStorage sebelum semua validasi lolos, dan
 * kegagalan menulis selalu di-rollback ke daftar sebelum aksi.
 */
function setupGoalEditor() {
  const overlay = document.getElementById("goal-modal-overlay");
  if (!overlay) return; // bukan di halaman target

  const form = document.getElementById("goal-form");
  const modalTitle = document.getElementById("goal-modal-title");
  const modalSub = document.getElementById("goal-modal-sub");
  const fieldId = document.getElementById("field-goal-id");
  const fieldName = document.getElementById("field-goal-name");
  const fieldTarget = document.getElementById("field-goal-target");
  const fieldSaved = document.getElementById("field-goal-saved");
  const fieldDeadline = document.getElementById("field-goal-deadline");
  const status = document.getElementById("goal-modal-status");
  const submitBtn = document.getElementById("goal-modal-submit");
  const fields = [fieldName, fieldTarget, fieldSaved, fieldDeadline];

  function setStatus(text, type = "error") {
    status.textContent = text;
    status.dataset.type = type;
    status.hidden = !text;
  }

  function resetForm() {
    form.reset();
    fieldId.value = "";
    fields.forEach((field) => field.setCustomValidity(""));
    setStatus("");
    submitBtn.disabled = false;
  }

  const modal = createModalController(overlay, { onClose: resetForm });

  /** Buka popup: mode "add" (form kosong) atau "edit" (terisi dari target
   * yang ada; id & createdAt tidak pernah lewat form, hanya id sebagai
   * penanda). Judul, sub, dan label tombol ikut modenya. */
  function openGoalModal(mode, goal) {
    resetForm();
    if (mode === "edit" && goal) {
      fieldId.value = String(goal.id);
      fieldName.value = goal.name;
      fieldTarget.value = formatAmountDigits(String(goal.target));
      // Terkumpul 0 dibiarkan kosong (placeholder "0"), seperti budget kategori.
      fieldSaved.value = goal.saved > 0 ? formatAmountDigits(String(goal.saved)) : "";
      fieldDeadline.value = goal.deadline || "";
      modalTitle.textContent = "✏️ Edit Target";
      modalSub.textContent = "Ubah nama, nominal, atau tanggal target ini.";
      submitBtn.textContent = "Simpan Perubahan";
    } else {
      modalTitle.textContent = "🎯 Tambah Target";
      modalSub.textContent = "Tentukan nama, nominal target, dan nominal yang sudah terkumpul.";
      submitBtn.textContent = "Simpan Target";
    }
    modal.open();
  }

  /** Nominal dari input "Rp" yang diformat ("1.250.000" -> 1250000). */
  function readAmount(input) {
    const digits = input.value.replace(/\D/g, "");
    return digits ? Number(digits) : 0;
  }

  /** Pesan untuk teks nominal mentah: kosong (kalau wajib), ada minus, atau
   * karakter selain angka/pemisah ribuan -> tolak dengan kalimat yang jelas
   * (aturan yang sama dengan budget kategori). */
  function amountError(raw, label, { required }) {
    if (!raw) return required ? `Isi ${label}.` : "";
    if (/-/.test(raw) || !/^[\d.]+$/.test(raw)) return `${label[0].toUpperCase()}${label.slice(1)} harus berupa angka positif, tanpa tanda minus atau huruf.`;
    return "";
  }

  // Format nominal live saat diketik + bersihkan pesan validasi field yang
  // sedang diperbaiki, supaya tidak ada pesan lama yang menempel.
  [fieldTarget, fieldSaved].forEach((input) => {
    input.addEventListener("input", () => {
      input.value = formatAmountDigits(input.value);
      input.setCustomValidity("");
    });
  });
  fieldName.addEventListener("input", () => fieldName.setCustomValidity(""));
  fieldDeadline.addEventListener("input", () => fieldDeadline.setCustomValidity(""));
  fieldDeadline.addEventListener("change", () => fieldDeadline.setCustomValidity(""));

  document.getElementById("btn-add-goal").addEventListener("click", () => openGoalModal("add"));

  // Tombol Edit/Hapus di tiap card (daftar sering dirender ulang -> delegasi).
  document.getElementById("goal-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const goal = financeData.goals.find((g) => g.id === id);
    if (!goal) {
      // Sudah hilang (mis. dihapus di tab lain) — jangan buka form untuk
      // data yang tidak ada; kabari dan segarkan daftar.
      renderGoalsPage();
      showGoalsFeedback("Target tidak ditemukan, mungkin sudah dihapus.", "error");
      return;
    }
    if (btn.dataset.action === "edit-goal") openGoalModal("edit", goal);
    else if (btn.dataset.action === "delete-goal") openDeleteConfirm(goal);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setStatus("");

    // ---- 1. Validasi per field (tidak ada yang disimpan sebelum semua lolos) ----
    const name = fieldName.value.trim();
    if (!name) fieldName.setCustomValidity("Isi nama target.");
    else if (name.length > GOAL_NAME_MAX) fieldName.setCustomValidity(`Nama target maksimal ${GOAL_NAME_MAX} karakter.`);
    else fieldName.setCustomValidity("");

    const targetRaw = fieldTarget.value.trim();
    const target = readAmount(fieldTarget);
    let targetError = amountError(targetRaw, "nominal target", { required: true });
    if (!targetError && target <= 0) targetError = "Nominal target harus lebih dari 0.";
    fieldTarget.setCustomValidity(targetError);

    // Terkumpul boleh kosong (= 0) dan boleh melebihi target (aturan G-1:
    // menabung lebih itu sah; kartu menampilkannya sebagai "Tercapai · lebih").
    const savedRaw = fieldSaved.value.trim();
    const saved = readAmount(fieldSaved);
    fieldSaved.setCustomValidity(amountError(savedRaw, "nominal terkumpul", { required: false }));

    // Deadline opsional. <input type="date"> memberi "" untuk ketikan yang
    // bukan tanggal (validity.badInput) — itu ditolak, bukan dianggap kosong.
    // Nilainya sudah "yyyy-mm-dd" lokal, tidak lewat Date/UTC sama sekali.
    const deadline = fieldDeadline.value;
    if (fieldDeadline.validity.badInput || (deadline && !isValidIsoDate(deadline))) fieldDeadline.setCustomValidity("Tanggal target tidak valid.");
    else fieldDeadline.setCustomValidity("");

    if (!form.reportValidity()) return; // fokus & pesan ke field pertama yang gagal

    // ---- 2. Mode edit: target lama harus masih ada ----
    const editId = fieldId.value ? Number(fieldId.value) : null;
    const editIndex = editId === null ? -1 : financeData.goals.findIndex((g) => g.id === editId);
    if (editId !== null && editIndex < 0) {
      // Datanya sudah hilang (mis. dihapus dari tab lain) — tutup dengan
      // aman, jangan membuat target baru dari isian form edit.
      modal.close();
      renderGoalsPage();
      showGoalsFeedback("Target tidak ditemukan, mungkin sudah dihapus.", "error");
      return;
    }
    const previous = editIndex >= 0 ? financeData.goals[editIndex] : null;

    // ---- 3. Batas jumlah (hanya saat menambah) & penjaga data ----
    if (!previous && financeData.goals.length >= GOAL_LIMIT) {
      setStatus(`Batas maksimal ${GOAL_LIMIT} target sudah tercapai.`);
      return;
    }
    // Edit: id & createdAt diambil dari target lama, bukan dari form —
    // yang boleh berubah hanya name, target, saved, deadline.
    const goal = normalizeGoal(
      previous
        ? { id: previous.id, name, target, saved, deadline, createdAt: previous.createdAt }
        : { id: nextGoalId(), name, target, saved, deadline, createdAt: toIsoDate(new Date()) }
    );
    if (!goal) {
      // Seharusnya tidak terjadi setelah validasi di atas; jaga-jaga supaya
      // data yang melanggar aturan G-1 tidak pernah masuk ke daftar.
      setStatus("Data target tidak valid. Periksa kembali isiannya.");
      return;
    }

    // ---- 4. Simpan: masuk memori -> tulis storage; gagal tulis = rollback ----
    submitBtn.disabled = true;
    if (previous) financeData.goals[editIndex] = goal; // posisi tetap, objek diganti
    else financeData.goals.unshift(goal); // terbaru di atas, seperti transaksi
    if (!saveGoals()) {
      if (previous) financeData.goals[editIndex] = previous; // kembalikan objek lama
      else financeData.goals.shift(); // jangan mengklaim tersimpan; daftar lama tetap utuh
      submitBtn.disabled = false;
      setStatus("Target tidak bisa disimpan — penyimpanan browser penuh atau tidak tersedia. Coba lagi.");
      return;
    }

    // ---- 5. Sukses: render ulang, tutup (form di-reset lewat onClose), kabari ----
    renderGoalsPage();
    modal.close();
    const done = getGoalStatus(goal).key === "done";
    let message;
    if (previous) message = done ? `Perubahan "${goal.name}" tersimpan — target tercapai 🎉` : `Perubahan "${goal.name}" tersimpan.`;
    else message = done ? `Target "${goal.name}" tersimpan — sudah tercapai 🎉` : `Target "${goal.name}" tersimpan.`;
    showGoalsFeedback(message);
  });

  // ---------- Hapus target (konfirmasi custom, bukan window.confirm) ----------
  const confirmOverlay = document.getElementById("goal-confirm-overlay");
  const confirmStatus = document.getElementById("goal-confirm-status");
  const confirmBtn = document.getElementById("btn-goal-confirm-delete");
  let pendingDeleteId = null;

  function setConfirmStatus(text) {
    confirmStatus.textContent = text;
    confirmStatus.dataset.type = "error";
    confirmStatus.hidden = !text;
  }

  const confirmModal = createModalController(confirmOverlay, {
    onClose: () => {
      pendingDeleteId = null; // Batal/Escape/klik luar: tidak ada yang berubah
      setConfirmStatus("");
      confirmBtn.disabled = false;
    },
  });

  function openDeleteConfirm(goal) {
    pendingDeleteId = goal.id;
    document.getElementById("goal-confirm-title").textContent = `Yakin ingin menghapus target "${goal.name}"?`;
    document.getElementById("goal-confirm-text").textContent = goal.saved > 0
      ? `${formatRupiah(goal.saved)} yang tercatat terkumpul dari ${formatRupiah(goal.target)} akan ikut hilang dari daftar. Tindakan ini tidak bisa dibatalkan.`
      : `Target ${formatRupiah(goal.target)} ini akan dihapus dari daftar. Tindakan ini tidak bisa dibatalkan.`;
    setConfirmStatus("");
    confirmModal.open();
  }

  confirmBtn.addEventListener("click", () => {
    if (pendingDeleteId === null) return;
    const index = financeData.goals.findIndex((g) => g.id === pendingDeleteId);
    if (index < 0) {
      confirmModal.close();
      renderGoalsPage();
      showGoalsFeedback("Target tidak ditemukan, mungkin sudah dihapus.", "error");
      return;
    }
    // Hapus HANYA berdasarkan id; target lain tidak disentuh. Konfirmasi
    // tetap terbuka sampai penulisan benar-benar berhasil.
    confirmBtn.disabled = true;
    const [removed] = financeData.goals.splice(index, 1);
    if (!saveGoals()) {
      financeData.goals.splice(index, 0, removed); // kembalikan ke posisi semula
      confirmBtn.disabled = false;
      setConfirmStatus("Target tidak bisa dihapus — penyimpanan browser tidak bisa ditulis. Coba lagi.");
      return;
    }
    pendingDeleteId = null;
    renderGoalsPage();
    confirmModal.close();
    // Tombol Hapus pemicunya ikut hilang bersama card-nya, jadi tidak ada
    // fokus yang bisa dikembalikan — arahkan ke tombol Tambah Target supaya
    // pengguna keyboard tidak terlempar ke awal halaman.
    const addBtn = document.getElementById("btn-add-goal");
    if (addBtn) addBtn.focus({ preventScroll: true });
    showGoalsFeedback(`Target "${removed.name}" dihapus.`);
  });
}

/**
 * Halaman "Target Keuangan" (goals.html) — G-2: daftar target dari
 * financeData.goals (sudah dimuat loadGoals() saat file ini dieksekusi).
 * Hanya membaca & merender; tidak ada yang ditulis ke localStorage saat
 * halaman dibuka. Tambah/edit/hapus menyusul di tahap berikutnya.
 */
function initGoalsPage() {
  renderGoalsPage();
  setupGoalEditor();
}
