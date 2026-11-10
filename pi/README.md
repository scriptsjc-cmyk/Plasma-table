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

## Optional: check the operator's account before accepting G-code

The pairing token (`?token=` / `bridge.token`) always applies. On top of that you can
ask the bridge to confirm the connecting user owns *this* table, using the same
Supabase project as the website.

1. Put this table's serial, the project URL and the **anon** key (never the
   service_role key) in `pi/bridge.account.json`:

   ```json
   {
     "supabase_url": "https://xxxxxxxxxxxx.supabase.co",
     "supabase_anon": "paste-the-anon-key",
     "machine_serial": "TABLE-0001"
   }
   ```

   Or pass `--machine-serial`, `--supabase-url` and `--supabase-anon-file`.

2. Restart the bridge. The website then sends the user's signed-in session. The
   Pi checks it at `/auth/v1/user` and that `machines.owner` matches this serial
   *before* it will accept G-code (jog, send, run). Stop/reset still follow the
   usual pairing-token path once the socket is up.

If that file is missing, behaviour is unchanged (pairing token only). If any of the three
settings is present but the others are missing, the file can't be read, or the URL isn't
`https://`, the bridge refuses to start instead of quietly turning the check off. Until a
signed-in owner is confirmed, only STOP (reset, feed hold, jog cancel) is accepted. See
`docs/ACCOUNTS-SETUP.md` for the full setup, and for why a **direct USB
(Web Serial)** lead cannot be enforced the same way — only the app-side lock
applies there, until a future firmware-level check.


## Security notes
- The bridge makes a random **pairing token** the first time it runs and keeps it in `~/.plasma-bridge-token` (on the Pi, mode 600, **outside** the website folder). The page fetches it from `/bridge.json` and uses it for the WebSocket. Delete the file and restart (`sudo systemctl restart plasma`) to issue a new one.
- The bridge only answers requests whose `Host` is the Pi itself (an IP address, `localhost`, `plasma.local` or another bare/.local name). If you reach it through some other DNS name, add it with `--origin http://that.name` (repeatable) in the service file.
- One screen at a time: a second screen gets "409 busy". A screen that has been silent for 6 s (phone dropped off Wi-Fi) is dropped so you can reconnect.
