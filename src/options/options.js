"use strict";

var input_changes = {};
var $ = function (id) {
    return document.getElementById(id);
};

const _ = function (msg) {
    try {
        return chrome.i18n.getMessage(msg) || msg;
    } catch (err) {
        return msg;
    }
};

let insertHTML = function (element, html) {
    var allowedTags =
            /^([apbiusq]|d(iv|el)|em|h[1-6]|i(mg|ns)|s((pan|mall)|u[bp])|[bh]r|pre|code|blockquote|[ou]l|li|d[ltd]|t([rhd]|able|head|body|foot)|svg|symbol|line|path)$/i,
        allowedAttrs = /^(data-|stroke-|(class|style|xmlns|viewBox|i?d|fill|line(cap|join)|transform|[xy][12])$)/i,
        tempBody = document.implementation.createHTMLDocument("").body;
    var cleanNode = function (node) {
        var childCount = node.childElementCount;
        var children = node.children || node.childNodes;
        while (childCount--) {
            var child = children[childCount];
            if (child.nodeType !== Node.TEXT_NODE) {
                if (allowedTags.test(child.nodeName)) {
                    var attrCount = child.attributes.length;
                    while (attrCount--) {
                        var attrName = child.attributes[attrCount].name;
                        if (!allowedAttrs.test(attrName)) {
                            child.removeAttribute(attrName);
                        }
                    }
                    if (child.childElementCount) {
                        cleanNode(child);
                    }
                } else {
                    child.parentNode.removeChild(child);
                }
            }
        }
    };
    insertHTML = function (element, html) {
        if (element && typeof html === "string") {
            if (html.indexOf("<") !== -1) {
                tempBody.innerHTML = html;
                cleanNode(tempBody);
                var doc = element.ownerDocument;
                var fragment = doc.createDocumentFragment();
                while (tempBody.firstChild) {
                    var node = tempBody.firstChild;
                    node = doc.adoptNode(node);
                    fragment.appendChild(node);
                }
                element.appendChild(fragment);
            } else {
                element.insertAdjacentText("beforeend", html);
            }
        }
    };
    insertHTML(element, html);
};

var processLNG = function (nodes) {
    var els, l, args, attrs, attrnode, string;
    var i = nodes.length;
    while (i--) {
        if (nodes[i].lng_loaded) continue;
        els = nodes[i].querySelectorAll("[data-lng]");
        l = els.length;
        while (l--) {
            string = _(els[l].dataset["lng"]);
            attrs = els[l].dataset["lngattr"];
            if (attrs) {
                if (/^(title|placeholder)$/.test(attrs)) els[l][attrs] = string;
                els[l].removeAttribute("data-lngattr");
            } else insertHTML(els[l], string);
            els[l].removeAttribute("data-lng");
            if (els[l].dataset["lngargs"] === void 0) continue;
            args = els[l].dataset["lngargs"].split(" ");
            args.idx = args.length;
            while (args.idx--) {
                args[args.idx] = args[args.idx].split(":");
                args[args.idx][0] = "data-" + args[args.idx][0];
                attrnode = els[l].querySelector("[" + args[args.idx][0] + "]");
                if (!attrnode) continue;
                attrs = args[args.idx][1].split(",");
                attrs.idx = attrs.length;
                while (attrs.idx--) {
                    if (!/^(href|style|target)$/i.test(attrs[attrs.idx])) continue;
                    attrnode.setAttribute(attrs[attrs.idx], els[l].getAttribute(args[args.idx][0] + "-" + attrs[attrs.idx]));
                }
            }
            els[l].removeAttribute("data-lngargs");
        }
        nodes[i].lng_loaded = true;
    }
};

var color_trans = function (node, color, time) {
    clearTimeout(node.col_trans_timer);
    if (color === null) {
        node.style.color = "";
        delete node.col_trans_timer;
        return;
    }
    node.style.color = color;
    node.col_trans_timer = setTimeout(function () {
        color_trans(node, null);
    }, time || 2e3);
};

