let form = document.querySelector("#transactionForm");
let namaInput = document.querySelector("#namaTransaksi");
let nominalInput = document.querySelector("#nominal");
let transactionList = document.querySelector("#transactionList");
let tipeInput = document.querySelector("#tipeTransaksi")
let saldoELement = document.querySelector("#saldo");
let pemasukanElement = document.querySelector("#pemasukan");
let pengeluaranElement = document.querySelector("#pengeluaran");
let transactions = [];
let transaksiEdit = null;
let saldo = 0;
let pemasukan = 0;
let pengeluaran = 0;
let kategoriInput = document.querySelector("#kategoriTransaksi");
let filterKategori = document.querySelector("#filterKategori");
let formError = document.querySelector("#formError");
let cancelEdit = document.querySelector("#cancelEdit");
let submitButton =document.querySelector("#transactionForm button[type='submit']");


form.addEventListener("submit", function(event) {

    event.preventDefault();

    if (namaInput.value.trim() === "") {
        formError.textContent = "Nama transaksi wajib diisi."
        return;
    }

    if (Number(nominalInput.value) <=0) {
        formError.textContent = "Nominal harus lebih dari 0."
        return;
    }

    formError.textContent = "";

    let transaksi = {
        nama: namaInput.value,
        nominal: Number(nominalInput.value),
        tipe: tipeInput.value,
        kategori: kategoriInput.value
    };

    if (transaksi.tipe === "pemasukan") {
        pemasukan = pemasukan + transaksi.nominal;
        saldo = saldo + transaksi.nominal;
    } else {
        pengeluaran = pengeluaran + transaksi.nominal;
        saldo = saldo - transaksi.nominal;
    }

    if (transaksiEdit) {

        transaksiEdit.nama = namaInput.value;
        transaksiEdit.nominal = Number(nominalInput.value);
        transaksiEdit.kategori = kategoriInput.value;
        transaksiEdit.tipe = tipeInput.value;
    } else {

        transactions.push(transaksi);
    }
    
    transaksiEdit = null;

    submitButton.textContent = "Tambah Transaksi";
    cancelEdit.style.display = "none";


    renderTransactions(transactions);
    saveTransactions();
    updateSummary();

    form.reset();

    saldoELement.textContent = "Rp " + saldo.toLocaleString("id-ID");
    pemasukanElement.textContent = "Rp " + pemasukan.toLocaleString("id-ID");
    pengeluaranElement.textContent = "Rp " + pengeluaran.toLocaleString("id-ID");
    
});

function renderTransactions(data) {
    transactionList.textContent = "";

    data.forEach(function(transaksi, index) {

        let transaksiElement = document.createElement("div");
        let infoElement = document.createElement("div");

        let namaElement = document.createElement("p");
        let nominalElement = document.createElement("p");
        let hapusButton = document.createElement("button");
        let editButton = document.createElement("button");
        let kategoriElement = document.createElement("p");

        editButton.textContent = "Edit";    

        kategoriElement.classList.add("category");

        let tanda;
        
        if (transaksi.tipe === "pemasukan" ) {
            tanda = "+";
            transaksiElement.classList.add("income");
            nominalElement.classList.add("income-text");
        } else {
            tanda = "-";
            transaksiElement.classList.add("expense");
            nominalElement.classList.add("expense-text");        }
            
        namaElement.textContent = transaksi.nama;

        nominalElement.textContent = tanda + " Rp " + transaksi.nominal.toLocaleString("id-ID");

        hapusButton.textContent = "Hapus";

        kategoriElement.textContent = transaksi.kategori;
 
        hapusButton.addEventListener("click", function() {
            let transactionIndex = transactions.indexOf(transaksi);
            
            transactions.splice(transactionIndex, 1);
            renderTransactions(transactions);
            saveTransactions();
            updateSummary();
        });

        editButton.addEventListener("click", function() {

            transaksiEdit = transaksi;

            namaInput.value = transaksi.nama;
            nominalInput.value = transaksi.nominal;
            tipeInput.value = transaksi.tipe;
            kategoriInput.value = transaksi.kategori;

            submitButton.textContent = "Simpan Perubahan";
            cancelEdit.style.display = "inline-block";
        });

        cancelEdit.addEventListener("click", function() {
            transaksiEdit = null;
            form.reset();

            submitButton.textContent = "Tambah Transaksi";
            cancelEdit.style.display = "none";
        });
        
        
        infoElement.append(namaElement);
        infoElement.append(kategoriElement);
        infoElement.append(nominalElement);
        
        transaksiElement.append(infoElement);
        transaksiElement.append(editButton);
        transaksiElement.append(hapusButton);

        transactionList.append(transaksiElement);

    });
}

filterKategori.addEventListener("change", function() {
            
            if (filterKategori.value === "semua") {
                renderTransactions(transactions);
            } else {
                let hasilFilter = transactions.filter(function(transaksi) {
                return transaksi.kategori === filterKategori.value;
                });

                renderTransactions(hasilFilter);
            }
            
        });


function updateSummary() {
    pemasukan = 0;
    pengeluaran = 0;
    saldo = 0;

    transactions.forEach(function(transaksi) {
        
        if (transaksi.tipe === "pemasukan") {
            pemasukan += transaksi.nominal;
        } else {
            pengeluaran += transaksi.nominal;
        }
    });

    saldo = pemasukan - pengeluaran;

    saldoELement.textContent = saldo.toLocaleString("id-ID");
    pemasukanElement.textContent = pemasukan.toLocaleString("id-ID");
    pengeluaranElement.textContent = pengeluaran.toLocaleString("id-ID");

};

function saveTransactions() {
    localStorage.setItem("transactions", JSON.stringify(transactions));
}

function loadTransactions() {
    
    let dataTersimpan = localStorage.getItem("transactions");

    if (dataTersimpan) {
        transactions = JSON.parse(dataTersimpan);
    }
}

loadTransactions();
renderTransactions(transactions);
updateSummary();