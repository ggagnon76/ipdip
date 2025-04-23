import { socketDict, socketWrapper, message_handler, SOCKET_MODULE_NAME, MODULE_ID } from "./socket.js";
import { IpDipDrawingsLayer } from "./canvas_and_layers.js";
import { IPDIP_FormApp, IpDipDialog } from "./forms_and_classes.js";
import { rollTable } from "./functions.js";

/** Condition tracking variables */
export let isSpawned = false;
export let markerArr = [];

export function update_markerArr(arg) {
    markerArr = arg;
}

export function update_isSpawned(arg) {
    isSpawned = arg;
}

/** *********************************************** */
/** Hooks and delete-message eventListener function */
/** *********************************************** */

/**
 * Hook required to identify when a user tries to flush the chat log.
 * The local only chat messages will remain after Foundry flushes the chat log
 * This hook and function removes those local only chat log messages.
 */
Hooks.on('closeDialogV2', function (...args) {
    if (args[0].options.window.title === "CHAT.FlushTitle") {
        socketWrapper(socketDict.flushIpDipChatLog);
    }
});

export function flushIpDipChatLog() {
    const orderedList = document.getElementById("sidebar").getElementsByClassName("chat-log")[0];
    const li = [...orderedList.querySelectorAll("li")];
    li.forEach(elem => {
        if (elem.dataset.messageId === "") elem.parentNode.removeChild(elem);
    })
}

/**
 * Create default keybinding to launch the spawnDialog function.
 */
Hooks.once('init', function() {
    game.keybindings.register(MODULE_ID, "launchDialog", {
        name: "Ip Dip Keybinding",
        hint: "Launches a confirmation dialog application for the Ip Dip module.",
        uneditable: [],
        editable: [
            {
                key: "KeyI",
                modifiers: ["Control"]
            }
        ],
        onDown: () => spawnDialog(),
        onUp: () => {},
        restricted: true,
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    })
});

/**
 * Inject the IpDipDrawingsLayer into the canvas.
 */
Hooks.once("canvasInit", function() {
    let config = {
        group: "interface",
        layerClass: IpDipDrawingsLayer
    };
    let name = "ipdip_layer";
    const layer = CONFIG.Canvas.layers[name] = config;
    Object.defineProperty(this, name, {value: layer, writable: false});
    if ( !(name in canvas) ) Object.defineProperty(canvas, name, {value: new config.layerClass(), writable: false});
});

/**
 * PIXI code for the text injected into the markers
 * Enable socket coms
 * Expose the SpawnDialog() function for use in macros
 * In case the GM refreshed his browser while IpDip had markers active that players will see, issue the cleanUp() function to reset everything.
 */
Hooks.once('ready', function() {
    // Create the BitmapFont for the marker numbers
    PIXI.BitmapFont.from("IpDipFont", {
        fill: "#EF3A1B",
        fontSize: 150,
        fontWeight: "bold"
    }, {chars: PIXI.BitmapFont.NUMERIC})

    // Create the BitmapFont for the marker probabilities
    PIXI.BitmapFont.from("IpDipFontSmall", {
        fill: "#FFFFFF",
        fontSize: 50,
        fontWeight: "bold"
    }, {chars: [
        ['0', '9'],
        '%'
    ]})

    // Enable socket communications and handling
    game.socket.on(SOCKET_MODULE_NAME, message_handler);

    // The remainder is only applicable to GM accounts.
    if ( !game.user.isGM )  return;

    // Expose the spawnDialog function so GM can make a macro instead of using the keybinding.
    game.modules.get(MODULE_ID).spawnDialog = () => spawnDialog();

    // Emit the cleanUp() function to clients in case the DM refreshed browser while the dialog was unfinished.
    game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.cleanUp});
});

/**
 * World settings to allow the end user to customize the chat card Speaker and the chat card message
 */
Hooks.once('init', () => {
    game.settings.register(MODULE_ID, "Speaker", {
        scope: "world",
        config: false,
        requiresReload: false,
        type: String,
        default: "Lady Luck"
    })

    game.settings.register(MODULE_ID, "Message", {
        scope: "world",
        config: false,
        requiresReload: false,
        type: String,
        default: `<p style="text-align:center">Ip dip sky blue,<br>Granny sitting on the loo,<br>Doing farts, playing darts,<br>Lady Luck be with...  <em><strong>YOU</strong></em>?</p>`
    })

    game.settings.registerMenu(MODULE_ID, "IpDipSettingsMenu", {
        name: game.i18n.localize("IpDip.Settings.Name"),
        label: game.i18n.localize("IpDip.Settings.Label"),
        hint: game.i18n.localize("IpDip.Settings.Hint"),
        type: IPDIP_FormApp,
        restricted: true
    })
})

/** ************************************************************************************************************* */
/** spawnDialog is the function that is invoked by the keybinding or via macro.  It is the launch point for IpDip */
/** ************************************************************************************************************* */

async function spawnDialog() {
    // Only a GM should use this.  Don't let more than one dialog spawn at the same time.
    if ( !game.user.isGM || isSpawned ) return;
    isSpawned = true;

    // Intentionally change to the drawings layer so mouse clicking on the canvas will not activate controls like tokens, doors, etc...
    canvas.ipdip_layer.activate();

    // Add the container to the stage (for all clients)
    socketWrapper(socketDict.injectContainer);

    // Spawn the dialog then wait for GM to submit, cancel or close before continuing.
    const result = await new Promise(resolve => {
        new IpDipDialog({
            title: game.i18n.localize("IpDip.Dialog.Title"),
            content:    `<p>${game.i18n.localize("IpDip.Dialog.Content1")}</p>
                        <p>${game.i18n.localize("IpDip.Dialog.Content2")}</p>
                        <p>${game.i18n.localize("IpDip.Dialog.Content3")}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("IpDip.Confirmation.Choose"),
                    callback: () => resolve(true)
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("IpDip.Confirmation.Cancel"),
                    callback: () => resolve(false)
                }
                }
            }).render(true);
    });

    isSpawned = false;

    // If the GM canceled or closed the dialog without submitting, or clicked submit without placing a marker...
    if ( !result || !markerArr.length ) {
        socketWrapper(socketDict.cleanUp);
        return;
    };

    // Remove the eventHandler for the markers so they don't change probability value of the remaining marker when the others are deleted.
    socketWrapper(socketDict.removeContainerHandlers);

    // Create a Rollable Table, roll on it, delete the table and return the rolled result
    const tableResult = await rollTable(markerArr);

    // Act on the result.
    const newId = foundry.utils.randomID(16);
    socketWrapper(socketDict.tableResult, [tableResult, newId]);
}