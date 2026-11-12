#!/bin/bash
# Porta Plazma CNC Wi-Fi bridge: install as a service that starts on power-up.
# Run once on the Pi:  sudo bash ~/plasma/pi/install.sh
set -e
if [ "$(id -u)" != "0" ]; then echo "Run with sudo:  sudo bash $0"; exit 1; fi
DIR=$(cd "$(dirname "$0")/.." && pwd)
WHO=${SUDO_USER:-pi}

usermod -aG dialout "$WHO"            # allowed to use the controller's USB port

cat > /etc/systemd/system/plasma.service <<UNIT
[Unit]
Description=Porta Plazma CNC Wi-Fi bridge
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 $DIR/pi/bridge.py --site $DIR --port 80
User=$WHO
SupplementaryGroups=dialout
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT

cat > /usr/local/bin/plasma-update <<UPD
#!/bin/bash
# get the newest website + bridge from GitHub and restart
cd "$DIR" && sudo -u "$WHO" git pull --ff-only && sudo systemctl restart plasma && echo "Updated. Refresh the page."
UPD
chmod +x /usr/local/bin/plasma-update

systemctl daemon-reload
systemctl enable --now plasma
sleep 2
systemctl --no-pager --lines=5 status plasma || true
echo
echo "Done. On your phone or laptop (same Wi-Fi) open:  http://$(hostname).local"
echo "To update later:  plasma-update"
