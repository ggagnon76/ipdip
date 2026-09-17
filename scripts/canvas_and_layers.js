import { socketDict, socketWrapper } from "./socket.js";
import { isSpawned, markerArr } from "./ipdip.js";

/** CONSTANTS */
const MARKER_SRC = "modules/ipdip/assets/Marker.png";
const CROSSHAIR_SRC = "modules/ipdip/assets/Crosshairs.png";
// Create a PIXI container to add the markers into
export const container = new PIXI.Container();

/** Tracking variables */
let stageScale = null;
let markerCounter = 1;
export let wheelHookId = null;

export function update_wheelHookID(arg) {
    wheelHookId = arg;
}

export function update_markerCounter(arg) {
    markerCounter = arg;
}

export function update_stageScale(arg) {
    stageScale = arg;
}


/** Create a unique drawing layer for IpDip to be able to drop markers without triggering mouse events on other layers */
export class IpDipDrawingsLayer extends foundry.canvas.layers.DrawingsLayer {
    
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
    }
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
export function captureCanvas({ container = canvas.stage, x = null, y = null, scale = null, width = null, height = null, resolution = null } = {}) {
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
export async function selectionInCrosshairsPic() {

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

/* Create a new marker and place it on the game canvas at the mouse pointer */
export async function newMarker(id, x, y) {

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