var ImprtHandler = function (caption, data_handler, hide_opts) {
    var x,
        importer = $("importer"),
        textArea = importer.querySelector("textarea");
    processLNG([importer]);
    if (importer.data_handler !== data_handler) {
        importer.data_handler = data_handler;
        textArea.value = "";
        importer.firstElementChild.textContent = caption + " - " + _("IMPR_IMPORT");
        x = importer.querySelectorAll(".op_buttons div > div > input[id]");
        hide_opts = hide_opts || {};
        x[0].parentNode.style.display = hide_opts.clear ? "none" : "";
        x[1].parentNode.style.display = hide_opts.overwrite ? "none" : "";
        x[0].checked = x[1].checked = false;
    }
    var imprt_file = $("imprt_file");
    if (imprt_file.onchange) {
        importer.visible(true);
        return;
    }
    x[0].nextInput = x[1];
    x[0].onchange = function () {
        this.nextInput.disabled = this.checked;
        if (this.checked) this.nextInput.checked = false;
        this.nextInput.parentNode.lastElementChild.style.color = this.checked ? "silver" : "";
    };
    importer.visible = function (show) {
        importer.style.display = show === true ? "block" : "none";
        if (show) {
            textArea.focus();
        }
    };
    importer.querySelector("b").onclick = importer.visible;
    importer.ondata = function (data, button) {
        var options = this.querySelectorAll('input[type="checkbox"]');
        options = { clear: options[0].checked, overwrite: options[1].checked };
        if (importer.data_handler(data, options) === false) color_trans(button, "red");
        else {
            importer.visible(false);
            $("save_button").classList.add("alert");
        }
    };
    importer.readfile = function (file) {
        if (file.size > 5242880) color_trans(imprt_file.parentNode, "red");
        else {
            var reader = new FileReader();
            reader.onerror = function () {
                color_trans(imprt_file.parentNode, "red");
            };
            reader.onload = function (e) {
                try {
                    e = JSON.parse(e.target.result);
                } catch (ex) {
                    alert(_("INVALIDFORMAT"));
                    return;
                }
                importer.ondata(e, imprt_file.parentNode);
            };
            reader.readAsText(file);
        }
    };
    imprt_file.onchange = function () {
        importer.readfile(this.files[0]);
    };
    imprt_file.ondragover = function (e) {
        e.preventDefault();
    };
    imprt_file.ondragenter = function (e) {
        e.preventDefault();
        if ([].slice.call(e.dataTransfer.types, 0).indexOf("Files") > -1) this.parentNode.style.boxShadow = "0 2px 4px green";
    };
    imprt_file.ondragleave = function () {
        this.parentNode.style.boxShadow = "";
    };
    imprt_file.ondrop = function (e) {
        this.parentNode.style.boxShadow = "";
        if (e.dataTransfer.files.length) importer.readfile(e.dataTransfer.files[0]);
        e.preventDefault();
    };
    $("imprt_clear").onclick = function () {
        textArea.value = "";
        textArea.focus();
    };
    $("imprt_text").onclick = async function () {
        var btn = this;
        var val = textArea.value.trim();
        if (!val) {
            textArea.focus();
            return;
        }
        try {
            if (/^https?:\/\/.+/i.test(val)) {
                textArea.disabled = true;
                val = val.replace(/(https:\/\/pastebin\.com\/)([a-zA-Z0-9]+)$/i, "$1raw/$2");
                let resp = await fetch(val);
                if (!resp.ok) {
                    throw new Error(`HTTP error! ${resp.status} ${resp.statusText}`);
                }
                textArea.value = await resp.text();
                textArea.disabled = false;
                textArea.setSelectionRange(0, 0);
                textArea.focus();
                return;
            } else {
                val = JSON.parse(val);
            }
        } catch (ex) {
            alert(ex.message || _("INVALIDFORMAT"));
            color_trans(btn, "red");
            textArea.disabled = false;
            return;
        }
        importer.ondata(val, btn);
    };
    document.addEventListener("mousedown", function (e) {
        if (!e.target.closest("#importer, [data-action]")) importer.visible(false);
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            importer.visible(false);
        }
    });
    textArea.onkeydown = function (e) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            $("imprt_text").click();
        } else if (e.code === "KeyR" && e.altKey) {
            e.preventDefault();
            $("impr_chk_overwrite").checked = !$("impr_chk_overwrite").checked;
        } else if (e.code === "KeyC" && e.altKey) {
            e.preventDefault();
            $("impr_chk_clear").checked = !$("impr_chk_clear").checked;
        }
    };
    importer.visible(true);
};

