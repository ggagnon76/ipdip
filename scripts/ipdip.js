import { spawnDialog, message_handler } from "./lib/lib.js";

const ModuleId = "ipdip";
export const SocketModuleName = "module." + ModuleId;

Hooks.once('init', function() {
    game.keybindings.register(ModuleId, "launchDialog", {
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

Hooks.once('ready', function() {
    // Create the BitmapFont for the numbers
    PIXI.BitmapFont.from("IpDipFont", {
        fill: "#EF3A1B",
        fontSize: 150,
        fontWeight: "bold"
    }, {chars: PIXI.BitmapFont.NUMERIC})

    // Create the BitmapFont for the probabilities
    PIXI.BitmapFont.from("IpDipFontSmall", {
        fill: "#FFFFFF",
        fontSize: 50,
        fontWeight: "bold"
    }, {chars: [
        ['0', '9'],
        '%'
    ]})

    game.socket.on(SocketModuleName, message_handler);
});