/** CONSTANTS */
const MODULE_ID = "ipdip";
const SOCKET_MODULE_NAME = "module." + MODULE_ID;
const MARKER_SRC = "modules/ipdip/assets/Marker.png";
const CROSSHAIR_SRC = "modules/ipdip/assets/Crosshairs.png";

/** Condition tracking variables */
let isSpawned = false;
let markerCounter = 1;
let markerArr = [];
let wheelHookId = null;
let stageScale = null;

// Create a PIXI container to add the markers into
const container = new PIXI.Container();

/** ******************************************************* */
/** Message_handler and functions for socket communications */
/** ******************************************************* */

/* Useful dictionary for calling socketWrapper and determining the switch in message_handler */
const socketDict = {
    injectContainer : "injectContainer",
    cleanUp : "cleanUp",
    tableResult : "tableResult",
    newMarker : "newMarker",
    removeContainerHandlers : "removeContainerHandlers",
    updateProbabilities : "updateProbabilities",
    deleteIpDipMessages : "deleteIpDipMessages"
}

/* Function used to fire a function locally for the GM and on clients via socket */
function socketWrapper(requestID, data=null) {
    switch(requestID) {
        case socketDict.injectContainer:
            injectContainer();
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.injectContainer});
            break;
        case socketDict.cleanUp:
            cleanUp();
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.cleanUp});
            break;
        case socketDict.tableResult:
            processTableResult(...data);
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.tableResult, data: data});
            break;
        case socketDict.newMarker:
            newMarker(...data);
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.newMarker, data: data});
            break;
        case socketDict.removeContainerHandlers:
            removeContainerHandlers();
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.removeContainerHandlers});
            break;
        case socketDict.updateProbabilities:
            updateProbabilities(...data);
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.updateProbabilities, data: data});
            break;
        case socketDict.deleteIpDipMessages:
            deleteIpDipMessages(data);
            game.socket.emit(SOCKET_MODULE_NAME, {action: socketDict.deleteIpDipMessages, data: data});
            break;
        default:
            ui.notifications.error(`Socket action ${requestID} was not found in socketWrapper.`);
    }
}

/* The function that determines the required action when receiving a request from a socket communication. */
function message_handler(request) {
    switch(request.action) {
        case socketDict.injectContainer:
            injectContainer();
            break;
        case socketDict.cleanUp:
            cleanUp();
            break;
        case socketDict.tableResult:
            processTableResult(...request.data);
            break;
        case socketDict.newMarker:
            newMarker(...request.data);
            break;
        case socketDict.removeContainerHandlers:
            removeContainerHandlers();
            break;
        case socketDict.updateProbabilities:
            updateProbabilities(...request.data);
            break;
        case socketDict.deleteIpDipMessages:
            deleteIpDipMessages(request.data);
            break;
        default:
            ui.notifications.error(`Function ${request.action} was not found in message_handler.`);
    }
}

/**
 * Removes PIXI Container from canvas.stage
 * Deletes individual markers and their PIXI instances
 * Resets individual variables used to track marker info
 * Resets to Token Layer
 */
function cleanUp() {

    canvas.stage.removeChild(container);
    const childrenArr = container.removeChildren();
    for (const child of childrenArr) {
        child.destroy({children: true});
    }
    markerArr = [];
    markerCounter = 1;
    if ( wheelHookId !== null) Hooks.off('canvasPan', wheelHookId);
    wheelHookId = null;
    stageScale = null;
    isSpawned = false;
    canvas.tokens.activate();
}

/** ********************************************************************************************** */
/** Extend Dialog class to be able to perform extra operations on header button close (or ESC key) */
/** ********************************************************************************************** */

class IpDipDialog extends Dialog {
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

/** Create a unique drawing layer for IpDip to be able to drop markers without triggering mouse events on other layers */
class IpDipDrawingsLayer extends DrawingsLayer {
    
    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, {
            name: "IpDipMarkers",
            zIndex: 110
        });
    }

    /** override */
    _activate() {};

    /** override */
    _deactivate() {};

    // OVERRIDE the _onLeftClick so it drops a marker when IpDip is active
    _onClickLeft(event) {
        if (isSpawned) {
            socketWrapper(socketDict.newMarker, [markerCounter, canvas.mousePosition.x, canvas.mousePosition.y]);
            stageScale = canvas.stage.scale.x;
            
            // Scroll Wheel functionality for markers.
            if ( wheelHookId === null ) {
                wheelHookId = Hooks.on('canvasPan', (canvas, data) => {

                    const multiplier = data.scale < stageScale ? -1 : 1

                    const loc = canvas.mousePosition;

                    let targetMarker = undefined;
                    for (const marker of markerArr) {
                        if (    loc.x > (marker.container.x - marker.container.width / 2) &&
                                loc.x < (marker.container.x + marker.container.width / 2) &&
                                loc.y > (marker.container.y - marker.container.height / 2) &&
                                loc.y < (marker.container.y + marker.container.height / 2)        
                        ) {
                            targetMarker = marker;
                            socketWrapper(socketDict.updateProbabilities, [marker.id, multiplier]);
                            canvas.stage.scale.set(stageScale, stageScale);
                            canvas.updateBlur(stageScale);
                            return;
                        }
                    }

                    if ( targetMarker === undefined ) {
                        stageScale = data.scale;
                        return;
                    }
                });
            }
            return;
        }
        //super._onClickLeft(event);
    }
}

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

    // Spawn the dialog then wait for user to submit, cancel or close before continuing.
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

    // If the user canceled or closed the dialog without submitting, or clicked submit without placing a marker...
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