var fill_output = function (e) {
    e = e.target || e;
    var op = e.previousElementSibling;
    op.textContent = op.dataset["as_percent"] ? parseInt(e.value * 100, 10) : e.value;
};

var color_text_input = function (e) {
    e = e.type === "input" ? this : e;
    var v = /^#([\da-f]{3}){1,2}$/i.test(e.value) ? e.value : "#ffffff";
    e.previousElementSibling.value = v.length === 4 ? "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3] : v;
};

var color_change = function () {
    this.nextElementSibling.value = this.value;
};

var setDefault = function (query) {
    if (!query) return;
    [].forEach.call(typeof query === "string" ? document.querySelectorAll(query) : [query], function (el) {
        if (el.type === "checkbox") el.checked = el.defaultChecked;
        else if (/^SELECT/i.test(el.type))
            for (var i = el.length; i--; ) {
                if (el[i].hasAttribute("selected")) {
                    el.selectedIndex = i;
                    break;
                }
            }
        else {
            el.value = el.defaultValue;
            if (el.type === "range") fill_output(el);
        }
    });
};

var load = function () {
    var fields = document.querySelectorAll("input[name*=_], select[name*=_], textarea[name*=_]"),
        i = fields.length,
        m,
        fld,
        fld_type,
        pref,
        prefs = {};
    while (i--) {
        fld = fields[i];
        if (fld.disabled || fld.readOnly) continue;
        pref = fld.name.split("_");
        if (!prefs[pref[0]])
            try {
                prefs[pref[0]] = JSON.parse(cfg[pref[0]] || "{}");
            } catch (ex) {
                prefs[pref[0]] = cfg[pref[0]];
            }
        if (pref[0] === "tls" && pref[1] === "sendToHosts") {
            if (Array.isArray(prefs.tls[pref[1]])) {
                const shosts = [];
                for (const tls of prefs.tls[pref[1]]) {
                    shosts.push(tls.join("|"));
                }
                fld.rows = shosts.length || 1;
                fld.value = fld.defValue = shosts.join("\n");
            }

        } else if (pref[0] === "grants" || pref[0] === "grantUrls") {
            const shosts = (prefs[pref[0]] || []).map(grant => {
                return grant.op === ";" ?
                    ";" + grant.txt :
                    grant.op + (grant.rules || grant.opts || "") + ":" + grant.url;
            });
            fld.value = fld.defValue = shosts.join("\n");

        } else if (pref[0] === "keys") {
            m = pref[1].replace("-", "_");
            if (prefs.keys[m] !== void 0) fld.value = fld.defValue = prefs.keys[m];
        } else if (pref[0] === "hz" && pref[1] === "hiResScope") {
            fld.checked = fld.defChecked = fld.value === prefs.hz.hiResScope;
        } else if (prefs[pref[0]] && prefs[pref[0]][pref[1]] !== void 0) {
            fld_type = fld.getAttribute("type") || "text";
            if (fld.type !== fld_type) fld_type = fld.type;
            if (fld_type === "checkbox") fld.checked = fld.defChecked = !!prefs[pref[0]][pref[1]];
            else {
                fld.value = fld.defValue = prefs[pref[0]][pref[1]];
                if (fld_type === "range") {
                    m = fld.previousElementSibling;
                    if (m && m.nodeName === "OUTPUT") fill_output(fld);
                    m = m.previousElementSibling;
                    if (m && m.getAttribute("type") === "color") m.style.opacity = fld.value;
                    fld.addEventListener("change", fill_output, false);
                } else if (fld_type === "text" && fld.previousElementSibling && fld.previousElementSibling.getAttribute("type") === "color") {
                    fld.addEventListener("input", color_text_input, false);
                    color_text_input(fld);
                    fld.previousElementSibling.addEventListener("change", color_change, false);
                }
            }
        }
    }

    const fzExtra = [cfg.keys.mOrig, cfg.keys.mFit, cfg.keys.mFitBoth, cfg.keys.mFitW, cfg.keys.mFitH, cfg.keys.mZoomLock].filter(Boolean).map(k => `<b>${k}</b>`).join(", ");
    document.querySelector("label[for='keys_hz-fullZm'] .extra").innerHTML = fzExtra ? ", " + fzExtra : "";
};

