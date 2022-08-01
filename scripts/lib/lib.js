import { SocketModuleName } from "../ipdip.js";
const textureSRC = "modules/ipdip/assets/Marker.png";
let markerCounter = 1;
// Create a container to add the markers into
const container = new PIXI.Container();
let markerArr = [];
let wheelHookId = null;
let stageScale = null;

async function wait(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

function socketWrapper(requestID, data=null) {
    switch(requestID) {
        case "injectContainer":
            injectContainer();
            game.socket.emit(SocketModuleName, {action: "injectContainer"});
            break;
        case "cleanUp":
            cleanUp();
            game.socket.emit(SocketModuleName, {action: "cleanUp"});
            break;
        case "tableResult":
            processTableResult(data);
            game.socket.emit(SocketModuleName, {action: "processTableResult", data: data});
            break;
        case "newMarker":
            newMarker(...data);
            game.socket.emit(SocketModuleName, {action: "newMarker", data: data});
            break;
        case "removeContainerHandlers":
            removeContainerHandlers();
            game.socket.emit(SocketModuleName, {action: "removeContainerHandlers"});
            break;
        case "updateProbabilities":
            updateProbabilities(...data);
            game.socket.emit(SocketModuleName, {action: "updateProbabilities", data: data});
            break;
        default:
            ui.notifications.error(`Socket action ${requestID} was not found in socketWrapper.`);
    }
}

export function message_handler(request) {
    switch(request.action) {
        case "injectContainer":
            injectContainer();
            break;
        case "cleanUp":
            cleanUp();
            break;
        case "processTableResult":
            processTableResult(request.data);
            break;
        case "newMarker":
            newMarker(...request.data);
            break;
        case "removeContainerHandlers":
            removeContainerHandlers();
            break;
        case "updateProbabilities":
            updateProbabilities(...request.data);
            break;
        default:
            ui.notifications.error(`Function ${request.action} was not found in message_handler.`);
    }
}

function cleanUp() {
    canvas.stage.removeChild(container);
    const childrenArr = container.removeChildren();
    for (const child of childrenArr) {
        child.destroy({children: true, texture: true});
    }
    markerArr = [];
    markerCounter = 1;
    if ( wheelHookId !== null) Hooks.off('canvasPan', wheelHookId);
    wheelHookId = null;
    stageScale = null;
}

class IpDipDialog extends Dialog {
    constructor(data, options={}) {
        super(data, options);
        this.modifyHeaderButtons();
    }

    modifyHeaderButtons() {
        Hooks.once('getApplicationHeaderButtons', (dialog, buttonsArr) => {
            buttonsArr[0].onclick = () => {
                socketWrapper("cleanUp");
                this.close()
            };
        })
    }

    /* OVERRIDE */
    _onKeyDown(event) {
        // Close dialog
        if ( event.key === "Escape" ) {
            socketWrapper("cleanUp");
            return super._onKeyDown(event);
        }
    }
}

function recalculateProbabilities() {
    const sum = markerArr.reduce((pv, cv) => pv + cv.weight, 0);
    for (const marker of markerArr) {
        marker.container.prob.text = Math.round(marker.weight / sum * 100).toString() + "%";
    }
}

function injectContainer() {
    canvas.stage.addChild(container);
    container.interactive = true;
    container.on('childAdded', () => {
        recalculateProbabilities();
    })
}

function keepResultOnly(id) {
    for (const marker of markerArr) {
        if ( marker.id === id) continue;
        container.removeChild(marker.container);
        marker.container.destroy({children: true});
    }
    markerArr = markerArr.filter(m => m.id === id);
}

const debounceFadeAndCleanUp = foundry.utils.debounce( () => {
    fadeAndCleanUp();
}, 100);

function fadeAndCleanUp() {
    
    if ( container.alpha < 0.05 ) {
        cleanUp();
        container.alpha = 1;
        return;
    }

    container.alpha -= .05;
    debounceFadeAndCleanUp();
}

async function processTableResult(tableResult) {
    keepResultOnly(tableResult);
    await wait(2000);
    fadeAndCleanUp();
}

function removeContainerHandlers() {
    container.off('childAdded');
}

export async function spawnDialog() {
    if ( !game.user.isGM ) return;

    // Just in case, set UI to the Token Layer
    if ( ui.controls.activeControl !== "token") {
        ui.controls.activeControl = "token";
        canvas["tokens"].activate();
    }

    // Save the callback function so we can replace it later.
    const callbackHolder = canvas.mouseInteractionManager.callbacks.clickLeft;

    // Add the container to the stage (for all clients)
    socketWrapper("injectContainer");

    // Swap the callback so a left click now does what Ip Dip wants it to do
    canvas.mouseInteractionManager.callbacks.clickLeft = _canvasLeftClick.bind(canvas);

    const result = await new Promise(resolve => {
        new IpDipDialog({
            title: game.i18n.localize("IpDip.Dialog.Title"),
            content:    `<p>${game.i18n.localize("IpDip.Dialog.Content1")}</p>
                        <p>${game.i18n.localize("IpDip.Dialog.Content2")}</p>`,
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

    // Reset the callback function for left click
    canvas.mouseInteractionManager.callbacks.clickLeft = callbackHolder;

    if ( !result || !markerArr.length ) {
        socketWrapper("cleanUp");
        return;
    };

    // Remove the eventHandler for the markers so they don't change probability value of the remaining marker
    socketWrapper("removeContainerHandlers");

    const tableResult = await rollTable(markerArr);

    socketWrapper("tableResult", tableResult);
}

async function newMarker(id, x, y) {
    const marker = new PIXI.Container;
    // Load up the marker texture
    marker.sprite = new PIXI.Sprite(await loadTexture(textureSRC));
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

    recalculateProbabilities();
    
    container.addChild(marker);

    markerCounter += 1;
}

function updateProbabilities(id, multiplier) {
    const marker = markerArr.filter(m => m.id === id).pop();
    // increases or reduces marker weight, but not below 1.
    marker.weight = marker.weight + 1 * multiplier ? marker.weight += 1 * multiplier : 1;
    recalculateProbabilities();
}

async function _canvasLeftClick(event) {

    socketWrapper("newMarker", [markerCounter, event.data.origin.x, event.data.origin.y]);

    stageScale = canvas.stage.scale.x;
    if ( wheelHookId === null ) {
        wheelHookId = Hooks.on('canvasPan', (canvas, data) => {

            let multiplier = 1;
            if ( data.scale < stageScale) multiplier = -1;

            const loc = canvas.app.renderer.plugins.interaction.mouse.getLocalPosition(canvas.app.stage);

            let targetMarker = undefined;
            for (const marker of markerArr) {
                if (    loc.x > (marker.container.x - marker.container.width / 2) &&
                        loc.x < (marker.container.x + marker.container.width / 2) &&
                        loc.y > (marker.container.y - marker.container.height / 2) &&
                        loc.y < (marker.container.y + marker.container.height / 2)        
                ) {
                    targetMarker = marker;
                    socketWrapper("updateProbabilities", [marker.id, multiplier]);
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
}

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