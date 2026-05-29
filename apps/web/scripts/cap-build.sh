#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# cap-build.sh — Build FinMente para iOS / Android con Capacitor
#
# Uso:
#   ./scripts/cap-build.sh ios        # abre Xcode
#   ./scripts/cap-build.sh android    # abre Android Studio
#   ./scripts/cap-build.sh sync       # solo sync sin abrir IDE
# ──────────────────────────────────────────────────────────

set -e

PLATFORM=${1:-sync}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "📱 FinMente Capacitor Build"
echo "   Platform : $PLATFORM"
echo "   Dir      : $WEB_DIR"
echo ""

cd "$WEB_DIR"

# 1. Build Next.js en modo producción (genera .next/)
echo "🔨 Building Next.js..."
pnpm build

# 2. Sync Capacitor (copia web assets a ios/ y android/)
echo "🔄 Syncing Capacitor..."
npx cap sync

# 3. Abrir IDE si se pidió
if [ "$PLATFORM" = "ios" ]; then
  echo "🍎 Abriendo Xcode..."
  npx cap open ios
elif [ "$PLATFORM" = "android" ]; then
  echo "🤖 Abriendo Android Studio..."
  npx cap open android
else
  echo "✅ Sync completo. Corre con 'ios' o 'android' para abrir el IDE."
fi
