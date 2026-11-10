# Wi-Fi for the plasma table (Raspberry Pi Zero 2 W)

The Pi sits at the table, plugged into the controller's USB. It serves the plasma website over
Wi-Fi and **runs each cut itself**, so a phone going to sleep or a Wi-Fi blip can't stall the
torch mid-cut. Reconnect and you see the job where it is.

## Parts
- Raspberry Pi Zero 2 W (about £15) + a 16 GB+ micro SD card
- 24 V → 5 V 3 A buck converter (about £5) to power it from the machine's 24 V supply
- Micro-USB **OTG** cable/adapter to the controller's USB lead (the Pi's port marked **USB**, not PWR)
- A **plastic** case. Mount the Pi **outside** the stainless box section – steel blocks Wi-Fi.
  Keep it and its cables away from the torch lead (HF start).

## Set up the SD card (on the laptop)
1. Install **Raspberry Pi Imager** and choose *Raspberry Pi Zero 2 W* → *Raspberry Pi OS Lite (64-bit)*.
2. Click *Edit settings*: hostname **plasma**, a username and password, your **Wi-Fi name and password**,
   and on the *Services* tab tick **Enable SSH** (password).
3. Write the card, put it in the Pi, power it up and wait about 2 minutes.

## Install the bridge (once)
On the laptop open *Command Prompt* (Windows) or *Terminal* (Mac) and type (use your username):

```
ssh yourname@plasma.local
sudo apt update && sudo apt install -y git
git clone https://github.com/scriptsjc-cmyk/Plasma-table.git ~/plasma
sudo bash ~/plasma/pi/install.sh
```

Then on your phone or laptop (same Wi-Fi) open **http://plasma.local** and press **Connect over Wi-Fi**.

## Updating
After you upload a new version to GitHub: `ssh yourname@plasma.local` then `plasma-update`.

## If it doesn't work
- *Page won't open*: check the Pi's green light, same Wi-Fi, try `http://plasma.local` (http, not https).
  Some Android phones don't do `.local` names – use the Pi's IP address from your router.
- *"Can't see the controller"*: check the OTG cable is in the Pi's **USB** port, not PWR.
- See what it's doing: `journalctl -u plasma -f`
