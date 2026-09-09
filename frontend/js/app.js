/**
 * app.js
 * Logika dashboard Personal Finance (M1 - UI only, data masih statis/mock).
 *
 * Struktur file ini sengaja dipisah per tanggung jawab:
 *  1. MOCK DATA        -> nanti tinggal diganti pemanggilan API/database
 *  2. HELPERS          -> fungsi murni (format angka, waktu, dsb.)
 *  3. RENDER FUNCTIONS -> menulis data ke DOM
 *  4. EVENT HANDLERS   -> interaksi filter (UI only, belum ada query nyata)
 *  5. INIT             -> menjalankan semuanya saat halaman dimuat
 */

/* =========================================================
   1. MOCK DATA
   Nantinya bagian ini bisa diganti dengan hasil fetch() ke API,
   tanpa perlu mengubah fungsi render di bawah.
   ========================================================= */
const financeData = {
  summary: {
    balance: 4945000,
    income: 5000000,
    expense: 55000,
  },

  // key kategori harus sama dengan value data-category pada chip filter di index.html
  categories: {
    makanan: { name: "Makanan", budget: 800000, used: 300000 },
    bensin: { name: "Bensin", budget: 300000, used: 120000 },
    belanja: { name: "Belanja", budget: 500000, used: 470000 },
    tagihan: { name: "Tagihan", budget: 600000, used: 600000 },
    hiburan: { name: "Hiburan", budget: 200000, used: 40000 },
  },

  // Goals Keuangan — bagian dari Financial Summary
  goal: {
    name: "Dana Darurat",
    current: 6200000,
    target: 10000000,
  },

  insight: "Pengeluaran kamu minggu ini 18% lebih tinggi dibanding minggu lalu",

  transactions: [
    { id: 1, title: "Makan Siang", category: "makanan", type: "expense", amount: 25000, time: "Hari ini, 12:30" },
    { id: 2, title: "Bensin Motor", category: "bensin", type: "expense", amount: 30000, time: "Hari ini, 09:15" },
    { id: 3, title: "Gaji Bulanan", category: "lainnya", type: "income", amount: 5000000, time: "1 Sep, 08:00" },
  ],
};

// Ikon singkat per kategori untuk daftar transaksi (opsional, hanya kosmetik)
const CATEGORY_ICON = {
  makanan: "🍔",
  bensin: "⛽",
  belanja: "🛍️",
  tagihan: "🧾",
  hiburan: "🎬",
  lainnya: "💼",
};

/* =========================================================
   2. HELPERS
   ========================================================= */

/** Format angka menjadi format Rupiah, contoh: 300000 -> "Rp300.000" */
function formatRupiah(number) {
  const rounded = Math.round(Math.abs(number));
  return `Rp${rounded.toLocaleString("id-ID")}`;
}

