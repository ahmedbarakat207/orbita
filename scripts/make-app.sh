#!/bin/bash
# Builds a native double-clickable Orbita.app (no Electron) at the repo root.
# The app: starts the Amazfit Bip U BLE bridge, starts the Vite dashboard,
# waits for both, opens the browser, and supervises/restarts them if they die.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/Orbita.app"
VENV_PY="$ROOT/tools/.venv/bin/python"
CLANG="$(xcrun --find clang 2>/dev/null || command -v clang || true)"

command -v sips >/dev/null && command -v iconutil >/dev/null || { echo "sips/iconutil missing"; exit 1; }
[ -x "$VENV_PY" ] || { echo "Python venv missing: run README setup first"; exit 1; }

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# ---------- Info.plist ----------
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Orbita</string>
  <key>CFBundleDisplayName</key><string>Orbita</string>
  <key>CFBundleIdentifier</key><string>com.orbita.telemetry</string>
  <key>CFBundleVersion</key><string>0.2.0</string>
  <key>CFBundleShortVersionString</key><string>0.2.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>Orbita</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSBluetoothAlwaysUsageDescription</key><string>Orbita connects to your Amazfit Bip U and BLE sensors for live health telemetry.</string>
  <key>NSBluetoothPeripheralUsageDescription</key><string>Orbita connects to your Amazfit Bip U for live health telemetry.</string>
  <key>NSCameraUsageDescription</key><string>Orbita uses the camera for contactless heart-rate (rPPG) monitoring.</string>
  <key>NSMicrophoneUsageDescription</key><string>Orbita may use the microphone for ambient diagnostics.</string>
</dict>
</plist>
PLIST

# ---------- App icon (Pillow, from venv) ----------
"$VENV_PY" - "$APP/Contents/Resources" <<'PYEOF' || echo "(icon skipped)"
import sys
from PIL import Image, ImageDraw

out_dir = sys.argv[1]
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

def rrect(draw, xy, r, fill):
    draw.rounded_rectangle(xy, radius=r, fill=fill)

# Dark space background
rrect(d, (0, 0, S, S), 180, (10, 10, 14, 255))

# Orbit ring
d.ellipse((120, 300, 904, 830), outline=(0, 242, 254, 90), width=14)

# Cyan ECG pulse line
pts = []
y = 560
for x, dy in [(150,0),(300,0),(340,-40),(375,190),(410,-260),(445,150),(480,0),(560,0),(600,-30),(630,90),(660,0),(874,0)]:
    pts.append((x, y + dy))
d.line(pts, fill=(0, 242, 254, 255), width=36, joint="curve")

# Watch dot on orbit
d.ellipse((810, 380, 890, 460), fill=(0, 242, 254, 255))
d.ellipse((828, 398, 872, 442), fill=(10, 10, 14, 255))

# Telemetry tick marks
for i in range(9):
    x = 150 + i * 90
    d.line((x, 150, x, 190), fill=(0, 242, 254, 130), width=10)

full = img.resize((1024, 1024))
full.save(f"{out_dir}/icon_512x512@2x.png")
for sz, name in [(16,"icon_16x16.png"),(32,"icon_16x16@2x.png"),(32,"icon_32x32.png"),
                 (64,"icon_32x32@2x.png"),(128,"icon_128x128.png"),(256,"icon_128x128@2x.png"),
                 (256,"icon_256x256.png"),(512,"icon_512x512.png")]:
    full.resize((sz, sz)).save(f"{out_dir}/{name}")
print("icon drawn")
PYEOF

if [ -f "$APP/Contents/Resources/icon_512x512@2x.png" ]; then
  mkdir -p "$APP/Contents/Resources/AppIcon.iconset"
  cp "$APP/Contents/Resources"/icon_*.png "$APP/Contents/Resources/AppIcon.iconset/"
  iconutil -c icns "$APP/Contents/Resources/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns" \
    && /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string AppIcon" "$APP/Contents/Info.plist" \
    || echo "(icns conversion failed, generic icon used)"
  rm -rf "$APP/Contents/Resources/AppIcon.iconset" "$APP/Contents/Resources"/icon_*.png
fi

