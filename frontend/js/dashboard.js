/**
 * dashboard.js — kode khusus index.html (refactor JS tahap 2).
 * Dimuat SETELAH core.js dan transactions-shared.js; dispatcher
 * DOMContentLoaded di core.js yang memanggil initDashboard() di sini.
 * Isi disalin verbatim dari app.js, urutan deklarasi asli dipertahankan.
 * Berisi: ringkasan saldo + toggle sembunyikan saldo, transaksi terbaru,
 * dropdown notifikasi (setupHeaderActions), Financial Check-in, card Target
 * Keuangan di dashboard, dan initDashboard.
 */

// Maksimal transaksi yang ditampilkan di dashboard utama (lihat poin 4 revisi)
const TRANSACTION_LIST_LIMIT = 3;

// Teks pengganti saat nominal disembunyikan (fitur hide/show saldo).
// Dipakai untuk Saldo, Pemasukan, DAN Pengeluaran sekaligus.
const MASKED_VALUE = "••••••••";

let isBalanceVisible = false;

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

  // Teks ini dirender lewat innerHTML (checkin-insight) -> escape nama & emoji.
  const name = escapeHtml(financeData.categories[best.key].name);
  const pct = Math.abs(Math.round(best.change * 100));
  const dir = best.change >= 0 ? "naik" : "turun";
  return `${escapeHtml(getCategoryEmoji(best.key))} Pengeluaran ${name} minggu ini ${dir} ${pct}% dibanding minggu lalu.`;
}

// Berapa target yang ditampilkan di card dashboard (sisanya "+N lainnya").
const DASHBOARD_GOAL_LIMIT = 2;

/**
 * Dashboard (index.html) — G-4: card ringkasan Target Keuangan. Hanya
 * MEMBACA financeData.goals (tidak menulis, tidak mengubah isi target):
 * total terkumpul vs total target, jumlah target/aktif/tercapai, dan
 * DASHBOARD_GOAL_LIMIT target paling relevan menurut urutan sortGoals()
 * (belum selesai & deadline terdekat di atas). Status per target dari
 * getGoalStatus() — kunci yang sama dengan goals.html. No-op di halaman
 * tanpa #goals-card.
 */
