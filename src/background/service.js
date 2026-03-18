"use strict";

var manifest = chrome.runtime.getManifest();
var cachedSieveRes = [],
    cachedPrefs = {};

const platform = location.protocol ===  "moz-extension:" ? "firefox" : "chrome";

var cfg = {
    sessionGet: (keys, callback) => {
        return callback ? chrome.storage.session.get(keys, callback) : chrome.storage.session.get(keys);
    },
    sessionSet: (items) => {
        return chrome.storage.session.set(items);
    },
    sessionRemove: (keys) => {
        return chrome.storage.session.remove(keys);
    },
    async get(keys, callback) {
        const items = await chrome.storage.local.get(keys);
        for (var key in items) {
            try {
                if (!items[key]) throw new Error();
                items[key] = JSON.parse(items[key]);
            } catch (error) {
                delete items[key];
            }
        }
        callback?.(items);
        return items;
    },
    async set(items, callback) {
        for (var key in items) {
            items[key] = JSON.stringify(items[key]);
        }
        await chrome.storage.local.set(items);
        callback?.();
    },
    remove(keys) {
        return chrome.storage.local.remove(keys);
    },
};

function withBaseURI(base, relative, secure) {
    if (relative[0] === '/' && relative[1] === '/') {
        return secure ? base.slice(0, base.indexOf(":") + 1) + relative : relative;
    } else if (/^[\w-]{2,20}:/i.test(relative)) {
        return relative;
    } else {
        const regex = relative[0] === '/' ? /(\/\/[^/]+)\/.*/ : /(\/)[^/]*(?:[?#].*)?$/;
        return base.replace(regex, "$1") + relative;
    }
}

async function updateSieve(local) {
    const { sieve: curSieve, sieveRepository: sieveRepoUrl } = await cfg.get(["sieveRepository", "sieve"]);
    local = local || !sieveRepoUrl;

    try {
        const response = await fetch(local ? "/data/sieve.json" : sieveRepoUrl);
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        let newSieve = await response.json();
        if (curSieve) {
            let merged = {};
            // keep rules that starts with "_"
            for (let key in curSieve) {
                if (key.startsWith("_")) {
                    merged[key] = curSieve[key];
                }
            }
            // add new and updated rules
            for (let key in newSieve) {
                merged[key] = newSieve[key];
            }
            // add all other existing rules and disable them; copy disabled state for existing rules
            for (let key in curSieve) {
                if (merged[key]) {
                    merged[key].off = curSieve[key].off;
                } else {
                    curSieve[key].off = 1;
                    merged[key] = curSieve[key];
                }
            }
            newSieve = merged;
        }
        await updatePrefs({ sieve: newSieve });
        await cfg.set({ sieveUpdateLast: Date.now() });
        console.info(manifest.name + ": Sieve updated from " + (local ? "local" : "remote") + " repository.");
        return { updated_sieve: newSieve };

    } catch (error) {
        console.warn(manifest.name + ": Sieve failed to update from " + (local ? "local" : "remote") + " repository! | ", error.message);

        if (!local) {
            const data = await cfg.get("sieve");
            if (!data.sieve) {
                return updateSieve(true);
            }
        }

        return { error: "Error. " + error.message };
    }
}

function cacheSieve(newSieve) {
    if (typeof newSieve === "string") newSieve = JSON.parse(newSieve);
    else newSieve = JSON.parse(JSON.stringify(newSieve));
    const cachedSieve = [];
    cachedSieveRes = [];

    for (var ruleName in newSieve) {
        var rule = newSieve[ruleName];
        if ((!rule.link && !rule.img) || (rule.img && !rule.to && !rule.res)) continue;
        try {
            if (rule.off) throw ruleName + " is off";
            if (rule.res)
                if (/^:\n/.test(rule.res)) {
                    cachedSieveRes[cachedSieve.length] = rule.res.slice(2);
                    rule.res = 1;
                } else {
                    if (rule.res.indexOf("\n") > -1) {
                        var lines = rule.res.split(/\n+/);
                        rule.res = RegExp(lines[0]);
                        if (lines[1]) rule.res = [rule.res, RegExp(lines[1])];
                    } else rule.res = RegExp(rule.res);
                    cachedSieveRes[cachedSieve.length] = rule.res;
                    rule.res = true;
                }
        } catch (ex) {
            if (typeof ex === "object") console.error(ruleName, rule, ex);
            else console.info(ex);
            continue;
        }
        if (rule.to && rule.to.indexOf("\n") > 0 && rule.to.indexOf(":\n") !== 0) rule.to = rule.to.split("\n");
        delete rule.note;
        cachedSieve.push(rule);
    }
    cachedPrefs.sieve = cachedSieve;
}

async function updatePrefs(prefs, callback) {
    prefs = prefs || {};

    let defaults = await (await fetch("/data/defaults.json")).json();
    let storedPrefs = await cfg.get(Object.keys(defaults));
    let newPrefs = {};
    let changes = {};

    for (let key in defaults) {
        let isChanged = false;
        if (typeof defaults[key] === "object") {
            isChanged = true;
            if (Array.isArray(defaults[key])) {
                newPrefs[key] = prefs[key] || storedPrefs[key] || defaults[key];
            } else {
                newPrefs[key] = Object.assign({}, defaults[key], storedPrefs[key], prefs[key]);
                for (let subKey in defaults[key]) {
                    if (newPrefs[key][subKey] === undefined ||
                        typeof newPrefs[key][subKey] !== typeof defaults[key][subKey])
                    {
                        newPrefs[key][subKey] =
                            cachedPrefs?.[key]?.[subKey] !== undefined
                            ? cachedPrefs[key][subKey]
                            : defaults[key][subKey];
                    }
                }
            }
        } else {
            let value = prefs[key] || storedPrefs[key] || defaults[key];
            if (typeof value !== typeof defaults[key]) {
                value = defaults[key];
            }
            if (!cachedPrefs || cachedPrefs[key] !== value) {
                isChanged = true;
            }
            newPrefs[key] = value;
        }
        if (isChanged || storedPrefs[key] === undefined) {
            changes[key] = newPrefs[key];
        }
    }

    if (newPrefs.grants?.length > 0) {
        let grants = newPrefs.grants || [];
        let processedGrants = [];
        for (let i = 0; i < grants.length; ++i) {
            if (grants[i].op !== ";") {
                processedGrants.push({
                    op: grants[i].op,
                    url: grants[i].op.length === 2 ? RegExp(grants[i].url, "i") : grants[i].url,
                });
            }
        }
        if (processedGrants.length) {
            newPrefs.grants = processedGrants;
        }
    } else {
        delete newPrefs.grants;
    }

    cachedPrefs = newPrefs;
    if (prefs.sieve) {
        changes.sieve = typeof prefs.sieve === "string" ? JSON.parse(prefs.sieve) : prefs.sieve;
        cacheSieve(changes.sieve);
    }
    await cfg.set(changes);
    if (!prefs.sieve) {
        const data = await cfg.get("sieve");
        if (!data?.sieve) {
            await updateSieve(false);
        } else {
            cacheSieve(data.sieve);
        }
    }
    if (typeof callback === "function") {
        callback();
    }
}

function onMessage(message, sender, sendResponse) {
    let msg, context;
    if (sender === null) {
        msg = message;
    } else {
        context = { msg: message, origin: sender.url, postMessage: sendResponse };
        msg = context.msg;
    }
    if (!msg.cmd) return;

    switch (msg.cmd) {
        case "hello": {
            initTab(sender.tab, sendResponse);
            break;
        }
        case "toggle":
            toggleTab(sender.tab);
            break;

        case "cfg_get":
            if (!Array.isArray(msg.keys)) {
                msg.keys = [msg.keys];
            }
            cfg.get(msg.keys, function (data) {
                context.postMessage({ cfg: data });
            });
            break;
        case "cfg_del":
            if (!Array.isArray(msg.keys)) {
                msg.keys = [msg.keys];
            }
            cfg.remove(msg.keys);
            break;
        case "getLocaleList":
            fetch("/data/locales.json")
                .then((resp) => resp.text())
                .then(function (resp) {
                    context.postMessage(resp);
                });
            break;
        case "savePrefs":
            updatePrefs(msg.prefs, context.postMessage);
            break;
        case "update_sieve":
            updateSieve(msg.local).then(context.postMessage);
            break;
        case "loadScripts":
            registerContentScripts();
            break;
        case "download":
            download(msg, sender.tab?.incognito, sendResponse);
            break;
        case "history":
            if (chrome.extension?.inIncognitoContext || sender.tab?.incognito) break;
            if (msg.manual) {
                chrome.history.getVisits({ url: msg.url }, function (hv) {
                    chrome.history[(hv.length ? "delete" : "add") + "Url"]({ url: msg.url });
                });
            } else {
                chrome.history.addUrl({ url: msg.url });
            }
            break;
        case "options":
            chrome.runtime.openOptionsPage();
            break;
        case "open":
            if (!Array.isArray(msg.url)) {
                msg.url = [msg.url];
            }
            msg.url.forEach(function (url) {
                if (url && typeof url === "string") {
                    let tabOptions = { url, active: !msg.nf };
                    if (sender?.tab?.id) {
                        tabOptions.openerTabId = sender.tab.id;
                    }
                    try {
                        chrome.tabs.create(tabOptions);
                    } catch (error) {
                        delete tabOptions.openerTabId;
                        chrome.tabs.create(tabOptions);
                    }
                }
            });
            break;
        case "resolve": {
            const data = {
                cmd: "resolved",
                id: msg.id,
                m: null,
                params: msg.params,
            };
            const rule = cachedPrefs.sieve[data.params.rule.id];

            if (data.params.rule.req_res) {
                data.params.rule.req_res = cachedSieveRes[data.params.rule.id];
            }
            if (data.params.rule.skip_resolve) {
                data.params.url = [""];
                context.postMessage(data);
                return;
            }

            const urlParts = /([^\s]+)(?: +:(.+)?)?/.exec(msg.url);
            msg.url = urlParts[1];
            let postData = urlParts[2] || null;

            if (rule.res === 1) {
                data.m = true;
                data.params._ = "";
                data.params.url = [urlParts[1], postData];
            }

            fetch(msg.url, {
                method: postData ? "POST" : "GET",
                body: postData,
                headers: postData ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
            })
                .then((fetchResp) => {
                    const contentType = fetchResp.headers.get("Content-Type");
                    if (/^(image|video|audio)\//i.test(contentType)) {
                        data.m = msg.url;
                        data.noloop = true;
                        console.warn(chrome.runtime.getManifest().name + ": rule " + data.params.rule.id + " matched against an image file");
                        context.postMessage(data);
                        return null;
                    }
                    return fetchResp.text();
                })
                .then((body) => {
                    // if (body === null) return;
                    let base = body.slice(0, 4096);
                    const baseHrefMatch = /<base\s+href\s*=\s*("[^"]+"|'[^']+')/.exec(base);
                    base = baseHrefMatch
                        ? withBaseURI(msg.url, baseHrefMatch[1].slice(1, -1).replace(/&amp;/g, "&"), true)
                        : msg.url;

                    if (rule.res === 1) {
                        data.params._ = body;
                        data.params.base = base.replace(/(\/)[^\/]*(?:[?#].*)*$/, "$1");
                        context.postMessage(data);
                        return;
                    }

                    let patterns = cachedSieveRes[data.params.rule.id];
                    patterns = Array.isArray(patterns) ? patterns : [patterns];
                    patterns = patterns.map((pattern) => {
                        const source = pattern.source || pattern;
                        if (!source.includes("$")) return pattern;
                        let group = data.params.length;
                        group = Array.from({ length: group }, (_, i) => i).join("|");
                        group = RegExp("([^\\\\]?)\\$(" + group + ")", "g");
                        group = group.test(source)
                            ? source.replace(group, (match, pre, idx) => {
                                  return idx < data.params.length && pre !== "\\"
                                      ? pre + (data.params[idx] ? data.params[idx].replace(/[/\\^$-.+*?|(){}[\]]/g, "\\$&") : "")
                                      : match;
                              })
                            : group;
                        return typeof pattern === "string" ? group : RegExp(group);
                    });

                    let match = patterns[0].exec(body);
                    if (match) {
                        const loopParam = data.params.rule.loop_param;
                        if (rule.dc && (("link" === loopParam && rule.dc !== 2) || ("img" === loopParam && rule.dc > 1))) {
                            match[1] = decodeURIComponent(decodeURIComponent(match[1]));
                        }
                        data.m = withBaseURI(base, match[1].replace(/&amp;/g, "&"));
                        if ((match[2] && (match = match.slice(1))) || (patterns[1] && (match = patterns[1].exec(body)))) {
                            data.m = [data.m, match.filter((val, idx) => idx && val).join(" - ")];
                        }
                    } else {
                        console.info(chrome.runtime.getManifest().name + ": no match for " + data.params.rule.id);
                    }
                    context.postMessage(data);
                });
            break;
        }
    }
    return true;
}

function sanitizeFilename(filename) {
    // replace invalid chars (\ / : * ? " < > |) + control chars
    return filename.replace(/[\\/:*?"<>|\r\n\x00-\x1f]/g, "_");
}

async function download(msg, incognito, sendResponse) {
    if (!msg.url) return;

    if (!msg.alterDownload) {
        /* await chrome.notifications.create(
            "imagus_download",
            {
                title: manifest.name,
                message: "Download started...",
                type: "basic",
                iconUrl: "/common/img/icon.png",
            },
        ); */

        let resp = await fetch(msg.url, {
            method: "get",
            headers: {
                "Range": "bytes=0-0"
            }
        });
        if (!resp.ok || resp.redirected) {
            msg.alterDownload = true;
            sendResponse(msg);

            return;
        }
    }

    const ext = msg.priorityExt ?? msg.ext;

    const filename =
        msg.filename && ext
            ? `${msg.filename}.${ext}`
            : msg.urlName;
    
    const params = {
        url: msg.blob ? URL.createObjectURL(msg.blob) : msg.url,
        filename: filename ? sanitizeFilename(filename) : undefined,
        conflictAction: "uniquify"
    };

    if (platform === "firefox") {
        params.incognito = incognito;
    }

    chrome.downloads.download(params)
}

/* chrome.downloads.onChanged.addListener(change => {
    if (!change.state) return;
    chrome.notifications.clear("imagus_download");
}); */

function keepAlive() {
    // keep the service worker alive
    setInterval(chrome.runtime.getPlatformInfo, 25_000);
}

async function registerContentScripts() {
    try {
        await chrome.userScripts.configureWorld({ csp: "script-src 'self' 'unsafe-eval'", messaging: true });
    } catch(error) {
        chrome.runtime.openOptionsPage();
        return;
    }

    await chrome.runtime.onUserScriptMessage?.addListener(onMessage);
    await chrome.userScripts.unregister();
    await chrome.userScripts.register([
        {
            id: "app.js",
            allFrames: true,
            matches: ["<all_urls>"],
            world: "USER_SCRIPT",
            runAt: "document_start",
            js: [{ file: "common/app.js" }],
        },
        {
            id: "content.js",
            allFrames: true,
            matches: ["<all_urls>"],
            runAt: "document_idle",
            world: "USER_SCRIPT",
            js: [{ file: "content/content.js" }],
        },
    ]);
}

// Sieve auto update once a week
chrome.alarms.onAlarm.addListener(autoUpdateSieve);
setTimeout(autoUpdateSieve, 20_000);
async function autoUpdateSieve(alarm) {
    const ALARM_ID = 'alarm-sieve-update';
    if (alarm?.name && alarm.name !== ALARM_ID) return;

    alarm = await chrome.alarms.get(ALARM_ID);
    if (!alarm) {
        await chrome.alarms.create(ALARM_ID, { periodInMinutes: 60 });
    }

    let { sieveUpdateNext } = await cfg.get("sieveUpdateNext") || {};
    const now = Date.now();

    if (sieveUpdateNext && sieveUpdateNext <= now) {
        if (cachedPrefs.tls?.autoUpdateSieve) {
            let res = await updateSieve(false);
            if (res?.error) return;
        }
        sieveUpdateNext = 0;
    }

    if (!sieveUpdateNext) {
        cfg.set({ sieveUpdateNext: now + 7*24*60*60*1000 });
    }
}

function initTab(tab, sendResponse) {
    const resp = {
        cmd: "hello",
        prefs: {
            hz: cachedPrefs.hz,
            sieve: grantsIsBlocked(tab.url) ? null : cachedPrefs.sieve,
            tls: cachedPrefs.tls,
            keys: cachedPrefs.keys,
            app: { name: manifest.name, version: manifest.version },
        }
    };

    if (typeof sendResponse === "function") {
        sendResponse(resp);
    } else {
        chrome.tabs.sendMessage(tab.id, resp);
    }
}

async function toggleTab(tab) {
    if (!tab.url) return;
    if (grantsIsBlocked(tab.url)) {
        await grantsRemove(tab.url);
        if (grantsIsBlocked(tab.url)) {
            // still blocked, most probably RegEx is used - should be handled manually
            chrome.tabs.create({ url: "options/options.html#grants" });
            return;
        }
    } else {
        await grantsAdd(tab.url);
    }

    updateBadge(tab.id, tab.url);

    // init/deinit tabs with the same origin
    let tabs = await chrome.tabs.query({ url: new URL(tab.url).origin + "/*" }) || [];
    tabs.forEach(initTab);
}

// check if Imagus is disabled on the given URL
function grantsIsBlocked(url) {
    if (!url || !cachedPrefs.grants) return false;

    let blocked = false;
    for (let i = 0, len = cachedPrefs.grants.length; i < len; ++i) {
        let grant = cachedPrefs.grants[i];
        if (grant.url === "*" || (grant.op[1] && grant.url.test(url)) || url.indexOf(grant.url) > -1) {
            blocked = grant.op[0] === "!";
        }
    }

    return blocked;
}

// disable Imagus on the given URL
async function grantsAdd(url) {
    if (!url) return;
    const hostname = new URL(url).hostname;
    if (!hostname) return;
    let { grants } = await cfg.get("grants");

    grants.push({ op: "!", url: hostname + "/" });
    await updatePrefs({ grants: grants });
}

// enable Imagus on the given URL
async function grantsRemove(url) {
    if (!url) return;
    const hostname = new URL(url).hostname;
    if (!hostname) return;
    let { grants } = await cfg.get("grants");

    grants = grants.filter(grant =>
        grant.url !== hostname + "/" ||
        grant.op.length > 1 ||
        grant.op[0] !== "!"
    );
    await updatePrefs({ grants: grants });
}

function updateBadge(tabId, tabUrl) {
    if (!tabUrl) return;
    if (grantsIsBlocked(tabUrl)) {
        chrome.action.setBadgeText({ text: "X", tabId: tabId });
        chrome.action.setBadgeBackgroundColor({color: "#ff8080ff", tabId: tabId });
        chrome.action.setBadgeTextColor({ color: "#FFF", tabId: tabId });
    } else {
        chrome.action.setBadgeText({ text: "", tabId: tabId });
    }
}

// disable/enable Imagus on icon click
chrome.action.onClicked.addListener(toggleTab);

// update badge on tab update
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (!tab.active) return;
    updateBadge(tabId, tab.url);
});

// update badge on tab activation
chrome.tabs.onActivated.addListener(async function(info) {
    updateBadge(info.tabId, (await chrome.tabs.get(info.tabId)).url);
});


chrome.action.setTitle({ title: `${manifest.name} v${manifest.version}\nClick to toggle on this site` });
updatePrefs(null, registerContentScripts);
chrome.runtime.onStartup.addListener(updatePrefs);
chrome.runtime.onInstalled.addListener(function (e) {
    if (e.reason === "update") {
        registerContentScripts();
    } else if (e.reason === "install") {
        chrome.runtime.openOptionsPage();
    }
});
chrome.runtime.onMessage?.addListener(onMessage);

keepAlive();