# ---------- Launcher (executable script) ----------
# Bakes absolute tool paths with generic fallbacks so it survives PATH changes.
NPM="$(command -v npm || echo /opt/homebrew/bin/npm)"
cat > "$APP/Contents/MacOS/Orbita" <<'LAUNCHER'
#!/bin/bash
# Orbita launcher — starts & supervises the BLE bridge + Vite dashboard,
# then opens the dashboard in the browser.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.cargo/bin:$PATH"
for n in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$n" ] && export PATH="$n:$PATH"; done

ROOT_BAKED="@ROOT@"
NPM_BAKED="@NPM@"

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ROOT="$ROOT_BAKED"
[ -d "$ROOT" ] || ROOT="$APP_DIR"
NPM="$NPM_BAKED"; command -v "$NPM" >/dev/null 2>&1 || NPM="$(command -v npm || true)"

PY="$ROOT/tools/.venv/bin/python"
BRIDGE="$ROOT/tools/bip_u_bridge.py"
LOGDIR="$HOME/Library/Logs/Orbita"
mkdir -p "$LOGDIR"
URL="http://localhost:5173"
GUI_UID="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/com.orbita.bridge.plist"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BROWSER_PROFILE="$HOME/Library/Application Support/Orbita/chrome-profile"

log() { echo "[Orbita $(date '+%H:%M:%S')] $*" >> "$LOGDIR/launcher.log"; }
trap 'exit 0' TERM INT

PIDFILE="$LOGDIR/launcher.pid"
STOPFLAG="$LOGDIR/stop.flag"

[ -x "$PY" ] || log "WARN: venv python missing at $PY — bridge agent will fail."

port_up() { nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }

bridge_agent_loaded() { launchctl print "gui/$GUI_UID/com.orbita.bridge" >/dev/null 2>&1; }

start_bridge() {
  if ! bridge_agent_loaded; then
    log "Bootstrapping bridge LaunchAgent..."
    launchctl bootstrap "gui/$GUI_UID" "$PLIST" 2>>"$LOGDIR/launcher.log" || true
  elif ! port_up 8766; then
    log "Bridge agent loaded but port down — kickstarting."
    launchctl kickstart -k "gui/$GUI_UID/com.orbita.bridge" 2>>"$LOGDIR/launcher.log" || true
  fi
}

start_vite() {
  [ -n "$NPM" ] || { log "FATAL: npm not found"; return 1; }
  log "Starting dashboard (vite)..."
  ( cd "$ROOT" && nohup "$NPM" run dev >>"$LOGDIR/dashboard.log" 2>&1 & echo $! > "$LOGDIR/dashboard.pid" )
}

stop_modules() {
  log "Stopping modules..."
  launchctl bootout "gui/$GUI_UID/com.orbita.bridge" 2>>"$LOGDIR/launcher.log" || true
  kill "$(cat "$LOGDIR/dashboard.pid" 2>/dev/null)" 2>/dev/null
  kill "$(cat "$LOGDIR/browser.pid" 2>/dev/null)" 2>/dev/null
  pkill -f "$ROOT/node_modules/vite/bin/vite.js" 2>/dev/null
  pkill -f "user-data-dir=$BROWSER_PROFILE" 2>/dev/null
  sleep 1
}

open_dashboard() {
  if [ -x "$CHROME_BIN" ]; then
    log "Opening dashboard fullscreen (Chrome kiosk): $URL"
    nohup "$CHROME_BIN" --kiosk "$URL" \
      --user-data-dir="$BROWSER_PROFILE" \
      --no-first-run --no-default-browser-check \
      >>"$LOGDIR/browser.log" 2>&1 &
    echo $! > "$LOGDIR/browser.pid"
  else
    log "Opening dashboard (default browser — install Chrome for fullscreen kiosk): $URL"
    open "$URL"
  fi
}

# --- graceful stop: touch ~/Library/Logs/Orbita/stop.flag to quit fully ---
if [ -f "$STOPFLAG" ]; then
  rm -f "$STOPFLAG"
  stop_modules
  rm -f "$PIDFILE"
  log "Orbita stopped by request."
  osascript -e 'display notification "Orbita stopped." with title "Orbita"' >/dev/null 2>&1
  exit 0
fi

# --- single instance: second click just brings the dashboard forward ---
if [ -f "$PIDFILE" ]; then
  OLD_PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null && \
     ps -p "$OLD_PID" -o command= 2>/dev/null | grep -q "Orbita.sh"; then
    log "Launcher already running (pid $OLD_PID) — showing dashboard."
    open_dashboard
    exit 0
  fi
