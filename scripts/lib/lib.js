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

function cleanup() {
    canvas.stage.removeChild(container);
    const childrenArr = container.removeChildren();
    for (const child of childrenArr) {
        child.destroy({children: true, texture: true});
    }
    markerArr = [];
    markerCounter = 1;
    if ( wheelHookId !== null ) Hooks.off('canvasPan', wheelHookId);
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
                cleanup();
                this.close()
            };
        })
    }

    /* OVERRIDE */
    _onKeyDown(event) {
        // Close dialog
        if ( event.key === "Escape" ) {
            cleanup();
            return super._onKeyDown(event);
        }
    }
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

    // Add the container to the stage
    canvas.stage.addChild(container);
    container.interactive = true;
    container.on('childAdded', () => {
        recalculateProbabilities();
    })


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
        cleanup();
        return;
    };

    const tableResult = await rollTable(markerArr);

    keepResultOnly(tableResult);
    await wait(2000);
    fadeAndCleanUp();
}

async function _canvasLeftClick(event) {

    stageScale = canvas.stage.scale.x;

    const marker = new PIXI.Container;
    // Load up the marker texture
    marker.sprite = new PIXI.Sprite(await loadTexture(textureSRC));
    marker.sprite.anchor.set(0.5);

    const count = new PIXI.BitmapText(markerCounter, {fontName: "IpDipFont"});
    count.anchor.set(0.5, 0.75);

    marker.prob = new PIXI.BitmapText("%", {fontName: "IpDipFontSmall"});
    marker.prob.anchor.set(0.5, -0.7);

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
                    targetMarker.weight = targetMarker.weight + 1 * multiplier ? targetMarker.weight += 1 * multiplier : 1;
                    recalculateProbabilities();
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
    const d = canvas.dimensions;
    const scale = d.size / marker.sprite.texture.orig.width;

    marker.addChild(marker.sprite);
    marker.addChild(count);
    marker.addChild(marker.prob);
    marker.x = event.data.origin.x
    marker.y = event.data.origin.y
    marker.scale.set(scale, scale);

    container.addChild(marker);

    markerArr.push({id: markerCounter.toString(), weight: 1, container: marker});

    recalculateProbabilities();

    markerCounter += 1;
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
        cleanup();
        container.alpha = 1;
        return;
    }

    container.alpha -= .05;
    debounceFadeAndCleanUp();
}

function recalculateProbabilities() {
    const sum = markerArr.reduce((pv, cv) => pv + cv.weight, 0);
    for (const marker of markerArr) {
        marker.container.prob.text = Math.round(marker.weight / sum * 100).toString() + "%";
    }

}