var save = async function () {
    var i, m, fld, fldType, host, shidx, shosts, pref;
    var fields = document.querySelectorAll("input[name*=_], select[name*=_], textarea[name*=_]");
    var prefs = {};
    var rgxNewLine = /[\r\n]+/;
    var rgxGrant = /^(?:(;.+)|([!~]{1,2}):(.+))/;
    if (SieveUI.loaded) prefs.sieve = JSON.stringify(SieveUI.prepareRules());
    for (i = 0; i < fields.length; ++i) {
        fld = fields[i];
        if (fld.readOnly) continue;
        pref = fld.name.split("_");
        if (!prefs[pref[0]]) prefs[pref[0]] = {};
        if (pref[0] === "tls" && pref[1] === "sendToHosts") {
            shosts = fld.value.trim().split(rgxNewLine);
            prefs.tls[pref[1]] = [];
            for (shidx = 0; shidx < shosts.length; ++shidx) {
                host = shosts[shidx].split("|");
                if (host.length === 2) prefs.tls[pref[1]].push(host);
            }
        } else if (pref[0] === "grants" || pref[0] === "grantUrls") {
            let parsed = prefs[pref[0]] = [];
            if (fld.value === "") continue;
            var grant;
            var grnts = fld.value.trim().split(rgxNewLine);
            if (!grnts.length) continue;
            for (shidx = 0; shidx < grnts.length; ++shidx) {
                if ((grant = rgxGrant.exec(grnts[shidx].trim()))) {
                    if (grant[1]) {
                        grant[1] = grant[1].trim();
                        host = { op: ";", txt: grant[1].substr(1) };
                    } else host = { op: grant[2], url: grant[3].trim() };
                    parsed.push(host);
                }
            }
            fld.value = parsed
                .map(function (el) {
                    return el.op === ";" ?
                        ";" + el.txt :
                        el.op + (el.rules || el.opts || "") + ":" + el.url;
                })
                .join("\n");
        } else if (pref[0] === "keys") {
            m = pref[1].replace("-", "_");
            prefs.keys[m] = fld.value;
        } else if (pref[0] === "hz" && pref[1] === "hiResScope") {
            if (fld.checked) prefs.hz.hiResScope = fld.value;
        } else if (prefs[pref[0]]) {
            fldType = fld.getAttribute("type");
            if (fldType === "checkbox") prefs[pref[0]][pref[1]] = fld.checked;
            else if (fldType === "range" || fldType === "number" || fld.classList.contains("number")) {
                prefs[pref[0]][pref[1]] = fld.min ? Math.max(fld.min, Math.min(fld.max, parseFloat(fld.value))) : parseFloat(fld.value);
                if (typeof prefs[pref[0]][pref[1]] !== "number") prefs[pref[0]][pref[1]] = parseFloat(fld.defaultValue);
                fld.value = prefs[pref[0]][pref[1]];
            } else prefs[pref[0]][pref[1]] = fld.value;
        }
    }
    // to avoid conflicts with EXTENSION
    prefs.keys.hz_open = "";

    await Port.send({ cmd: "savePrefs", prefs: prefs });
    await readCfg();
    applyCustomCssOptions();
    updateSavedValues();
};

var download = function (data, filename, exportAsText) {
    var a = document.createElement("a");
    if (exportAsText || a.download === void 0 || !URL.createObjectURL) {
        Port.send({ cmd: "open", url: "data:text/plain;charset=utf-8," + encodeURIComponent(data) });
        return;
    }
    var blobUrl = URL.createObjectURL(new Blob([data], { type: "text/plain" }));
    a.href = blobUrl;
    a.download = (filename || "").replace(/\s/g, "_");
    a.dispatchEvent(new MouseEvent("click"));
    setTimeout(function () {
        URL.revokeObjectURL(blobUrl);
    }, 1000);
};

