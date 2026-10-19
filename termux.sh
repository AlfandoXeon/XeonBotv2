
#!/data/data/com.termux/files/usr/bin/bash

set -Eeuo pipefail

PROJECT_DIR="$HOME/XeonBotv2"
SHARP_VERSION="0.34.5"
WASM_PACKAGE="@img/sharp-wasm32"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

info() {
    printf "${CYAN}[INFO]${RESET} %s\n" "$1"
}

success() {
    printf "${GREEN}[OK]${RESET} %s\n" "$1"
}

warn() {
    printf "${YELLOW}[PERINGATAN]${RESET} %s\n" "$1"
}

error() {
    printf "${RED}[ERROR]${RESET} %s\n' "$1" >&2
    exit 1
}

check_environment() {
    if [[ ! -d "$PROJECT_DIR" ]]; then
        error "Folder proyek tidak ditemukan: $PROJECT_DIR"
    fi

    if [[ -z "${PREFIX:-}" ]] || [[ "$PREFIX" != *com.termux/files/usr ]]; then
        error "Jalankan script ini dari lingkungan Termux."
    fi

    cd "$PROJECT_DIR"

    if [[ ! -f package.json ]]; then
        error "package.json tidak ditemukan."
    fi

    if ! command -v node >/dev/null 2>&1 ||
       ! command -v npm >/dev/null 2>&1; then
        error "Node.js atau npm belum terpasang."
    fi
}

setup_sharp() {
    check_environment

    info "Memasang sharp versi $SHARP_VERSION..."

    npm install "sharp@$SHARP_VERSION"

    info "Memasang WebAssembly sharp versi $SHARP_VERSION..."

    npm install --force "$WASM_PACKAGE@$SHARP_VERSION"

    info "Memeriksa sharp utama dan milik @neoxr/wb..."

    node <<'NODE'
const paths = [
    'sharp',
    './node_modules/@neoxr/wb/node_modules/sharp'
];

let failed = false;

for (const path of paths) {
    try {
        const sharp = require(path);
        console.log(`${path}: sharp ${sharp.versions.sharp}`);
    } catch (error) {
        failed = true;
        console.error(`${path}: ${error.message}`);
    }
}

if (failed) process.exit(1);
NODE

    if [[ $? -eq 0 ]]; then
        success "Pemeriksaan sharp berhasil."
    else
        error "Pemeriksaan sharp gagal. Periksa versi dependency."
    fi
}

check_dependencies() {
    check_environment

    info "Memeriksa dependency..."

    npm ls sharp "$WASM_PACKAGE" || true

    info "Memeriksa apakah sharp dapat dimuat..."

    node -e "console.log(require('sharp').versions)"
}

start_bot() {
    check_environment

    info "Memeriksa sharp sebelum menjalankan bot..."

    node -e "require('sharp')" || {
        error "sharp belum berfungsi. Jalankan: bash xeonbot-termux.sh setup"
    }

    if [[ ! -f index.js ]]; then
        warn "index.js tidak ditemukan; memeriksa entry point package.json."
    fi

    info "Menjalankan XeonBotv2..."

    exec node .
}

case "${1:-menu}" in
    setup)
        setup_sharp
        ;;
    check)
        check_dependencies
        ;;
    start)
        start_bot
        ;;
    menu)
        check_environment

        printf "\n${CYAN}===== XEON BOT TERMUX =====${RESET}\n"
        printf "1. Perbaiki dependency sharp\n"
        printf "2. Periksa dependency\n"
        printf "3. Jalankan bot\n"
        printf "4. Keluar\n\n"
        read -r -p "Pilih [1-4]: " choice

        case "$choice" in
            1) setup_sharp ;;
            2) check_dependencies ;;
            3) start_bot ;;
            4) exit 0 ;;
            *) error "Pilihan tidak valid." ;;
        esac
        ;;
    *)
        printf "Penggunaan: bash xeonbot-termux.sh [setup|check|start]\n"
        exit 1
        ;;
esac
