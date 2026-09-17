import { container, wheelHookId, update_wheelHookID, update_markerCounter, selectionInCrosshairsPic, update_stageScale } from "./canvas_and_layers.js";
import { markerArr, update_markerArr, update_isSpawned } from "./ipdip.js";
import { MODULE_ID } from "./socket.js";

/** Functions that define the sequence of operations when a GM uses this module.
 *  They are listed below in roughly reverse order, based on how the module operates 'normally', IE: no esc or cancel
 *  The launch point for this module is spawnDialog(), which is found in ipdip.js
 */

/**
 * The final step in the process.
 * Removes PIXI Container from canvas.stage
 * Deletes individual markers and their PIXI instances
 * Resets individual variables used to track marker info
 * Resets to Token Layer
 */
export function cleanUp() {

    canvas.stage.removeChild(container);
    const childrenArr = container.removeChildren();
    for (const child of childrenArr) {
        child.destroy({children: true});
    }
    update_markerArr([]);
    update_markerCounter(1);
    if ( wheelHookId !== null) Hooks.off('canvasPan', wheelHookId);
    update_wheelHookID(null);
    update_stageScale(null);
    update_isSpawned(false);
    canvas.tokens.activate();
}

/** 
 * Debounce is a Foundy implemented utility that allows a function to be fired after a set amount of time (0.1sec), AND
 * Debounce also prevents more than one function to be queued while it waits for the timer of the original function call to elapse
 */
const debounceFadeAndCleanUp = foundry.utils.debounce( () => {
    fadeAndCleanUp();
}, 100);

/** 
 * Step 5) in processTableResults() begins the process of making the final marker fade from view
 * Every call of this function reduces the alpha by .05.
 * When the alpha is below .05, the cleanUp() function is called to end the process.
 */
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
 * Step 4) in processTableResults() waits a set amount (2 seconds) before proceeding to remove the remaining marker.
 * This is a way for the GM and players to see the randomly selected choice on the canvas.
 */
async function wait(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

/**
 * Step 3) in processTableResults() embeds the captured texture in a chat message.
 * The chat message is not saved in the database.  Bad practice to save images there.  It's local only (means it goes away when webpage gets refeshed)
 */
async function newLocalChatMessage(texture, id) {

    const content = game.settings.get(MODULE_ID, "Message")  + 
        `<div id="ipdip-img" data-ipdip="${id}" style="width:100%"><img src="${texture}" object-fit="contain" /></div>`;
    const chatData = {
        speaker: {
            alias: game.settings.get(MODULE_ID, "Speaker")
        },
        content: content,
        style: 1
    };
    const message = new ChatMessage(chatData)
    await ui.chat.postOne(message, {notify: true});
}

/**
 * Step 2) in processTableResults() captures the canvas in a 3x3 grid around the winning marker
 * It replaces the marker with a crosshair image highlighting the "thing" the marker was placed over
 */

/**
 * Removes all the markers except the one that was rolled by the Rollable Table
 * Step 1) in processTableResults()
 */
function keepResultOnly(id) {
    for (const marker of markerArr) {
        if ( marker.id === id) continue;
        container.removeChild(marker.container);
        marker.container.destroy({children: true});
    }
    update_markerArr(markerArr.filter(m => m.id === id));
}

/** 
 * The spawnDialog() function will end by calling the processTableResult function.
 * The logic to follow once a marker has been chosen.
 * 1) Get rid of the other markers,
 * 2) Create an image/texture for the chat message,
 * 3) Generate a local (not saved to database) chat message,
 * 4) Delay code execution so the user has time to see the remaining marker
 * 5) Cause the marker to fade until it is gone
 */
export async function processTableResult(tableResult, newId) {
        keepResultOnly(tableResult);
        const tex = await selectionInCrosshairsPic();
        await newLocalChatMessage(tex, newId);
        await wait(2000);
        fadeAndCleanUp();
    }

/** 
 * The second thing that happens is a marker is randomly chosen by creating a Foundry Rollable Table.
 * The module rolls on the table.
 * Then it deletes the table and returns the randomly chosen marker
 */
export async function rollTable(markerArr) {
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
    return result.results[0].description;
}

/** 
 * The first thing that happens is the eventController to adjust probabilities is disabled to keep the marker unchanged when losing markers get removed.
 */
export function removeContainerHandlers() {
    container.off('childAdded');  // Is this jquery?
}

/** 
 * After placing markers, the GM may proceed to have the IpDip module make a random choice by clicking on IpDip in the spawnDialog box.
 */

/** 
 * When a 2nd or more markers are dropped on the canvas, a GM may ajust the weight for the probabilities by scrolling the mouse wheel while hovering over the marker.
 */
export function updateProbabilities(id, multiplier) {
    const marker = markerArr.filter(m => m.id === id).pop();
    // increases or reduces marker weight, but not below 1.
    marker.weight = marker.weight + 1 * multiplier ? marker.weight += 1 * multiplier : 1;
    recalculateProbabilities();
}

/** 
 * When a 2nd or more markers are dropped on the canvas, the probability is adjusted automatically.
 *  The GM may also ajust the weight for the probabilities for each marker, which also triggers this function
 */
export function recalculateProbabilities() {
    const sum = markerArr.reduce((pv, cv) => pv + cv.weight, 0);
    for (const marker of markerArr) {
        marker.container.prob.text = Math.round(marker.weight / sum * 100).toString() + "%";
    }
}

/** 
 * spawnDialog() switches to the ipdip_layer, where right mouse clicks drop markers.
 *  The newMarker() function is in canvas_and_layers.js
 */


/** 
 * Adds the container to the game canvas and creates an eventListener which fires when markers are added.
 * This is the first function called by SpawnDialog()
 */
export function injectContainer() {
    canvas.stage.addChild(container);
    container.eventMode = 'static';
    container.on('childAdded', () => {  // Is this jquery?
        recalculateProbabilities();
    })
}