/** ********************************************** */
/** All the required functions for functions above */
/** ********************************************** */

/* Implement a delay in code execution */
async function wait(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

/* Recalculates the probabilites when markers are added to the canvas or a marker's weight is increased/decreased */
function recalculateProbabilities() {
    const sum = markerArr.reduce((pv, cv) => pv + cv.weight, 0);
    for (const marker of markerArr) {
        marker.container.prob.text = Math.round(marker.weight / sum * 100).toString() + "%";
    }
}

/* Adds the container to the game canvas and creates an eventListener which fires when children are added */
function injectContainer() {
    canvas.stage.addChild(container);
    container.eventMode = 'static';
    container.on('childAdded', () => {
        recalculateProbabilities();
    })
}

/* Removes all the markers except the one that was rolled by the Rollable Table */
function keepResultOnly(id) {
    for (const marker of markerArr) {
        if ( marker.id === id) continue;
        container.removeChild(marker.container);
        marker.container.destroy({children: true});
    }
    markerArr = markerArr.filter(m => m.id === id);
}

/* Debounce that implements how fast the remaining marker fades from the game canvas. */
const debounceFadeAndCleanUp = foundry.utils.debounce( () => {
    fadeAndCleanUp();
}, 100);

/* Initial function that begins the remaining marker fade, or cleans up after marker is no longer visible */
function fadeAndCleanUp() {
    
    if ( container.alpha < 0.05 ) {
        cleanUp();
        container.alpha = 1;
        return;
    }

    container.alpha -= .05;
    debounceFadeAndCleanUp();
}

/**
 * The following function was written and provided by Foundry VTT Discord community member dev7355608
 * https://discord.com/channels/170995199584108546/811676497965613117/1004380429257801768
 * 
 * This function will crop a portion of the game canvas (or any PIXI.Container) and return a texture
 * 
 * @param {object}      options     An object which defines the data to define where to capture a portion of the game canvas.
 * @param {object}      [options.container=canvas.stage]    What part of the canvas children to crop an image from
 * @param {number}      [options.x=null]                    The X pixel coordinate relative to the container origin
 * @param {number}      [options.y=null]                    The Y pixel coordinate relative to the container origin
 * @param {number}      [options.scale=null]                The scale to tranform the container before capturing a cropped image
 * @param {width}       [options.width=null]                The width in pixels for the size of the cropped portion of the image
 * @param {height}      [options.height=null]               The height in pixels for the size of the cropped portion of the image
 * @param {resolution}  [options.resolution=null]           The RenderTexture resolution to use for the image texture
 * @returns {object}    The RenderTexture with the image data.
 */
function captureCanvas({ container = canvas.stage, x = null, y = null, scale = null, width = null, height = null, resolution = null } = {}) {
    if (!canvas.ready) {
        return;
    }

    const renderer = canvas.app.renderer;
    const viewPosition = { ...canvas.scene._viewPosition };

    renderer.resize(
        width ?? renderer.screen.width,
        height ?? renderer.screen.height
    );

    width = canvas.screenDimensions[0] = renderer.screen.width;
    height = canvas.screenDimensions[1] = renderer.screen.height;

    canvas.stage.position.set(width / 2, height / 2);
    canvas.pan({
        x: x ?? viewPosition.x,
        y: y ?? viewPosition.y,
        scale: scale ?? viewPosition.scale
    });

    const renderTexture = PIXI.RenderTexture.create({
        width,
        height,
        resolution: resolution ?? renderer.resolution
    });

    const cacheParent = canvas.stage.enableTempParent();

    canvas.stage.updateTransform();
    canvas.stage.disableTempParent(cacheParent);

    if (container !== canvas.stage) {
        renderer.render(canvas.hidden, { renderTexture, skipUpdateTransform: true, clear: false });
    }

    renderer.render(container, { renderTexture, skipUpdateTransform: true });

    canvas._onResize();
    canvas.pan(viewPosition);

    return renderTexture;
}

/* This function crops a 3grid x 3grid square around the winning marker,
   puts a crosshair graphic over the center and returns an image */
async function selectionInCrosshairsPic() {

    const d = canvas.dimensions;
    const marker = markerArr[0].container;

    const crosshairSprite = new PIXI.Sprite(await loadTexture(CROSSHAIR_SRC));
    crosshairSprite.anchor.set(0.5);
    crosshairSprite.angle = 45;
    crosshairSprite.alpha = .75;
    crosshairSprite.x = marker.x;
    crosshairSprite.y = marker.y;

    marker.alpha = 0;
    container.addChild(crosshairSprite);
    const texture = captureCanvas({x: marker.x, y: marker.y, scale: 1, width: 3 * d.size, height: 3 * d.size});
    marker.alpha = 1;
    crosshairSprite.alpha = 0;

    const image = await canvas.app.renderer.extract.base64(texture, "image/webp");

    PIXI.Assets.unload(CROSSHAIR_SRC);

    return image
}

/* The logic to follow once a marker has been chosen.
    1) Get rid of the other markers,
    2) Create an image/texture for the chat message,
    3) Generate a local (not saved to database) chat message,
    4) Pause code execution so the user has time to see the remaining marker, then
    5) Cause the marker to fade until it is gone, then clean up and reset the tracking variables */
async function processTableResult(tableResult, newId) {
    keepResultOnly(tableResult);
    const tex = await selectionInCrosshairsPic();
    await newLocalChatMessage(tex, newId);
    await wait(2000);
    fadeAndCleanUp();
}

/* Remove the eventListener for the marker container, so it doesn't fire off recalculateProbabilities when markers are removed */
function removeContainerHandlers() {
    container.off('childAdded');
}

/* Generate the data for a local only (not in database) chat message for the ChatLog, that includes an image of the winning marker */
async function newLocalChatMessage(texture, id) {

    const content = game.settings.get(MODULE_ID, "Message") + `
        <div id="ipdip-img" data-ipdip="${id}" style="width:100%"><img src="${texture}" object-fit="contain" /></div>
    `;
    const chatData = {
        speaker: {alias: game.settings.get(MODULE_ID, "Speaker")},
        content: content
    };
    const message = new ChatMessage(chatData)
    await ui.chat.postOne(message);
}

/* Create a new marker and place it on the game canvas at the mouse pointer */
async function newMarker(id, x, y) {

    const marker = new PIXI.Container;
    // Load up the marker texture
    marker.sprite = new PIXI.Sprite(await loadTexture(MARKER_SRC));
    marker.sprite.anchor.set(0.5);

    const count = new PIXI.BitmapText(id, {fontName: "IpDipFont"});
    count.anchor.set(0.5, 0.75);

    marker.prob = new PIXI.BitmapText("%", {fontName: "IpDipFontSmall"});
    marker.prob.anchor.set(0.5, -0.7);

    const d = canvas.dimensions;
    const scale = d.size / marker.sprite.texture.orig.width;

    marker.addChild(marker.sprite);
    marker.addChild(count);
    marker.addChild(marker.prob);

    marker.x = x;
    marker.y = y;
    marker.scale.set(scale, scale);

    markerArr.push({id: markerCounter.toString(), weight: 1, container: marker});

    container.addChild(marker);

    markerCounter += 1;
}

/* When the mouse pointer is hovering over a marker and the mouse wheel is scrolled up or down,
   update the weight for that marker and recalculate probabilities for all markers */
function updateProbabilities(id, multiplier) {
    const marker = markerArr.filter(m => m.id === id).pop();
    // increases or reduces marker weight, but not below 1.
    marker.weight = marker.weight + 1 * multiplier ? marker.weight += 1 * multiplier : 1;
    recalculateProbabilities();
}


/* Creates a Rollable Table.  Rolls on the table.  Deletes the table and returns the result */
async function rollTable(markerArr) {
    let count = 0;
    const sum = markerArr.reduce((pv, cv) => pv + cv.weight, 0);
    const tableContent = markerArr.map((e) => {
        count += e.weight;
        return {
            range: [count - e.weight + 1, count],
            text: e.id,
            type: CONST.TABLE_RESULT_TYPES.TEXT,
        }
    });
    const [table] =  await RollTable.createDocuments([{
        name: "Ip Dip",
        formula: `1d${sum}`,
        results: tableContent
    }]);
    const result = await table.roll();
    await table.delete();
    return result.results[0].text;
}

/** *********************************************** */
/** Hooks and delete-message eventListener function */
/** *********************************************** */

function deleteIpDipMessages(id) {
    const log = ui.chat.element.find('#chat-log')[0];
    const items = log.getElementsByTagName("li");
    for (const li of items) {
        const ipdipId = li.querySelector('#ipdip-img')?.dataset.ipdip || null;
        if ( ipdipId === id ) li.parentNode.removeChild(li);
    }
}

Hooks.once('init', function() {
    // Create default keybinding to launch the spawnDialog function.
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

Hooks.once("canvasInit", function() {
    // Create a layer for the markers on all clients.
    let config = {
        group: "interface",
        layerClass: IpDipDrawingsLayer
    };
    let name = "ipdip_layer";
    const layer = CONFIG.Canvas.layers[name] = config;
    Object.defineProperty(this, name, {value: layer, writable: false});
    if ( !(name in canvas) ) Object.defineProperty(canvas, name, {value: new config.layerClass(), writable: false});
});

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

/** Form application that will be invoked by the settings menu to select a default folder to save images
*/
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

// World settings to allow the end user to customize the chat card Speaker and the chat card message
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