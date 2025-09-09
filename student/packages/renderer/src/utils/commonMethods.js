// gracefullyExit.js
// ES module: import { gracefullyExit } from 'commonMethods.js'

export function gracefullyExit() {
    console.log("gracefullyExit")

    const needsPw = !!(this.localLockdown || (this.serverstatus?.examPassword ?? "") !== ""); // is password needed
    const expected = this.localLockdown ? (this.serverstatus?.password ?? "") : (this.serverstatus?.examPassword ?? ""); // expected password
  
    return this.$swal.fire({
      title: this.$t("editor.exit"),                             // title
      text: this.$t("editor.exitkiosk"),                         // text
      icon: "question",                                    // icon
      showCancelButton: true,                              // show cancel button
      cancelButtonText: this.$t("editor.cancel"),                // cancel button text
      reverseButtons: true,                                // reverse buttons
      html: needsPw ? `
        <div class="m-2 mt-4">
          <div class="input-group m-1 mb-1">
            <span class="input-group-text col-3" style="width:140px;">Passwort</span>
            <input class="form-control" type="password" id="localpassword" placeholder="Passwort">
          </div>
        </div>
      ` : "",
      didOpen: () => document.getElementById('localpassword')?.focus(), // focus on password input
      preConfirm: () => {
        if (!needsPw) { ipcRenderer.send('gracefullyexit'); return; }    // no password needed
        const value = document.getElementById('localpassword')?.value || ""; // entered password
        if (value === expected) { ipcRenderer.send('gracefullyexit'); return; } // correct
        this.$swal.showValidationMessage(this.$t("general.wrongpassword"));          // warning
      }
    });
  }
  