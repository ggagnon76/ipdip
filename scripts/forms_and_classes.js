/** Form application that will be invoked by the settings menu to define a message and speaker for the chat messages */
export class IPDIP_FormApp extends FormApplication {
    constructor() {
      super();
    }
  
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        width: 500,
        template: `./modules/${MODULE_ID}/templates/ipdip-settings-menu.hbs`,
        id: "ipdip-settings",
        title: game.i18n.localize('IpDip.Settings.Name'),
        submitOnChange: true,
        closeOnSubmit: false
      })
    }
  
    getData() {
      return {
        speaker: game.settings.get(MODULE_ID, "Speaker"),
        message: game.settings.get(MODULE_ID, "Message")
      }
    }
  
    async _updateObject(event, formData) {

        if ( event.type === "submit") {
            game.settings.set(MODULE_ID, "Speaker", formData["ipdip-speaker"]);
            game.settings.set(MODULE_ID, "Message", formData["ipdip-message"]);
            this.close()
        }
    }
}

/** ********************************************************************************************** */
/** Extend Dialog class to be able to perform extra operations on header button close (or ESC key) */
/** ********************************************************************************************** */

export class IpDipDialog extends Dialog {
    constructor(data, options={}) {
        super(data, options);
        this.modifyHeaderButtons();
    }

    // Adds the cleanUp function when the header close button is clicked.
    modifyHeaderButtons() {
        Hooks.once('getApplicationHeaderButtons', (dialog, buttonsArr) => {
            buttonsArr[0].onclick = () => {
                socketWrapper(socketDict.cleanUp);
                this.close()
            };
        })
    }

    // Adds the cleanUp function when the dialog is closed via ESC key.
    /* OVERRIDE */
    _onKeyDown(event) {
        // Close dialog
        if ( event.key === "Escape" ) {
            socketWrapper(socketDict.cleanUp);
            return super._onKeyDown(event);
        }
    }
}