var prefs = function (data, options, ev) {
    var i,
        pref_keys = ["hz", "keys", "tls", "grants", "grantUrls"];
    if (typeof data === "object") {
        if (JSON.stringify(data) === "{}") return false;
        if ((options || {}).clear) Port.send({ cmd: "cfg_del", keys: Object.keys(data) });
        Port.send({ cmd: "savePrefs", prefs: data });
        location.reload(true);
        return;
    }
    data = {};
    for (i = 0; i < 5; ++i) if (pref_keys[i] in cfg) data[pref_keys[i]] = cfg[pref_keys[i]];
    download(JSON.stringify(data, null, 2), app.name + "-conf.json", ev.ctrlKey);
};

function onValueChange (e) {
    if (e.stopPropagation) e.stopPropagation();
    var t = e.target;
    if (t.id === 'sieve_search') return;

    if (t.type === "radio") {
        const group = document.querySelectorAll('input[name="' + t.name + '"]');
        let changed = false;
        for (const r of group) {
            if (r.defChecked !== undefined && r.defChecked !== r.checked) changed = true;
            delete input_changes[r.id];
        }
        if (changed) input_changes[t.name] = true;
        else delete input_changes[t.name];
        $("save_button").classList.toggle("alert", !!Object.keys(input_changes).length);
        updateHiResUi();
        return;
    }

    const id = t.id || t.name || t.dataset.id;
    if (!id) return;

    let value;
    if (t.classList.contains('ace_text-input')) {
        value = t.parentElement?.env?.editor?.getValue();
    } else if (t.type !== 'checkbox') {
        value = typeof t.value === "string" ? t.value.trim() : t.value;
    }

    if (value !== undefined && t.defValue !== undefined && t.defValue != value ||
        t.defChecked !== undefined && t.defChecked !== t.checked
    ) {
        input_changes[id] = true;
    } else {
        delete input_changes[id];
    }
    $("save_button").classList.toggle("alert", !!Object.keys(input_changes).length);
    if (t.name === "hz_hiResRemember" || t.name === "keys_hiResToggle") updateHiResUi();
}

function applyCustomCssOptions() {
    var styleEl = document.getElementById("customCssOptions_style");
    if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "customCssOptions_style";
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = cfg?.hz?.customCssOptions || "";
}

function updateHiResUi() {
    const remember = $("hz_hiResRemember");
    const scope = document.querySelectorAll('input[name="hz_hiResScope"]');
    const remembered = remember && remember.checked;
    let hotkeysMode = false;
    let scopeVal = null;
    for (const r of scope) {
        r.disabled = !remembered;
        if (r.checked) scopeVal = r.value;
        if (remembered && r.checked && r.value === "hotkeys") hotkeysMode = true;
    }
    const scopeRow = document.querySelector(".scope_opts")?.closest(".prow");
    if (scopeRow) scopeRow.classList.toggle("hires_off", !remembered);
    const main = document.querySelector('input[name="keys_hiResToggle"]');
    if (main) {
        main.disabled = hotkeysMode;
        const mainLi = main.closest("li");
        mainLi.classList.toggle("hires_off", hotkeysMode);
        const stateKey = !remembered ? "SC_HIRES_STATE_OFF" : hotkeysMode ? "SC_HIRES_STATE_DISABLED" : "SC_HIRES_STATE_" + scopeVal.toUpperCase();
        mainLi.querySelector(".hires_state").textContent = " (currently: " + (chrome.i18n.getMessage(stateKey) || stateKey) + ")";
        const aliasShown = remembered && !hotkeysMode && scopeVal !== "page";
        mainLi.querySelector(".hires_alias").hidden = !aliasShown;
        mainLi.querySelector(".hires_alias_scope").textContent = chrome.i18n.getMessage("SC_HIRES_STATE_PAGE") || "per page";
        mainLi.querySelector(".hires_alias input").value = main.value;
    }
    for (const key of ["hiResToggleImage", "hiResToggleGallery", "hiResTogglePage"]) {
        const fld = document.querySelector('input[name="keys_' + key + '"]');
        if (fld) {
            fld.disabled = !hotkeysMode;
            fld.closest("li").classList.toggle("hires_off", !hotkeysMode);
        }
    }
}

