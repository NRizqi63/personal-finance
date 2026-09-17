#!/usr/bin/env bash
# Runner regression suite Personal Finance.
#
# Tanpa dependency baru: hanya butuh bash, awk/sed (bawaan), dan Chrome/Chromium
# headless. Tidak ada package manager, tidak ada framework.
#
#   ./tests/scripts/run-tests.sh                 # semua (suite + console + overflow)
#   ./tests/scripts/run-tests.sh suites          # hanya suite .html di tests/harness
#   ./tests/scripts/run-tests.sh console         # 6 halaman x 4 lebar, hitung error konsol
#   ./tests/scripts/run-tests.sh overflow        # 6 halaman x 6 lebar, cek overflow horizontal
#   ./tests/scripts/run-tests.sh modalracetest jsfoundation      # suite tertentu
#
# Variabel lingkungan:
#   CHROME        path executable Chrome/Chromium (kalau deteksi otomatis gagal)
#   CHROME_FLAGS  flag tambahan (mis. --no-sandbox di container Linux)
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS="$ROOT/tests/harness"

# ---------- lokasi Chrome ----------
find_chrome() {
  if [ -n "${CHROME:-}" ]; then echo "$CHROME"; return; fi
  for c in \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  for c in google-chrome google-chrome-stable chromium chromium-browser msedge; do
    command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return; }
  done
  echo ""
}
CH="$(find_chrome)"
if [ -z "$CH" ]; then
  echo "Chrome/Chromium tidak ditemukan. Set CHROME=/path/ke/chrome lalu ulangi." >&2
  exit 2
fi

# ---------- path -> file:// URL (portabel Windows/macOS/Linux) ----------
to_url() {
  if command -v cygpath >/dev/null 2>&1; then
    echo "file:///$(cygpath -m "$1" | sed 's| |%20|g')"
  else
    echo "file://$(printf '%s' "$1" | sed 's| |%20|g')"
  fi
}

# ---------- ambil isi <pre id="r"> dari hasil --dump-dom ----------
extract() {
  awk '
    BEGIN { inside = 0 }
    {
      line = $0
      if (!inside) {
        i = index(line, "<pre id=\"r\">")
        if (i == 0) next
        line = substr(line, i + 12); inside = 1
      }
      j = index(line, "</pre>")
      if (j > 0) { print substr(line, 1, j - 1); exit }
      print line
    }' | sed -e 's/&lt;/</g' -e 's/&gt;/>/g' -e 's/&quot;/"/g' -e "s/&#39;/'/g" -e 's/&amp;/\&/g'
}

run_page() { # $1 = url
  "$CH" --headless=new --disable-gpu --allow-file-access-from-files \
        --window-size=1300,2400 --virtual-time-budget=400000 \
        ${CHROME_FLAGS:-} --dump-dom "$1" 2>/dev/null | extract
}

# Kegagalan yang SUDAH diketahui & bukan regresi (lihat tests/README.md).
is_known_fail() { # $1 = nama suite, $2 = baris FAIL
  case "$1|$2" in
    "functest|FAIL add modal opens"*) return 0 ;;
    *) return 1 ;;
  esac
}

TOTAL_PASS=0; TOTAL_FAIL=0; TOTAL_KNOWN=0; FAILED_SUITES=""