/** Tentukan sapaan berdasarkan jam saat ini */
function getGreetingWord(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Hitung status budget kategori berdasarkan persentase pemakaian */
function getBudgetStatus(percent) {
  if (percent >= 90) return { key: "danger", label: "Melebihi batas aman" };
  if (percent >= 70) return { key: "warning", label: "Perlu diperhatikan" };
  return { key: "safe", label: "Masih aman" };
}

/** Gabungkan seluruh kategori jadi satu ringkasan (dipakai saat filter "Semua Kategori") */
function getAggregateCategory(categories) {
  const values = Object.values(categories);
  const budget = values.reduce((sum, c) => sum + c.budget, 0);
  const used = values.reduce((sum, c) => sum + c.used, 0);
  return { name: "Semua Kategori", budget, used };
}

/* =========================================================
   3. RENDER FUNCTIONS
   ========================================================= */

/** 1. Header: sapaan dinamis */
function renderGreeting(userName = "Rizqi") {
  const el = document.getElementById("greeting-text");
  el.textContent = `${getGreetingWord()}, ${userName + "👋"}`;
}

/** 2. Financial Summary */
function renderSummary(summary) {
  document.getElementById("balance-value").textContent = formatRupiah(summary.balance);
  document.getElementById("income-value").textContent = formatRupiah(summary.income);
  document.getElementById("expense-value").textContent = formatRupiah(summary.expense);
}

/** 5. Category Analysis */
function renderCategoryAnalysis(categoryData) {
  const container = document.getElementById("category-analysis-card");
  const { name, budget, used } = categoryData;
  const remaining = Math.max(budget - used, 0);
  const percent = budget > 0 ? (used / budget) * 100 : 0;
  const percentLabel = percent.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  const status = getBudgetStatus(percent);

  container.innerHTML = `
    <div class="category-card-head">
      <span class="category-name">${name}</span>
      <span class="category-status" data-status="${status.key}">${status.label}</span>
    </div>
    <div class="category-budget-row">
      <span>Budget: ${formatRupiah(budget)}</span>
      <span>Terpakai: ${formatRupiah(used)}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-bar-fill" data-status="${status.key}" style="width:${Math.min(percent, 100)}%"></div>
    </div>
    <div class="category-card-foot">
      <span class="progress-percent">${percentLabel}%</span>
      <span class="remaining-budget">Sisa ${formatRupiah(remaining)}</span>
    </div>
  `;
}


/** 7. Financial Insight */
function renderInsight(text) {
  document.getElementById("insight-text").textContent = text;
}

/** 8. Recent Transactions */
function renderTransactions(transactions) {
  const list = document.getElementById("transaction-list");

  if (!transactions.length) {
    list.innerHTML = `<li class="transaction-empty">Belum ada transaksi untuk filter ini.</li>`;
    return;
  }

  list.innerHTML = transactions
    .map((tx) => {
      const isIncome = tx.type === "income";
      const sign = isIncome ? "+" : "-";
      const amountClass = isIncome ? "transaction-amount--income" : "transaction-amount--expense";
      const icon = CATEGORY_ICON[tx.category] || "💼";

      return `
        <li class="transaction-item">
          <span class="transaction-icon" aria-hidden="true">${icon}</span>
          <div class="transaction-info">
            <span class="transaction-title">${tx.title}</span>
            <span class="transaction-meta">${tx.time}</span>
          </div>
          <span class="transaction-amount ${amountClass}">${sign} ${formatRupiah(tx.amount)}</span>
        </li>
      `;
    })
    .join("");
}

/* =========================================================
   4. EVENT HANDLERS
   ========================================================= */

/**
 * Filter periode (Hari Ini / Minggu Ini / Bulan Ini / Custom).
 * M1 baru mengubah tampilan chip aktif; logika pemfilteran data
 * berdasarkan tanggal akan ditambahkan saat backend/API tersedia.
 */
function setupPeriodFilter() {
  const group = document.getElementById("period-filter");
  const chips = group.querySelectorAll(".filter-chip");

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      // TODO (M2+): panggil ulang data dari API dengan parameter period = chip.dataset.period
    });
  });
}

/**
 * Filter kategori (Semua Kategori / Makanan / Bensin / dst).
 * M1 mengganti Category Analysis dan menyaring daftar transaksi
 * berdasarkan data mock yang sudah ada di memori (belum ada request ke server).
 */
function setupCategoryFilter() {
  const group = document.getElementById("category-filter");
  const chips = group.querySelectorAll(".filter-chip");

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");

      const selected = chip.dataset.category;

      const categoryToShow =
        selected === "all"
          ? getAggregateCategory(financeData.categories)
          : financeData.categories[selected];

      renderCategoryAnalysis(categoryToShow);

      const filteredTransactions =
        selected === "all"
          ? financeData.transactions
          : financeData.transactions.filter((tx) => tx.category === selected);

      renderTransactions(filteredTransactions);
      // TODO (M2+): ganti filter di memori ini dengan query ke API/database
    });
  });
}

function setupHeaderActions() {
  document.getElementById("btn-notification").addEventListener("click", () => {
    // TODO: buka panel/halaman notifikasi saat fitur tersedia
    console.log("Notification button clicked");
  });

  document.getElementById("btn-settings").addEventListener("click", () => {
    // TODO: arahkan ke halaman pengaturan saat fitur tersedia
    console.log("Settings button clicked");
  });
}

/* =========================================================
   5. INIT
   ========================================================= */
function initDashboard() {
  renderGreeting("Rizqi");
  renderSummary(financeData.summary);
  renderCategoryAnalysis(getAggregateCategory(financeData.categories));
  renderInsight(financeData.insight);
  renderTransactions(financeData.transactions);

  setupPeriodFilter();
  setupCategoryFilter();
  setupHeaderActions();
}

document.addEventListener("DOMContentLoaded", initDashboard);