function updateSavedValues() {
    input_changes = {};
    const elements = document.querySelectorAll("input, textarea, select");
    for (const el of elements) {
        if(el.matches('input[type="checkbox"], input[type="radio"]')) {
            el.defChecked = !!el.checked;
        } else {
            let value;
            if (el.matches('textarea.ace_text-input')) {
                value = el.parentElement?.env?.editor?.getValue();
            } else {
                value = el.value;
            }
            el.defValue = value;
        }
    }
}

window.onhashchange = function () {
    var section,
        args = [],
        menu = $("nav_menu"),
        old = (menu && menu.active && menu.active.hash.slice(1)) || "settings",
        hash = location.hash.slice(1) || "settings";
    if (hash.indexOf("/") > -1) {
        args = hash.split("/");
        hash = args.shift();
    }
    section = $(hash + "_sec") || $("settings_sec");
    if (!section.lng_loaded)
        if (hash === "sieve") {
            Port.listen(function (d) {
                Port.listen(null);
                d = d.data || d;
                cfg.sieve = d.cfg.sieve;
                SieveUI.load();
                $("sieve_search").focus();
            });
            Port.send({ cmd: "cfg_get", keys: ["sieve"] });
        } else if (hash === "grants")
            section.querySelector(".action_buttons").onclick = function (e) {
                if (e.target.dataset.action === "show-details") {
                    $("grants_help").style.display = $("grants_help").style.display === "block" ? "none" : "block";
                }
            };
        else if (hash === "info") {
            /* section.querySelector(".action_buttons").onclick = function (e) {
                switch (e.target.dataset.action) {
                    case "prefs-import":
                        ImprtHandler(_("SC_PREFS"), prefs, { overwrite: 1 });
                        break;
                    case "prefs-export":
                        prefs(0, 0, e);
                        break;
                }
            }; */
            if (args[0]) $(args[0] === "0" ? "app_installed" : "app_updated").style.display = "block";
            // section.querySelector("h3:not([data-lng])").textContent = " v" + app.version;
            Port.listen(function (response) {
                Port.listen(null);
                var alpha2,
                    td2,
                    locales = [];
                var lng_map = function (el, idx) {
                    el.name = (el.name || el.fullname || "") + (el.fullname && el.name ? " (" + el.fullname + ")" : "") || el.email || el.web;
                    if (idx) td2.nodes.push(", ");
                    td2.nodes.push(el.email || el.web ? { tag: "a", attrs: { href: el.email ? "mailto:" + el.email : el.web }, text: el.name } : el.name);
                };
                var locales_json = JSON.parse(response);
                for (alpha2 in locales_json) {
                    if (alpha2 === "_") continue;
                    td2 = { tag: "td" };
                    locales.push({
                        tag: "tr",
                        nodes: [
                            {
                                tag: "td",
                                attrs: locales_json[alpha2]["%"] ? { title: locales_json[alpha2]["%"] + "%" } : null,
                                text: alpha2 + ", " + locales_json[alpha2].name,
                            },
                            td2,
                        ],
                    });
                    if (locales_json[alpha2].translators) {
                        td2.nodes = [];
                        locales_json[alpha2].translators.forEach(lng_map);
                    } else td2.text = "anonymous";
                }
                buildNodes($("locales_table"), locales);
            });
            Port.send({ cmd: "getLocaleList" });
        }
    if (old !== hash && (old = $(old + "_sec"))) old.style.display = "none";
    if (section) {
        processLNG([section]);
        section.style.display = "";
    }
    if (menu.active) menu.active.classList.remove("active");
    if ((menu.active = menu.querySelector('a[href="#' + hash + '"]'))) menu.active.classList.add("active");
};