function renderGoalsDashboard(today = new Date()) {
  const card = document.getElementById("goals-card");
  if (!card) return; // bukan di dashboard
  const link = document.getElementById("link-goals-all");
  const goals = financeData.goals;

  if (!goals.length) {
    if (link) link.hidden = true; // satu-satunya tautan = tombol di empty state
    card.innerHTML = `
      <div class="goals-card-empty">
        <p class="goals-card-empty-text">🎯 Kamu belum membuat target keuangan. Tentukan hal yang ingin dicapai — dana darurat, laptop baru, atau liburan — lalu pantau progresnya di sini.</p>
        <a class="btn btn--ghost btn--xs goals-card-cta" href="goals.html">Buat Target Pertama</a>
      </div>
    `;
    return;
  }

  const totalTarget = goals.reduce((sum, g) => sum + g.target, 0);
  const totalSaved = goals.reduce((sum, g) => sum + g.saved, 0);
  const doneCount = goals.filter((g) => getGoalStatus(g, today).key === "done").length;
  const activeCount = goals.length - doneCount;
  // Persen keseluruhan: aman dari NaN/Infinity (totalTarget selalu > 0 di
  // sini karena tiap target lolos normalizeGoal), dipotong ke 100 untuk bar.
  const percent = totalTarget > 0 ? Math.min((totalSaved / totalTarget) * 100, 100) : 0;
  const percentLabel = percent.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  const allDone = doneCount === goals.length;

  const shown = sortGoals(goals, today).slice(0, DASHBOARD_GOAL_LIMIT);
  const rest = goals.length - shown.length;
  const items = shown
    .map((goal) => {
      const status = getGoalStatus(goal, today);
      const safeName = escapeHtml(goal.name);
      const pct = status.percent.toLocaleString("id-ID", { maximumFractionDigits: 0 });
      return `
      <li class="goals-card-item" data-status="${status.key}">
        <div class="goals-card-item-row">
          <span class="goals-card-item-name">${safeName}</span>
          <span class="goals-card-item-status" data-status="${status.key}">${status.label}</span>
          <span class="goals-card-item-pct num">${pct}%</span>
        </div>
        <div class="progress-bar progress-bar--goal progress-bar--thin" role="progressbar" aria-valuenow="${Math.round(status.percent)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progress target ${safeName}">
          <div class="progress-bar-fill" style="width:${status.percent}%"></div>
        </div>
      </li>`;
    })
    .join("");

  if (link) link.hidden = false;
  card.innerHTML = `
    <div class="budget-amounts">
      <div>
        <span class="budget-used">${formatRupiah(totalSaved)}</span>
        <span class="budget-total"> / ${formatRupiah(totalTarget)}</span>
      </div>
      <span class="budget-percent">${percentLabel}%</span>
    </div>
    <div class="progress-bar progress-bar--goal${allDone ? " is-done" : ""}">
      <div class="progress-bar-fill" style="width:${percent}%"></div>
    </div>
    <div class="budget-foot goals-card-foot">
      <span><strong class="num">${goals.length}</strong> target</span>
      <span><strong class="num">${activeCount}</strong> aktif · <strong class="num goals-card-done">${doneCount}</strong> tercapai</span>
    </div>
    <ul class="goals-card-list">${items}</ul>
    ${rest > 0 ? `<p class="goals-card-more">+${rest} target lainnya</p>` : ""}
  `;
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
    <p class="checkin-greeting">👋 ${getGreetingWord()}, ${escapeHtml(getUserName())}!</p>
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

/**
 * Dropdown Notifikasi di header. Ikon Pengaturan bukan dropdown lagi — ia
 * tautan biasa ke settings.html, jadi tidak ada panel/handler untuknya.
 * Setiap dropdown = { trigger, panel } — trigger toggle panelnya sendiri,
 * klik di luar wrapper mana pun (atau tombol Escape) menutup semua panel.
 */
function setupHeaderActions() {
  const dropdowns = [
    { trigger: document.getElementById("btn-notification"), panel: document.getElementById("notification-panel") },
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
}

/** Fitur hide/show Saldo Anda — default tersembunyi, toggle via icon mata. */
function setupBalanceToggle() {
  document.getElementById("btn-toggle-balance").addEventListener("click", () => {
    setBalanceVisible(!isBalanceVisible);
  });
}

/**
 * Popup ringkasan saat dashboard pertama kali dibuka. Dipakai sessionStorage
 * (bukan data sensitif) supaya tidak muncul berulang-ulang di sesi/tab yang
 * sama, tapi tetap muncul lagi di sesi baru.
 */
function shouldShowCheckin() {
  // Preferensi user (settings.showCheckin) = izin tampil sama sekali.
  // Berbeda dari checkinDismissed (sessionStorage) = sudah ditutup di sesi ini.
  if (!financeData.settings.showCheckin) return false;
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
  // Lifecycle (timer hide, frame animasi, tumpukan modal, kunci scroll, fokus
  // awal & focus restore) dipegang createModalController() di core.js.
  // Check-in hanya beda dua hal: animasi keluarnya 220ms, dan setiap kali
  // benar-benar tertutup — lewat tombol, CTA, klik latar, atau Escape —
  // sesi ini ditandai supaya popup tidak muncul lagi.
  const modal = createModalController(overlay, {
    duration: 220,
    onClose: () => {
      try {
        sessionStorage.setItem("checkinDismissed", "true");
      } catch (err) {
        // sessionStorage tidak tersedia — abaikan; popup cukup tidak muncul
        // lagi selama tab ini masih terbuka.
      }
    },
  });

  function openCheckin() {
    renderCheckin(); // isi dulu, baru ditampilkan
    modal.open();
  }

  document.getElementById("checkin-close").addEventListener("click", () => modal.close());
  document.getElementById("checkin-cta").addEventListener("click", () => modal.close());

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

  renderGreeting();
  renderSummary(financeData.summary);
  // Preferensi AWAL saat dashboard dibuka (settings.hideBalanceOnOpen).
  // Setelah itu tombol mata tetap bebas mengubah isBalanceVisible sementara.
  setBalanceVisible(!financeData.settings.hideBalanceOnOpen);
  renderBudgetSummary();
  renderGoalsDashboard(); // G-4: hanya membaca financeData.goals
  renderRecentTransactions();
  renderNotifications();

  setupHeaderActions();
  setupBalanceToggle();
  setupTransactionModal();
  setupCheckin();
}