fi
echo $$ > "$PIDFILE"

# --- initial bring-up ---
port_up 8766 || start_bridge
port_up 5173 || start_vite

# wait for bridge HTTP + dashboard
for i in $(seq 1 30); do
  port_up 8766 && port_up 5173 && break
  sleep 1
done

# wait for bridge to answer /api/status (watch link may still be negotiating)
for i in $(seq 1 15); do
  curl -sf -m 2 http://127.0.0.1:8766/api/status >/dev/null 2>&1 && break
  sleep 1
done

if port_up 8766 && port_up 5173; then
  log "All modules up. Watch link negotiated by bridge."
  osascript -e 'display notification "Bridge + dashboard running — watch telemetry streaming." with title "Orbita"' >/dev/null 2>&1
  open_dashboard
else
  log "WARN: modules not fully up (bridge: $(port_up 8766 && echo ok || echo down), dashboard: $(port_up 5173 && echo ok || echo down)) — opening dashboard anyway."
  open_dashboard
fi

# --- supervisor: restart anything that dies; honor stop.flag ---
while true; do
  sleep 10
  if [ -f "$STOPFLAG" ]; then
    rm -f "$STOPFLAG"
    stop_modules
    rm -f "$PIDFILE"
    log "Orbita stopped by request."
    osascript -e 'display notification "Orbita stopped." with title "Orbita"' >/dev/null 2>&1
    exit 0
  fi
  if ! port_up 8766; then
    log "Bridge down — restarting."
    echo "" >> "$LOGDIR/bridge.log"
    start_bridge
  fi
  if ! port_up 5173; then
    log "Dashboard down — restarting."
    echo "" >> "$LOGDIR/dashboard.log"
    start_vite
  fi
done
LAUNCHER

# Bake paths
sed -i '' \
  -e "s|@ROOT@|$ROOT|g" \
  -e "s|@NPM@|$NPM|g" \
  "$APP/Contents/MacOS/Orbita"
chmod +x "$APP/Contents/MacOS/Orbita"

# ---------- Native arm64 stub executable ----------
# LaunchServices runs script-exe bundles under Rosetta (x86_64) on some
# machines, which breaks arm64-only wheels in the venv. A compiled native
# stub makes the whole process tree arm64 from the start.
if [ -n "$CLANG" ]; then
  cat > /tmp/orbita_stub.c <<STUB
#include <unistd.h>
int main(void) {
  execl("/bin/bash", "bash", "$APP/Contents/MacOS/Orbita.sh", (char *)NULL);
  return 1;
}
STUB
  mv "$APP/Contents/MacOS/Orbita" "$APP/Contents/MacOS/Orbita.sh"
  xcrun "$CLANG" -arch arm64 -mmacosx-version-min=12.0 -O2 -o "$APP/Contents/MacOS/Orbita" /tmp/orbita_stub.c
  rm -f /tmp/orbita_stub.c
  echo "Compiled arm64 stub executable."
fi

codesign --force --deep --sign - "$APP" 2>/dev/null || true

# ---------- BLE bridge LaunchAgent ----------
# The bridge runs under launchd, not as an Orbita child: launchd-spawned
# processes get Bluetooth (TCC) permission attributed to the Python binary
# (which already has the user's grant), while Orbita's ad-hoc-signed bundle
# gets denied on every rebuild. Bonus: bridge auto-starts at login and
# launchd auto-restarts it if it crashes.
LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
GUI_UID="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/com.orbita.bridge.plist"

launchctl bootout "gui/$GUI_UID/com.orbita.bridge" >/dev/null 2>&1 || true
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/Orbita"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.orbita.bridge</string>
  <key>ProgramArguments</key><array>
    <string>$ROOT/tools/.venv/bin/python</string>
    <string>$ROOT/tools/bip_u_bridge.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/Orbita/bridge.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/Orbita/bridge.log</string>
</dict></plist>
EOF
launchctl bootstrap "gui/$GUI_UID" "$PLIST" >/dev/null 2>&1 || true
echo "Bridge LaunchAgent installed (auto-starts at login)."

# Refresh LaunchServices registration so double-click never hits a stale
# "running app" record (error -600: "not open anymore").
[ -x "$LSREG" ] && "$LSREG" -f "$APP" >/dev/null 2>&1

echo "Built: $APP"
echo "Launch with: open \"$APP\""
