// Sign in, sign up, sign-in link, reset and new-PIN forms.
import { $, pane, toast } from "./uibase.js";
import { afterAuth } from "./accounthome.js";
import * as A from "./account.js";

// Round 5 item 17: "Show" next to each password box flips it to plain text and back (nothing is stored or logged)
function bindShowPassword() {
  document.querySelectorAll(".pwshow").forEach((b) => {
    b.onclick = () => {
      const inp = $(b.dataset.pw); if (!inp) return;
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      b.textContent = show ? "Hide" : "Show";
      b.setAttribute("aria-pressed", show ? "true" : "false");
      b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    };
  });
}
export function bindAuthForms() {
  bindShowPassword();
  $("goSignUp").onclick = () => pane("up");
  $("goSignIn").onclick = () => pane("in");
  $("goReset").onclick = () => pane("reset");
  $("goLink").onclick = () => pane("link");
  $("confirmGoIn").onclick = () => pane("in");
  $("btnResendConfirm").onclick = async () => {
    try {
      const email = $("confirmEmail").dataset.email || $("confirmEmail").textContent;
      const r = await A.resendConfirm(email);
      toast(r.demoInstant ? "Demo: no email is sent in local demo mode." : "Confirmation email sent again. Check your inbox.");
    } catch (err) { toast(err.message, true); }
  };
  $("backIn1").onclick = () => pane("in");
  $("backIn2").onclick = () => pane("in");
  $("backIn3").onclick = () => pane("in");
  $("formSignIn").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await A.signIn({ email: $("inEmail").value, pin: $("inPin").value });
      toast("Signed in");
      await afterAuth(true);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });
  $("formSignUp").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const r = await A.signUp({ email: $("upEmail").value, pin: $("upPin").value, display_name: $("upName").value, mode: "beginner" });
      if (r.confirm) {
        $("confirmEmail").textContent = r.email || $("upEmail").value;
        $("confirmEmail").dataset.email = r.email || $("upEmail").value;
        pane("confirm");
        toast("Check your email to confirm the account, then sign in.");
      } else {
        toast("Account created");
        if (A.isSignedIn()) await afterAuth(true);
        else pane("in");
      }
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });
  $("formLink").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const r = await A.signInWithLink($("linkEmail").value);
      toast(r.demoInstant ? "Demo: signed in on this device (no email was sent)." : "Check your email for the sign-in link.");
      if (A.isSignedIn()) await afterAuth(true);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });
  $("formReset").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const r = await A.requestReset($("resetEmail").value);
      if (r.demoInstant) {
        $("newPinEmail").value = $("resetEmail").value;
        pane("newpin");
        toast("Demo: choose a new password. No email was sent.");
      } else toast("If that account exists, a reset email is on its way.");
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });
  $("formNewPin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await A.setNewPin($("newPin").value, $("newPinEmail").value);
      toast("Password updated");
      await afterAuth(false);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });
}