run_suite() { # $1 = nama file tanpa .html
  local name="$1" out pass fails n_fail=0 n_known=0
  [ -f "$HARNESS/$name.html" ] || { echo "$name: TIDAK ADA di tests/harness"; TOTAL_FAIL=$((TOTAL_FAIL + 1)); return; }
  out="$(run_page "$(to_url "$HARNESS/$name.html")")"
  pass=$(printf '%s\n' "$out" | grep -c '^PASS' || true)
  fails="$(printf '%s\n' "$out" | grep -E '^FAIL|EXCEPTION' || true)"
  if [ -n "$fails" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      if is_known_fail "$name" "$line"; then n_known=$((n_known + 1)); else n_fail=$((n_fail + 1)); fi
    done <<EOF
$fails
EOF
  fi
  TOTAL_PASS=$((TOTAL_PASS + pass)); TOTAL_FAIL=$((TOTAL_FAIL + n_fail)); TOTAL_KNOWN=$((TOTAL_KNOWN + n_known))
  printf '%-22s PASS=%-4s FAIL=%-3s' "$name" "$pass" "$((n_fail + n_known))"
  [ "$n_known" -gt 0 ] && printf ' (%s known artifact)' "$n_known"
  printf '\n'
  if [ -n "$fails" ]; then
    printf '%s\n' "$fails" | while IFS= read -r line; do
      [ -z "$line" ] && continue
      if is_known_fail "$name" "$line"; then echo "    KNOWN $line"; else echo "    $line"; fi
    done
  fi
  [ "$n_fail" -gt 0 ] && FAILED_SUITES="$FAILED_SUITES $name"
  return 0
}

SUITES="jsfoundation jsdashboard jsgoals jsanalytics jsbudget jstransactions jssettings cssdiff
modalracetest modaltest modallifecycletest m1datatest paymentmethodtest paymentmanagetest
goalstest goals2test goals3atest goals3btest goals4test
analyticsperiodtest analyticstest charttest budgettest
calendartest scrolltest fixtest functest uxflowtest v1fixtest v21test v22test finalaudit
settingstest settings2test settings3test settings3b0test settings3b1test settings3b2test settings3c1test settingsuitest"

PAGES="index goals analytics budget transactions settings"
CONSOLE_WIDTHS="320 390 768 1280"
OVERFLOW_WIDTHS="320 360 375 390 412 430"

run_console() {
  local ok=0 bad=0 out
  echo "--- console (6 halaman x 4 lebar)"
  for p in $PAGES; do for w in $CONSOLE_WIDTHS; do
    out="$(run_page "$(to_url "$HARNESS/consolecheck.html")?p=$p.html&w=$w")"
    case "$out" in
      *"errors=0"*) ok=$((ok + 1)) ;;
      *) bad=$((bad + 1)); echo "    $out" ;;
    esac
  done; done
  echo "console: bersih=$ok/$((ok + bad))"
  TOTAL_FAIL=$((TOTAL_FAIL + bad))
  [ "$bad" -gt 0 ] && FAILED_SUITES="$FAILED_SUITES console"
  return 0
}

run_overflow() {
  local ok=0 bad=0 out head vp
  echo "--- overflow (6 halaman x 6 lebar)"
  for p in $PAGES; do for w in $OVERFLOW_WIDTHS; do
    out="$(run_page "$(to_url "$HARNESS/harness.html")?p=$p.html&w=$w")"
    head="$(printf '%s\n' "$out" | head -1)"
    vp="$(printf '%s\n' "$head" | awk '{print $1, $2, $3}')"
    if printf '%s\n' "$out" | grep -q 'no overflow, no text spill' &&
       printf '%s\n' "$head" | awk '{split($1,a,"=");split($2,b,"=");split($3,c,"=");exit !(a[2]==b[2] && b[2]==c[2])}'; then
      ok=$((ok + 1))
    else
      bad=$((bad + 1)); echo "    $p@$w: $head"
    fi
  done; done
  echo "overflow: bersih=$ok/$((ok + bad))  (SMALL-TAP .bar-col di Analisis = catatan lama, bukan kegagalan)"
  TOTAL_FAIL=$((TOTAL_FAIL + bad))
  [ "$bad" -gt 0 ] && FAILED_SUITES="$FAILED_SUITES overflow"
  return 0
}

MODE="${1:-all}"
case "$MODE" in
  all)      echo "--- suites"; for t in $SUITES; do run_suite "$t"; done; run_console; run_overflow ;;
  suites)   echo "--- suites"; for t in $SUITES; do run_suite "$t"; done ;;
  console)  run_console ;;
  overflow) run_overflow ;;
  *)        echo "--- suites"; for t in "$@"; do run_suite "$t"; done ;;
esac

echo
echo "TOTAL PASS=$TOTAL_PASS  FAIL(baru)=$TOTAL_FAIL  known artifact=$TOTAL_KNOWN"
if [ "$TOTAL_FAIL" -gt 0 ]; then
  echo "GAGAL:$FAILED_SUITES"
  exit 1
fi
echo "SEMUA HIJAU (known artifact tidak dihitung sebagai kegagalan)"
exit 0
