"use strict";

let cfg;

window.catchEvent = {};
const app = {};
const platform = navigator.userAgent.includes('Firefox') ? "firefox" : "chrome";

function buildNodes(element, nodes) {
    if (!element || !Array.isArray(nodes)) {
        return;
    }

    if (!nodes.length) {
        return element;
    }

    const doc = element.ownerDocument;
    const fragment = doc.createDocumentFragment();

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node) continue;

        if (typeof node !== "string") {
            const element = doc.createElement(node.tag);

            if (node.attrs) {
                for (const attr in node.attrs) {
                    if (attr === "style") {
                        element.style.cssText = node.attrs[attr];
                    } else {
                        element.setAttribute(attr, node.attrs[attr]);
                    }
                }
            }

            if (node.nodes) {
                buildNodes(element, node.nodes);
            } else if (node.text) {
                element.textContent = node.text;
            }

            fragment.appendChild(element);
        } else {
            fragment.appendChild(doc.createTextNode(node));
        }
    }

    if (fragment.childNodes.length) {
        element.appendChild(fragment);
    }

    return element;
}

// Message event listener
window.addEventListener(
    "message",
    function (event) {
        if (event.data?.vdfDpshPtdhhd) {
            event.stopImmediatePropagation();
            catchEvent?.onmessage?.(event);
        }
    },
    true
);

// Keydown event listener
window.addEventListener(
    "keydown",
    function (event) {
        catchEvent?.onkeydown?.(event);
    },
    true
);

// Port handling
const Port = {
    listen: function (callback) {
        if (this.listener) {
            chrome.runtime.onMessage?.removeListener(this.listener);
        }

        if (typeof callback === "function") {
            if (platform === "firefox") {
                this.listener = function (message, sender) {
                    if (!sender) {
                        callback(message);
                    }
                };
            } else {
                this.listener = callback;
            }
            chrome.runtime.onMessage?.addListener(this.listener);
        } else {
            this.listener = null;
        }
    },

    send: async function (message, callback) {
        if (Port.listener || callback) {
            return chrome.runtime.sendMessage(message, callback || Port.listener);
        } else {
            return chrome.runtime.sendMessage(message);
        }
    },
};

async function readCfg() {
    let resp = await Port.send({ cmd: "cfg_get", keys: ["hz", "keys", "tls", "grants", "grantUrls", "sieve", "sieveUpdateLast", "sieveRepository"] });

    if (!resp?.cfg) return;
    cfg = resp.cfg;
}

const shortcut = {
    keys1: {
        8: "BS",
        9: "Tab",
        27: "Esc",
        32: "Space",
        45: "Ins",
        46: "Del",
        96: "0",
        97: "1",
        98: "2",
        99: "3",
        100: "4",
        101: "5",
        102: "6",
        103: "7",
        104: "8",
        105: "9",
        106: "*",
        107: "+",
        109: "-",
        110: ".",
        111: "/",
        173: "-",
        186: ";",
        187: "=",
        188: ",",
        189: "-",
        190: ".",
        191: "/",
        192: "`",
        219: "[",
        220: "\\",
        221: "]",
        222: "'",
        112: "F1",
        113: "F2",
        114: "F3",
        115: "F4",
        116: "F5",
        117: "F6",
        118: "F7",
        119: "F8",
        120: "F9",
        121: "F10",
        122: "F11",
        123: "F12",
    },
    keys2: {
        13: "Enter",
        16: "shift",
        17: "ctrl",
        18: "alt",
        33: "PgUp",
        34: "PgDn",
        35: "End",
        36: "Home",
        37: "Left",
        38: "Up",
        39: "Right",
        40: "Down",
    },
    isModifier: function (e) {
        return e.which > 15 && e.which < 19;
    },
    key: function (e, simple) {
        const mod =
            (e.ctrlKey && e.keyCode !== 17 ? "ctrl+" : "") +
            (e.shiftKey && e.keyCode !== 16 ? "shift+" : "") +
            (e.altKey && e.keyCode !== 18 ? "alt+" : "");

        if (e.button !== undefined && [1, 3, 4].includes(e.button)) {
            const b = "M" + e.button;
            return [b, mod + b];
        }

        if (simple && e.which < 47 && !this.keys1[e.which]) {
            return [];
        }

        const k = this.keys1[e.which] || (!simple && this.keys2[e.which]) || String.fromCharCode(e.which).toUpperCase();
        return [k, mod + k];
    },
};