window.addEventListener(
    "load",
    async function () {
        let manifest = chrome.runtime.getManifest();
        app.name = manifest.name;
        app.version = manifest.version;

        document.title = `:: ${app.name} ::`;
        var tmp = $("app_version");
        tmp.textContent = app.name + " v" + app.version;

        var menu = $("nav_menu");
        processLNG(document.querySelectorAll('body > *'));
        if ((tmp = document.querySelectorAll('input[type="color"] + output + input[type="range"], textarea[name="tls_sendToHosts"]'))) {
            var range_onchange = function () {
                this.parentNode.firstElementChild.style.opacity = this.value;
            };
            [].forEach.call(tmp, function (el) {
                if (el.nodeName === "TEXTAREA")
                    el.oninput = function () {
                        this.rows = Math.min((this.value.match(/(?:\n|\r\n?)/g) || []).length + 1, 10);
                    };
                else el.onchange = range_onchange;
            });
        }
        menu.onclick = function (e) {
            if (e.target.hash) {
                e.preventDefault();
                location.hash = e.target.hash;
            }
        };

        function keyHandler(e) {
            var key = shortcut.key(e, true)[0];
            if (e.repeat || !e.target.name?.startsWith("keys_") || e.ctrlKey || e.altKey || e.metaKey || !key ||
                (key[0] === "F" && key[1]) // F1-12 key
            ) {
                return;
            }
            e.stopPropagation();
            e.preventDefault();
            color_trans(e.target, null);
            var keys = document.body.querySelectorAll('input[name^="keys_"]');
            for (var i = 0; i < keys.length; ++i) {
                if (keys[i].value.toUpperCase() === key.toUpperCase() &&
                    e.target !== keys[i] && e.target.dataset.altshift === keys[i].dataset.altshift)
                {
                    color_trans(e.target, "red");
                    color_trans(keys[i], "red");
                    return false;
                }
            }
            if (e.code === 'Escape') {
                if (!e.target.value) e.target.blur();
                key = "";
            }
            e.target.value = key;
            document.forms[0].onchange(e);
        }
        document.forms[0].addEventListener("keydown", keyHandler, false);
        document.forms[0].addEventListener("mouseup", keyHandler, false);

        document.forms[0].addEventListener(
            "contextmenu",
            function (e) {
                e.stopPropagation();
                var t = e.target;
                if (t.classList.contains("checkbox")) t = t.previousElementSibling;
                if (!t.name || t.name.indexOf("_") === -1) return;
                if (e.ctrlKey) {
                    e.preventDefault();
                    setDefault(t);
                    document.forms[0].onchange({ target: t });
                } else if (e.shiftKey && t.name.indexOf("_") > -1) {
                    e.preventDefault();
                    t = t.name.split("_");
                    e = {};
                    t[2] = JSON.parse(cfg[t[0]]);
                    if (t[1]) {
                        e[t[0]] = {};
                        e[t[0]][t[1]] = t[2][t[1]];
                    } else e[t[0]] = t[2];
                    alert(JSON.stringify(e));
                }
            },
            false
        );
        document.forms[0].onchange = onValueChange;
        var reset_button = $("reset_button");
        reset_button.reset = function () {
            delete reset_button.pending;
            reset_button.style.color = "#000";
        };
        reset_button.addEventListener(
            "click",
            function (e) {
                if (reset_button.pending) {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        e = ["", "input,", "select,", "textarea"];
                        setDefault(e.join((location.hash || "#settings") + "_sec "));
                        e = "lime";
                    } else e = "green";
                    clearTimeout(reset_button.pending);
                    reset_button.pending = setTimeout(reset_button.reset, 2e3);
                    reset_button.style.color = e;
                    reset_button.nextElementSibling.style.color = "#e03c00";
                    input_changes["form_reset"] = true;
                    setTimeout(function () {
                        [].forEach.call(document.querySelectorAll('output + input[type="range"]') || [], fill_output);
                    }, 15);
                    return;
                }
                reset_button.style.color = "orange";
                reset_button.pending = setTimeout(reset_button.reset, 2e3);
                e.preventDefault();
            },
            false
        );
        $("save_button").addEventListener(
            "click",
            async function (e) {
                e.preventDefault();
                await save();
                color_trans(this, "green");
                e.target.classList.remove("alert");
                Port.send({ cmd: "deinit_tabs" });
            },
            false
        );
        var menu_button = $("menu_button");
        var menu_dropdown = $("menu_dropdown");
        menu_button.addEventListener("click", function (e) {
            e.stopPropagation();
            menu_dropdown.classList.toggle("open");
        });
        document.addEventListener("click", function (e) {
            if (!e.target.closest("#menu_wrap")) {
                menu_dropdown.classList.remove("open");
            }
        });
        menu_dropdown.addEventListener("click", async function (e) {
            var btn = e.target.closest("button[data-action]");
            if (!btn) return;
            var action = btn.dataset.action;
            menu_dropdown.classList.remove("open");
            switch (action) {
                case "prefs-import":
                    ImprtHandler(_("SC_PREFS"), prefs, { overwrite: 1 });
                    break;
                case "prefs-export":
                    prefs(0, 0, e);
                    break;
                case "prefs-reset":
                    if (!window.confirm(_("RESET_CONFIRM"))) {
                        return;
                    }
                    await chrome.storage.local.clear();
                    await chrome.storage.local.set({ open_settings: true })
                    chrome.runtime.reload();
                    break;
            }
        });

        document.querySelectorAll(".expand").forEach(el => el.addEventListener("click", e => e.target.classList.add("expanded")));
        [].forEach.call(document.body.querySelectorAll(".action_buttons") || [], function (el) {
            el.onmousedown = function (e) {
                e.preventDefault();
            };
        });

        await readCfg();
        load();
        updateHiResUi();
        applyCustomCssOptions();
        window.onhashchange();
        /* var advanced_prefs = $("tls_advanced");
        advanced_prefs.onchange = function () {
            document.body.classList[this.checked ? "add" : "remove"]("advanced");
        };
        advanced_prefs.onchange(); */
        document.body.style.display = "";

        /* $('hz_hoverCss').addEventListener('blur', () => $('hz_hoverCss_style').textContent = '');
        $('hz_hoverCss').addEventListener('focus', updateHoverStyle);
        $('hz_hoverCss').addEventListener('keyup', updateHoverStyle);
        function updateHoverStyle() {
            $('hz_hoverCss_style').textContent =
                `.hz_hoverCss:after {
                    content: "";
                    z-index: 2147483646;
                    position: absolute;
                    pointer-events: none;
                    box-sizing: content-box;
                    border-radius: 2px;
                    width: 100%;
                    height: 100%;
                    top: 0;
                    left: 0;
                    padding: 0;
                    margin: 0;
                    ${this.value}
                }`;
        }; */

        $("allow_scripts_message").addEventListener("click", function (event) {
            event.preventDefault();
            switch (this.dataset.type) {
                case "scripts":
                    chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id + "#:~:text=Allow%20user%20scripts" });
                    break;
                case "firefox":
                    chrome.permissions.request({ permissions: ["userScripts"] });
                    break;
                case "devmode":
                default:
                    chrome.tabs.create({ url: "chrome://extensions/#:~:text=Developer%20mode" });
                    break;
            }
        });

        setTimeout(checkUserScripts, 500);
    },
    false
);

document.addEventListener("keydown", function (e) {
    if (e.code === "KeyS" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        $("save_button").click();
    }
}, true);

async function checkUserScripts() {
    try {
        const scripts = await chrome.userScripts.getScripts();
        if (scripts?.length > 0) {
            const msg = $("allow_scripts_message");
            msg.innerHTML = _("APP_READY").replace('"Imagus"', app.name);
            msg.style.backgroundColor = "#dcfad7";
            return;
        } else {
            Port.send({ cmd: "loadScripts" });
            showErrorMsg();
        }
    } catch(error) {
        showErrorMsg(error);
    }

    setTimeout(checkUserScripts, 2000);
}

function showErrorMsg(error) {
    const msg = $("allow_scripts_message");
    if (platform === "firefox") {
        msg.dataset.type = "firefox";
        msg.innerHTML = _("ALLOW_USER_SCRIPTS_FF");
    } else if (error?.message?.includes("API is only available for users in developer mode")) {
        msg.dataset.type = "devmode";
        msg.innerHTML = _("ALLOW_DEV_MODE");
    } else {
        msg.dataset.type = "scripts";
        msg.innerHTML = _("ALLOW_USER_SCRIPTS");
    }
    msg.style.display = "block";
}
