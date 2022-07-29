let markerCounter = 1;
// Create a container to add the markers into
const container = new PIXI.Container();
let markerArr = [];

async function wait(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
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

    // Swap the callback so a left click now does what Ip Dip wants it to do
    canvas.mouseInteractionManager.callbacks.clickLeft = _canvasLeftClick.bind(canvas);

    const result = await new Promise(resolve => {
        new Dialog({
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
        canvas.stage.removeChild(container);
        const childrenArr = container.removeChildren();
        for (const child of childrenArr) {
            child.destroy({children: true, texture: true});
        }
        markerArr = [];
        markerCounter = 1;
        return;
    };

    const tableResult = await rollTable(markerArr);

    keepResultOnly(tableResult);
    await wait(2000);
    fadeAndCleanUp();
}

async function _canvasLeftClick(event) {
    // Load up the marker texture
    const textureSRC = "modules/ipdip/assets/Marker.png";
    const sprite = new PIXI.Sprite(await loadTexture(textureSRC));

    const count = new PIXI.BitmapText(markerCounter, {fontName: "IpDipFont"});
    count.anchor.set(0.5, 0.6);

    sprite.anchor.set(0.5);

    const marker = new PIXI.Container;
    const d = canvas.dimensions;
    const scale = d.size / sprite.texture.orig.width;

    marker.addChild(sprite);
    marker.addChild(count);
    marker.x = event.data.origin.x
    marker.y = event.data.origin.y
    marker.scale.set(scale, scale);

    container.addChild(marker);

    markerArr.push({id: markerCounter.toString(), weight: 1, container: marker});

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
        canvas.stage.removeChild(container);
        const childrenArr = container.removeChildren();
        for (const child of childrenArr) {
            child.destroy({children: true, texture: true});
        }
        markerArr = [];
        markerCounter = 1;
        container.alpha = 1;
        return;
    }

    container.alpha -= .05;
    debounceFadeAndCleanUp();
}
