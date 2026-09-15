/**
 * analytics.js — kode khusus analytics.html (refactor JS tahap 4).
 * Dimuat SETELAH core.js; dispatcher DOMContentLoaded di core.js yang
 * memanggil initAnalyticsPage() di sini. Isi disalin verbatim dari app.js,
 * urutan deklarasi asli dipertahankan. Berisi: state bulan yang dilihat
 * (analyticsViewDate, analyticsPage), ringkasan, chart per tanggal + scrub,
 * breakdown kategori, detail, insight, navigator bulan, initAnalyticsPage.
 * Helper rentang bulan/tanggal (getMonthRange, getExpensesInRange, addDays,
 * isValidIsoDate, getWeeklyComparison) dan renderTransactionItem ada di core.js.
 */

// State halaman Analisis: batang (tanggal) yang dipilih & daftar detail diperluas.
const analyticsPage = { selectedKey: null, detailExpanded: false };

// Bulan yang sedang DILIHAT di analytics.html — hanya state halaman (tidak
// dipersist), pola & aturannya sama dengan budgetViewDate di budget.html:
// default bulan berjalan, hanya boleh mundur.
let analyticsViewDate = startOfMonth(new Date());

/** Pengeluaran per kategori dalam rentang (kategori yang sudah dihapus ->
 * "Lainnya"), urut dari yang terbesar; share dari total rentang itu. */
function getExpenseByCategory(range) {
  const totals = {};
  getExpensesInRange(range.from, range.to).forEach((tx) => {
    const key = hasCategory(tx.category) ? tx.category : FALLBACK_CATEGORY.key;
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

  /** Insight pemakaian satu budget (kategori atau bulanan). Hanya untuk >= 70%.
   * `label` HARUS sudah di-escape kalau berasal dari data user (nama
   * kategori) — hasilnya dirender sebagai HTML (mengandung emoji & <strong>
   * dari kalimatnya sendiri), jadi escape dilakukan di sumbernya, sekali. */
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
    .map(([key, cat]) => ({ key, insight: budgetInsight(escapeHtml(cat.name), getCategoryUsed(key, now), cat.budget) }))
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
      text: `💡 ${escapeHtml(top.name)} jadi pengeluaran terbesar kamu bulan ini (${Math.round(top.share)}% dari total). Coba tentukan batas harian untuk kategori ini sampai akhir bulan.`,
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
      ${topCategory ? `<span class="stat-value">${escapeHtml(topCategory.emoji)} ${escapeHtml(topCategory.name)}</span><span class="stat-sub num">${formatRupiah(topCategory.amount)}</span>` : `<span class="stat-value stat-value--text">Belum ada</span><span class="stat-sub">pengeluaran bulan ini</span>`}
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
    <p class="chart-note">${max > 0 ? `Total ${range.label} <strong class="num">${formatRupiah(total)}</strong>` : `Belum ada pengeluaran pada ${range.label}.`}${undated ? ` <span class="chart-note-muted">· ${undated} pengeluaran tanpa tanggal valid tidak ditampilkan</span>` : ""}</p>
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
  const range = getMonthRange(analyticsViewDate);
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
    el.innerHTML = `<p class="chart-empty">Belum ada pengeluaran pada ${escapeHtml(range.label)}.</p>`;
    return;
  }
  const max = rows[0].amount;
  el.innerHTML = rows
    .map(
      (r) => `
      <div class="cat-row">
        <div class="cat-row-head">
          <span class="cat-row-name"><span class="category-emoji" aria-hidden="true">${escapeHtml(r.emoji)}</span>${escapeHtml(r.name)}</span>
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
  // Insight memakai sisa hari bulan berjalan & perbandingan minggu ini vs
  // minggu lalu, jadi hanya bermakna untuk bulan berjalan. Saat user melihat
  // bulan lain, katakan apa adanya — jangan tampilkan angka bulan ini
  // seolah-olah milik bulan yang sedang dilihat.
  const sub = document.getElementById("insight-period-sub");
  const viewingCurrentMonth = isCurrentMonth(analyticsViewDate);
  if (sub) sub.textContent = viewingCurrentMonth ? "bulan ini" : formatMonthYearID(new Date());
  if (!viewingCurrentMonth) {
    el.innerHTML = `<li class="insight-item" data-level="neutral">💡 Insight keuangan dihitung untuk bulan berjalan (${escapeHtml(formatMonthYearID(new Date()))}). Kembali ke "Bulan Ini" untuk melihatnya.</li>`;
    return;
  }
  el.innerHTML = getAnalyticsInsights()
    .map((ins) => `<li class="insight-item" data-level="${ins.level}">${ins.text}</li>`)
    .join("");
}

/** Render seluruh halaman Analisis dari rentang bulan berjalan. */
function renderAnalytics() {
  const range = getMonthRange(analyticsViewDate);
  const buckets = getDayBuckets(range.from, range.to);
  if (analyticsPage.selectedKey && !buckets.some((b) => b.key === analyticsPage.selectedKey)) analyticsPage.selectedKey = null;
  renderAnalyticsSummary(range);
  renderTimeChart(range, buckets);
  renderCategoryChart(range);
  renderChartDetail(range, buckets);
  renderInsights();
  renderAnalyticsPeriod();
}

/** Navigator bulan di analytics.html: label, tombol › (disabled di bulan
 * berjalan — masa depan tidak bisa dipilih) dan "Bulan Ini" (disabled kalau
 * sudah di bulan berjalan). Aturan sama dengan navigator budget. */
function renderAnalyticsPeriod() {
  const title = document.getElementById("analytics-period-title");
  if (!title) return; // bukan di halaman analisis
  const current = isCurrentMonth(analyticsViewDate);
  title.textContent = formatMonthYearID(analyticsViewDate);
  document.getElementById("analytics-next-month").disabled = current;
  document.getElementById("analytics-this-month").disabled = current;
}

/** Pasang tombol navigator bulan (analytics.html). Listener dipasang SEKALI
 * saat init; render ulang hanya mengubah isi, bukan menambah listener. */
function setupAnalyticsPeriodNav() {
  const prev = document.getElementById("analytics-prev-month");
  if (!prev) return; // bukan di halaman analisis

  function setViewMonth(date) {
    const limit = startOfMonth(new Date()); // tidak pernah melewati bulan berjalan
    analyticsViewDate = date > limit ? limit : startOfMonth(date);
    // Pilihan batang & daftar detail milik bulan sebelumnya tidak relevan lagi.
    analyticsPage.selectedKey = null;
    analyticsPage.detailExpanded = false;
    renderAnalytics();
  }

  prev.addEventListener("click", () => setViewMonth(new Date(analyticsViewDate.getFullYear(), analyticsViewDate.getMonth() - 1, 1)));
  document.getElementById("analytics-next-month").addEventListener("click", () => {
    if (isCurrentMonth(analyticsViewDate)) return; // tombol sudah disabled; jaga-jaga
    setViewMonth(new Date(analyticsViewDate.getFullYear(), analyticsViewDate.getMonth() + 1, 1));
  });
  document.getElementById("analytics-this-month").addEventListener("click", () => setViewMonth(new Date()));
}

/**
 * Halaman "Analisis" (analytics.html): ringkasan, chart pengeluaran per
 * waktu & per kategori, dan Insight Keuangan — semuanya dari transaksi +
 * budget yang sama di localStorage, tidak ada dataset terpisah.
 */
function initAnalyticsPage() {
  recalcFromTransactions();
  analyticsViewDate = startOfMonth(new Date()); // default: bulan berjalan
  renderAnalytics();
  setupAnalyticsPeriodNav();
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
