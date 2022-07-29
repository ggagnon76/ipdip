import { spawnDialog } from "./lib/lib.js";

const ModuleId = "ipdip";

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
});
