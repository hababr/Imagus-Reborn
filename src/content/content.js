"use strict";
(function (win, doc) {
    if (!doc || doc instanceof win.HTMLDocument === false) return;
    var imgDoc = doc.images && doc.images.length === 1 && doc.images[0];
    if (imgDoc && imgDoc.parentNode === doc.body && imgDoc.src === win.location.href) return;

    // handle direct video links
    if (doc.body?.children?.length < 5 && doc.body?.children[0]?.localName === 'video' && doc.body.children[0].currentSrc === win.location.href) {
        // get time position from hash in case the video is opened from Imagus
        const time = /imagus_time=(\d+)/.exec(win.location.hash);
        if (time) {
            const video = doc.body.children[0];
            video.currentTime = parseInt(time[1], 10);
        }
        return;
    }

    const _ = function (msg) {
        return cfg?.messages?.[msg] || msg;
    };

    // Smooth scroll support (trackpad / smooth-scroll mouse)
    let wheelRAF = null;
    let wheelDeltaAccum = 0;
    let albumDeltaAccum = 0;
    let wheelLastXY;
    let albumDeltaTimer;
    let lastZoomScrollTime = 0;
    function applyAccumulatedZoom() {
        wheelRAF = null;
        const delta = wheelDeltaAccum;
        wheelDeltaAccum = 0;
        if (delta === 0 || !PVI.fullZm) return;
        PVI.resize(delta, wheelLastXY);
    }

    async function injectCss(file, text, inHead) {
        let css = "";
        if (file) {
            css = await chrome.runtime.sendMessage({ cmd: "get_file", file });
        }
        if (text) {
            css += text;
        }

        let style = document.createElement('style');
        style.textContent = css;
        if (inHead) {
            document.head.appendChild(style);
        } else {
            PVI.ROOT?.shadowRoot?.appendChild(style);
        }
    }

    async function injectJs(file) {
        const code = await chrome.runtime.sendMessage({ cmd: "get_file", file });
        Function(code)();
    }

    var flip = function (el, ori) {
        if (!el.scale) el.scale = { h: 1, v: 1 };
        el.scale[ori ? "h" : "v"] *= -1;
        ori = el.scale.h !== 1 || el.scale.v !== 1 ? "scale(" + el.scale.h + "," + el.scale.v + ")" : "";
        if (el.curdeg) ori += " rotate(" + el.curdeg + "deg)";
        el.style.transform = ori;
    };

    var animate = function (el, type = "squeeze") {
        if (!el) return;
        el.classList.add(type);
        setTimeout(() => el.classList.remove(type), 300);
    };

    var rotate = function (deg) {
        if (!PVI.DIV) return;
        deg = typeof deg === 'number' ? deg : (deg ? 90 : -90);
        PVI.DIV.curdeg += deg;
        PVI.DIV.curdeg %= 360;
        if (PVI.CAP && PVI.CAP.textContent && PVI.CAP.state !== 0) {
            PVI.CAP.style.display = PVI.DIV.curdeg ? "none" : "block";
        }
        PVI.DIV.style.transform = PVI.DIV.curdeg ? "rotate(" + PVI.DIV.curdeg + "deg)" : "";
        PVI.DIV.dataset.rotate = PVI.DIV.curdeg;
        if (deg === 0) return;
        if (PVI.fullZm) {
            PVI.m_move();
        } else {
            PVI.show();
        }
    }

    var copyToClipboard = function (text, elem) {
        PVI.timers.copy = undefined;
        if (!text) return;
        var oncopy = function (ev) {
            this.removeEventListener(ev.type, oncopy);
            ev.clipboardData.setData("text/plain", text);
            ev.preventDefault();
        };
        doc.addEventListener("copy", oncopy);
        doc.execCommand("copy");
        animate(elem);
    }

    var copyUrls = function (e, caption) {
        if (PVI.timers.copy) clearTimeout(PVI.timers.copy);
        let isDouble = !!PVI.timers.copy;
        let text = "";
        let elem = PVI.DIV;

        if (isDouble && e.type === "keydown" || caption) {
            text = PVI.TRG.IMGS_caption || "";
            elem = PVI.CAP;
        } else if (PVI.TRG?.IMGS_album && (PVI.galleryState === 2 || isDouble)) {
            text = getAlbumClean().join("\n");
        }

        if (!text) {
            text = getSrc() || "";
        }

        if (e.type !== "keydown") {
            elem = undefined
        }
        PVI.timers.copy = setTimeout(copyToClipboard, isDouble || caption ? 0 : 500, text, elem);
    }

    var getSrc = function () {
        let src = PVI.EXTENSION?.IFRAME?.src || (PVI.isVideo() ? PVI.PLAYER?.src() : PVI.CNT.src);
        return src;
    }

    var getAlbumClean = function () {
        const album = PVI.stack[PVI.TRG.IMGS_album] || [];
        if (album.length === 0) return [];

        const urls = [];
        for (let i = 1; i < album.length; i++) {
            let item = album[i];
            if (item[1]?.startsWith?.("<imagus-extension")) {
                const match = item[1].match(/url="([^"]+)"/);
                if (match) item = match[1];
            }
            let url = Array.isArray(item) ? item[0] : item;
            url = Array.isArray(url) ? url[0] : url;
            url = url?.replace?.(/^#/, "");
            if (url && !url.startsWith("data:image")) {
                urls.push(url);
            }
        }
        return urls;
    }

    var openTab = async function (e) {
        let src = getSrc();
        if (PVI.galleryState === 2 && PVI.TRG?.href) {
            src = PVI.TRG.href
        }
        if (src) {
            src = src.replace(rgxHash, "");
            if (PVI.isVideo()) {
                src += "#imagus_time=" + Math.floor(PVI.PLAYER.currentTime());
            }
            const how =
                e.shiftKey && e.button === undefined || e.ctrlKey && e.button === 0 || e.button === 1 ? "bg" :
                e.shiftKey && e.button === 0 || e.ctrlKey ? "popup" :
                "tab";

            if (how === "bg") {
                Port.send({ cmd: "open", url: src, active: false });

            } else if (how === "popup") {
                const w = PVI.PLAYER?.videoWidth() || PVI.CNT.naturalWidth || PVI.CNT.clientWidth || 0;
                const h = PVI.PLAYER?.videoHeight() || PVI.CNT.naturalHeight || PVI.CNT.clientHeight || 0;
                Port.send({
                    cmd: "open",
                    url: src,
                    active: true,
                    inWindow: true,
                    width: Math.min(w, window.screen.width),
                    height: Math.min(h, window.screen.height),
                    top: Math.max(0, Math.floor((window.screen.height - h) / 2)),
                    left: Math.max(0, Math.floor((window.screen.width - w) / 2)),
                });

            } else {
                Port.send({ cmd: "open", url: src, active: true });
            }

            if (how !== "bg") PVI.reset();
        }
    }

    var isUrlIgnored = function(url) {
        if (!cfg.hz.grantUrlsEnabled || !cfg.grantUrls?.length || !url) return false;

        for (const g of cfg.grantUrls) {
            if (g.op[1] && typeof g.url === "string") {
                g.url = new RegExp(g.url, "i");
            }
            if (g.op[0] === "!" && (typeof g.url.test === "function" ? g.url.test(url) : url.includes(g.url))) {
                console.log(`Imagus ignore element with url: ${url}`);
                return true;
            }
        }
    }

    var pdsp = function (e, d, p) {
        if (!e || !e.preventDefault || !e.stopPropagation) return;
        if (d === undefined || d === true) e.preventDefault();
        if (p !== false) e.stopImmediatePropagation();
    };

    var imageSendTo = function (sf) {
        if ((!sf.url && !sf.name && !sf.url) || (sf.url && !/^http/.test(sf.url))) {
            alert(_("INVALID_URL") + ": " + sf.url.slice(0, sf.url.indexOf(":") + 1));
            return;
        }
        var i = 0;
        var urls = [];
        var hosts = cfg.tls.sendToHosts;
        for (; i < hosts.length; ++i)
            if (sf.host === i || (sf.host === undefined && hosts[i][0][0] === "+"))
                urls.push(hosts[i][1].replace("%url", encodeURIComponent(sf.url)).replace("%raw_url", sf.url));
        Port.send({ cmd: "open", url: urls, active: sf.active });
    };

    var checkBG = function (imgs) {
        if (imgs)
            if (Array.isArray((imgs = imgs.match(/\burl\(([^'")][^)]*|"[^"\\]+(?:\\.[^"\\]*)*|'[^'\\]+(?:\\.[^'\\]*)*)(?=['"]?\))/g)))) {
                var i = imgs.length;
                while (i--) imgs[i] = imgs[i].slice(/'|"/.test(imgs[i][4]) ? 5 : 4);
                return imgs;
            }
        return null;
    };

    var checkIMG = function (node) {
        var nname = node.nodeName.toUpperCase();
        if (nname === "IMG" || node.type === "image" || nname === "EMBED") return node.src;
        else if (nname === "CANVAS") return node.toDataURL();
        else if (nname === "OBJECT" && node.data) return node.data;
        else if (nname === "AREA") {
            var img = doc.querySelector('img[usemap="#' + node.parentNode.name + '"]');
            return img.src;
        } else if (nname === "VIDEO") {
            nname = doc.createElement("canvas");
            nname.width = node.clientWidth;
            nname.height = node.clientHeight;
            nname.getContext("2d").drawImage(node, 0, 0, nname.width, nname.height);
            return nname.toDataURL("image/jpeg");
        } else if (nname === "SVG") {
            const svg = new XMLSerializer().serializeToString(node);
            return `data:image/svg+xml;base64,${btoa(svg)}`;
        } else if (node.poster) {
            return node.poster;
        }
        return null;
    };

    var mdownstart, winW, winH, topWinW, topWinH;
    var rgxHash = /#(?![?!].).*/;
    var rgxIsSVG = /\.svgz?$/i;
    // var rgxIsSVG = /\.svgz?$|^data:image\/svg/i;
    var viewportDimensions = function (targetDoc) {
        var d = targetDoc || doc;
        d = (d.compatMode === "BackCompat" && d.body) || d.documentElement;
        var w = d.clientWidth;
        var h = d.clientHeight;
        if (targetDoc) return { width: w, height: h };
        if (w === winW && h === winH) return;
        winW = w;
        winH = h;
        topWinW = w;
        topWinH = h;
    };

    var releaseFreeze = function (e) {
        if (typeof PVI.freeze === "number") {
            PVI.freeze = !cfg.hz.deactivate;
            return;
        }
        if (e.type === "mouseup") {
            if ([1, 3, 4].includes(e.button)) {
                if (e.button === 1 && PVI.TBAR?.contains(e.target)) {
                    // middle click on the toolbar
                    PVI.tbarClick(e);
                } else {
                    PVI.key_action(e);
                }
                return;
            }
            if (e.target !== PVI.ROOT || PVI.fullZm || e.button !== 0) return;
            if (e.ctrlKey || e.shiftKey || e.altKey) return;
            if (PVI.md_x !== e.clientX || PVI.md_y !== e.clientY) return;
            PVI.reset(true);
            return;
        }
        if (PVI.keyup_freeze_on) PVI.keyup_freeze();
    };

    var onMouseDown = function (e) {
        if (!cfg || !e.isTrusted || e.target === PVI.ROOT || PVI.state < 0) return;
        const root = doc.compatMode && doc.compatMode[0] === "B" ? doc.body : doc.documentElement;
        if (e.clientX >= root.clientWidth || e.clientY >= root.clientHeight) return;

        const isRightButton = e.button === 2;
        const shouldFreeze = isRightButton && PVI.freeze && PVI.SRC !== undefined && !cfg.hz.deactivate;

        if (PVI.fireHide && PVI.state < 3 && !shouldFreeze) {
            PVI.m_over({ relatedTarget: PVI.TRG });
            if (!PVI.freeze || PVI.lastScrollTRG) PVI.freeze = 1;
            return;
        }
        if (e.button === 0) {
            if (PVI.isVideo() && e.target.closest(".vjs-control-bar")) return;

            if (PVI.fullZm) {
                if (e.ctrlKey || PVI.CAP.contains(e.target) || PVI.fullZm === 2) {
                    mdownstart = true;
                    pdsp(e);
                    PVI.fullZm = 3;
                    PVI.setCursor("grabbing");
                    PVI.DIV.classList.add("dragging");
                    win.addEventListener("mouseup", PVI.fzDragEnd, true);
                }
                return;
            }
            if (e.target === PVI.CNT) {
                PVI.md_x = e.clientX;
                PVI.md_y = e.clientY;
                return;
            }
            if (PVI.fireHide) PVI.m_over({ relatedTarget: PVI.TRG, clientX: e.clientX, clientY: e.clientY });
            if (!PVI.freeze || PVI.lastScrollTRG) PVI.freeze = 1;
            return;
        }

        if (e.button === 1 && PVI.TBAR.contains(e.target)) {
            // middle click on the toolbar
            e.preventDefault();
            return;
        }

        if (!isRightButton) return;
        if (cfg.hz.actTrigger === "m2") {
            if (PVI.fireHide && shouldFreeze) {
                PVI.SRC = { m2: PVI.SRC === null ? PVI.TRG.IMGS_c_resolved : PVI.SRC.m2 || PVI.SRC };
            }
            PVI.freeze = cfg.hz.deactivate;
        } else if (PVI.keyup_freeze_on) {
            PVI.keyup_freeze();
            PVI.freeze = PVI.freeze ? 1 : 0;
        }
        mdownstart = e.timeStamp;
        PVI.md_x = e.clientX;
        PVI.md_y = e.clientY;

        if (PVI.state > 2 && (cfg.hz.fzOnPress === 1 || cfg.hz.fzOnPress === 2) && !PVI.fullZm) {
            clearTimeout(PVI.timers.cursor_hide);
            clearTimeout(PVI.timers.cursor_wait);
            const oldCursor = e.target.style.cursor;
            const oldTarget = e.target;
            oldTarget.style.cursor = "progress";
            PVI.timers.cursor_wait = setTimeout(() => oldTarget.style.cursor = oldCursor, 300);
        }

        if (e.target.href || e.target.parentNode?.href) {
            e.preventDefault();
        }
    };

    var onContextMenu = function (e) {
        if (PVI.state < 0) return;

        if (e.button === 2) {
            PVI.contextEvent = e;
        }

        const isCursorMoved = Math.abs(PVI.md_x - e.clientX) > 5 || Math.abs(PVI.md_y - e.clientY) > 5;
        if (!mdownstart || e.button !== 2 || isCursorMoved) {
            if (mdownstart) mdownstart = null;

            if (
                e.button === 2 &&
                (!PVI.fireHide || PVI.state > 2) &&
                isCursorMoved &&
                cfg.hz.actTrigger === "m2" &&
                !cfg.hz.deactivate
            ) {
                pdsp(e);
            }
            return;
        }

        const elapsed = e.timeStamp - mdownstart >= 300;
        mdownstart = null;

        const shouldFullZoom = PVI.state > 2 && ((elapsed && cfg.hz.fzOnPress === 2) || (!elapsed && !PVI.fullZm && cfg.hz.fzOnPress === 1));

        if (shouldFullZoom) {
            PVI.key_action({ which: 13, shiftKey: PVI.fullZm ? true : e.shiftKey });
            pdsp(e);
            return;
        }

        var hasAltSrc = PVI.state < 3 && PVI.SRC && PVI.SRC.m2 !== undefined;

        if (hasAltSrc) {
            if (elapsed) return;
            PVI.load(PVI.SRC.m2);
            PVI.SRC = undefined;
            pdsp(e);
            return;
        }

        if (elapsed && PVI.state > 2 && !PVI.fullZm && cfg.hz.fzOnPress === 1) {
            return;
        }

        if (PVI.DIV.contains(e.target) || e.target === PVI.ROOT) {
            pdsp(e, false);
        } else if (e.ctrlKey && !elapsed && !e.shiftKey && !e.altKey && cfg.tls.opzoom && PVI.state < 2) {
            const tags = ['IMG', 'VIDEO', 'SVG', 'CANVAS', 'EMBED', 'OBJECT', 'AREA'];
            const elements = getElementsFromPoint(e.clientX, e.clientY) || [];
            const target = elements.find(e => tags.includes(e?.nodeName?.toUpperCase())) || elements[0];
            if (!target) return;
            const imgSrc = checkIMG(target) || checkBG(win.getComputedStyle(target).backgroundImage);

            if (imgSrc) {
                PVI.TRG = PVI.nodeToReset = target;
                PVI.fireHide = true;
                PVI.x = e.clientX;
                PVI.y = e.clientY;
                PVI.set(Array.isArray(imgSrc) ? imgSrc[0] : imgSrc);
                pdsp(e);
            }
        }
    };

    function getElementsFromPoint(x, y) {
        let limit = 20;
        let elements = doc.elementsFromPoint(x, y);
        while (elements?.[0]?.shadowRoot && limit-- > 0) {
            let newElems = elements[0].shadowRoot.elementsFromPoint(x, y);
            newElems = newElems.filter(e => elements[0].shadowRoot.contains(e));
            if (!newElems.length) break;
            elements.unshift(...newElems);
        }
        // TODO: perhaps we should also get elements with "pointer-events: none"
        return elements;
    }

    async function download(msg, ev) {
        let src = msg?.url || getSrc();

        if (PVI.galleryState === 2) {
            let album = PVI.stack[PVI.TRG?.IMGS_album] || [];
            if (album.length) {
                src = album[album[0]]?.[0] || src;
                if (Array.isArray(src)) src = src[0];
            }
        }

        if (!src) return;

        if (ev?.type === "keydown") {
            animate(PVI.DIV, "down");
        }

        if (msg?.alterDownload) {
            try {
                let resp = await fetch(src);
                if (!resp.ok) {
                    resp = await fetch(src, { credentials: "include" });
                }
                if (!resp.ok) {
                    throw new Error(`${resp.status} ${resp.statusText}`);
                }
                resp = await resp.blob();
                msg.url = URL.createObjectURL(resp);
                msg.urlName = src.substr(src.lastIndexOf('/') + 1).split('#')[0].split('?')[0];
                if (platform === "firefox") {
                    msg.blob = resp;
                }

                Port.send(msg);
            } catch(e) {
                alert(_("DOWNLOAD_FAILED") + ": " + (e.message || e));
            }

        } else {
            const topDomain = /^(?:.*\.)?([^./]+\.[^./?#]+)($|\?|\/|#).*/;
            const urlPrefix = /^(https?:\/\/)?(www\.)?/;
            const link = PVI.TRG?.href || PVI.TRG?.IMGS_c || PVI.TRG?.IMGS_c_resolved?.URL || "";

            const pageDomain = win.location.hostname.replace(topDomain, "$1").toLowerCase();
            const linkDomain = link.replace(urlPrefix, "").replace(topDomain, "$1").toLowerCase();
            const fileDomain = src.replace(urlPrefix, "").replace(topDomain, "$1").toLowerCase();

            const type = PVI.isVideo() ? "video" : PVI.CNT.audio ? "audio" : "img";
            Port.send({
                cmd: "download",
                url: src,
                priorityExt: src.match(/#([\da-z]{3,4})$/)?.[1],
                ext: { img: "jpg", video: "mp4", audio: "mp3" }[type],
                filename: PVI.CNT.filename || PVI.VID.filename || PVI.IMG.filename,
                pageDomain,
                linkDomain,
                fileDomain,
            });
        }
    }

    function isVideoUrl(src) {
        return (
            /^[^?#]+\.(?:m(?:4[abprv]|p[34])|og[agv]|flac|webm|mov|mk[av]|f4v|mpd|m3u8)(?:$|[?#])/i.test(src) ||
            /#(mp[34]|og[gv]|webm|video)$/i.test(src)
        )
    }

    const iframes = new Map();
    function findIframe(contentWin) {
        if (!contentWin) return;
        if (iframes.has(contentWin)) {
            return iframes.get(contentWin);
        }

        const iframe = Array.from(document.querySelectorAll("iframe")).find(f => f.contentWindow === contentWin);
        if (iframe) {
            iframes.set(contentWin, iframe);
            return iframe;
        }

        const roots = findRoots(doc);
        for (const root of roots) {
            root.querySelectorAll("iframe").forEach(f => iframes.set(f.contentWindow, f));
            if (iframes.has(contentWin)) {
                return iframes.get(contentWin);
            }
        }
    }

    function findRoots(el) {
        return [...el.querySelectorAll('*')]
            .filter(e => !!e.shadowRoot)
            .flatMap(e => [e.shadowRoot, ...findRoots(e.shadowRoot)]);
    }

    var PVI = {
        TRG: null,
        DIV: null,
        IMG: null,
        CAP: null,
        HLP: doc.createElement("a"),
        anim: {},
        stack: {},
        timers: {},
        resolving: [],
        lastTRGStyle: { cursor: null, outline: null },
        iFrame: false,

        /* state
            -1 - turned off
            0 - uninitialized - PVI.DIV not created
            1 - hidden - PVI.DIV and PVI.LDR are in the DOM, but not displayed
            2 - hiding - PVI.DIV or PVI.LDR is hiding
            3 - loading - PVI.LDR is visible, but PVI.IMG is hidden
            4 - visible - PVI.IMG is visible
        */
        state: null,
        setState: function (state, force) {
            if (PVI.state !== -1 || force) {
                PVI.state = state;
            }
        },

        /* gallery state
            0 - not initialized
            1 - ready, hidden
            2 - visible
        */
        galleryState: 0,

        rgxHTTPs: /^https?:\/\/(?:www\.)?/,
        pageProtocol: win.location.protocol.replace(/^(?!https?:).+/, "http:"),
        palette: {
            load: "rgb(255, 255, 255)",
            R_load: "rgb(255, 204, 204)",
            res: "rgb(222, 255, 205)",
            R_res: "rgb(255, 234, 128)",
            R_js: "rgb(200, 200, 200)",
            pile_fg: "#000",
            pile_bg: "rgb(255, 255, 0)",
        },

        convertSieveRegexes: function () {
            let s = cfg.sieve,
                i;
            if (!Array.isArray(s) || !(i = s.length) || typeof (s[0].link || s[0].img) !== "string") return;
            while (i--) {
                if (s[i].link) s[i].link = RegExp(s[i].link, s[i].ci && s[i].ci & 1 ? "i" : "");
                if (s[i].img) s[i].img = RegExp(s[i].img, s[i].ci && s[i].ci & 2 ? "i" : "");
            }
        },

        create: async function () {
            if (PVI.DIV || PVI.state < 0) return;

            PVI.ROOT = doc.createElement("div");
            PVI.ROOT.classList.add("imagus");
            PVI.ROOT.attachShadow({ mode: "open" });
            doc.documentElement.appendChild(PVI.ROOT);

            var x, y, z, p;
            PVI.HLP = doc.createElement("a");
            PVI.DIV = doc.createElement("div");
            PVI.VID = doc.createElement("video");
            PVI.IMG = doc.createElement("img");
            PVI.CNT = PVI.IMG;
            PVI.LDR = PVI.IMG.cloneNode(false);
            PVI.HVR = doc.createElement("div");
            PVI.GLR = doc.createElement("div");

            await injectCss("content/styles.css")
            await injectCss("", cfg.hz.customCss);

            PVI.DIV.id = "imagus-popup";
            PVI.DIV.IMGS_ = PVI.DIV.IMGS_c = PVI.LDR.IMGS_ = PVI.LDR.IMGS_c = PVI.VID.IMGS_ = PVI.VID.IMGS_c = PVI.IMG.IMGS_ = PVI.IMG.IMGS_c = true;
            PVI.DIV.curdeg = 0;
            PVI.LDR.wh = [35, 35];
            var onLDRLoad = function () {
                this.removeEventListener("load", onLDRLoad, false);
                onLDRLoad = null;
                var x = win.getComputedStyle(this);
                this.wh = [
                    x.width ? parseInt(x.width, 10) : this.naturalWidth || this.wh[0],
                    x.height ? parseInt(x.height, 10) : this.naturalHeight || this.wh[1],
                ];
            };
            PVI.LDR.addEventListener("load", onLDRLoad, false);
            PVI.LDR.alt = "";
            PVI.LDR.id = "imagus-loader";
            PVI.LDR.draggable = false;
            PVI.LDR.style.display = "none";
            PVI.LDR.src =
                "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOng9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWluWU1pbiBub25lIj48Zz48cGF0aCBpZD0icCIgZD0iTTMzIDQyYTEgMSAwIDAgMSA1NS0yMCAzNiAzNiAwIDAgMC01NSAyMCIvPjx1c2UgeDpocmVmPSIjcCIgdHJhbnNmb3JtPSJyb3RhdGUoNzIgNTAgNTApIi8+PHVzZSB4OmhyZWY9IiNwIiB0cmFuc2Zvcm09InJvdGF0ZSgxNDQgNTAgNTApIi8+PHVzZSB4OmhyZWY9IiNwIiB0cmFuc2Zvcm09InJvdGF0ZSgyMTYgNTAgNTApIi8+PHVzZSB4OmhyZWY9IiNwIiB0cmFuc2Zvcm09InJvdGF0ZSgyODggNTAgNTApIi8+PGFuaW1hdGVUcmFuc2Zvcm0gYXR0cmlidXRlTmFtZT0idHJhbnNmb3JtIiB0eXBlPSJyb3RhdGUiIHZhbHVlcz0iMzYwIDUwIDUwOzAgNTAgNTAiIGR1cj0iMS44cyIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiLz48L2c+PC9zdmc+";
            x =
                "display: none; visibility: inherit !important; background: none; position: relative; width: 100%; height: 100%; max-width: inherit; max-height: inherit; margin: 0; padding: 0; border: 0; ";

            PVI.IMG.alt = "";
            PVI.IMG.style.cssText = x + "; image-orientation: initial !important";
            PVI.IMG.classList.add("content");
            PVI.IMG.addEventListener("error", PVI.content_onerror);
            PVI.IMG.addEventListener("load", PVI.content_onload);
            PVI.DIV.appendChild(PVI.IMG);

            PVI.VID.style.display = "none";
            PVI.VID.id = "imagus-videojs";
            PVI.VID.classList.add("content", "video-js");
            PVI.DIV.appendChild(PVI.VID);

            if (cfg.hz.hideIdleCursor >= 50) {
                PVI.DIV.cursor_hide = function () {
                    PVI.CNT.style.cursor = "none";
                    PVI.timers.cursor_hide = null;
                };
                PVI.DIV.addEventListener("mousemove", function (e) {
                    if (!PVI.CNT.contains(e.target) || (PVI.isVideo() && PVI.VIDEOJS.clientHeight - 35 < (e.offsetY || e.layerY || 0))) {
                        clearTimeout(PVI.timers.cursor_hide);
                        return;
                    }
                    if (PVI.timers.cursor_hide) clearTimeout(PVI.timers.cursor_hide);
                    PVI.CNT.style.cursor = "";
                    PVI.timers.cursor_hide = setTimeout(PVI.DIV.cursor_hide, cfg.hz.hideIdleCursor);
                });
                PVI.DIV.addEventListener(
                    "mouseout",
                    function (e) {
                        if (e.target !== PVI.CNT) return;
                        clearTimeout(PVI.timers.cursor_hide);
                        PVI.CNT.style.cursor = "";
                    },
                    false
                );
            } else if (cfg.hz.hideIdleCursor >= 0) PVI.IMG.style.cursor = "none";

            PVI.DIV.addEventListener("mousedown", onMouseDown, true);
            PVI.DIV.addEventListener(
                "dragstart",
                function (e) {
                    pdsp(e, false);
                },
                true
            );

            let docEl = PVI.ROOT.shadowRoot;
            docEl.appendChild(PVI.DIV);
            docEl.appendChild(PVI.LDR);
            PVI.DBOX = {};
            x = win.getComputedStyle(PVI.DIV);

            // temporarely until EXT rule is updated
            PVI.DIV.style.border = x.border;
            PVI.DIV.style.boxShadow = x.boxShadow;

            y = {
                mt: "marginTop",
                mr: "marginRight",
                mb: "marginBottom",
                ml: "marginLeft",
                bt: "borderTopWidth",
                br: "borderRightWidth",
                bb: "borderBottomWidth",
                bl: "borderLeftWidth",
                pt: "paddingTop",
                pr: "paddingRight",
                pb: "paddingBottom",
                pl: "paddingLeft",
            };
            for (z in y) {
                if (z[0] === "m") PVI.DBOX[z] = parseInt(x[y[z]], 10);
                if (z[1] === "t" || z[1] === "b") {
                    p = z[1] + (z[0] === "p" ? "p" : "bm");
                    PVI.DBOX[p] = (PVI.DBOX[p] || 0) + parseInt(x[y[z]], 10);
                }
                p = (z[1] === "l" || z[1] === "r" ? "w" : "h") + (z[0] === "m" ? "m" : "pb");
                PVI.DBOX[p] = (PVI.DBOX[p] || 0) + parseInt(x[y[z]], 10);
            }
            PVI.anim = {
                maxDelay: 0,
                opacityTransition: function () {
                    PVI.BOX.style.opacity = PVI.BOX.opacity || "1";
                },
            };
            y = "transition";
            if (x[y + "Property"]) {
                p = /,\s*/;
                p = [x[y + "Property"].split(p), x[y + "Duration"].replace(/initial/g, "0s").split(p)];
                PVI.anim.css = x[y] || PVI.DIV.style[y];
                ["opacity", "left", "top", "width", "height"].forEach(function (el) {
                    var idx = p[0].indexOf(el),
                        val = parseFloat(p[1][idx]) * 1e3;
                    if (val > 0 && idx > -1) {
                        PVI.anim[el] = val;
                        if (val > PVI.anim.maxDelay) PVI.anim.maxDelay = val;
                        if (el === "opacity" && x.opacity) PVI.DIV.opacity = "" + Math.max(0.01, x.opacity);
                    }
                });
            }
            if (cfg.hz.capText || cfg.hz.capWH) PVI.createCAP();
            if (doc.querySelector("embed, object")) {
                PVI.DIV.insertBefore(doc.createElement("iframe"), PVI.DIV.firstElementChild);
                PVI.DIV.firstChild.style.cssText = "z-index: -1; width: 100%; height: 100%; position: absolute; left: 0; top: 0; border: 0";
            }

            // mark over the hovered object
            PVI.HVR.id = "imagus-hover";
            PVI.HVR.style.cssText = `display: none;`;
            docEl.appendChild(PVI.HVR);

            // gallery container
            PVI.GLR.id = 'imagus-gallery';
            PVI.GLR.classList.add("content");
            PVI.GLR.style.display = 'none';
            PVI.DIV.appendChild(PVI.GLR);
            PVI.GLR.addEventListener('mousedown', pdsp, true);
            PVI.GLR.addEventListener('click', PVI.galleryClick, true);

            // create popup toolbar
            const BOTTONS = {
                "X": { tag: "button", text: "≡", attrs: { "data-action": "hide", title: _("HIDE_TOOLBAR") }, nodes: [
                    { tag: "span", text: "≡" },
                    { tag: "span", text: "⨉" },
                ]},
                "S": { tag: "button", text: "S", attrs: { "data-action": "download", title: _("SAVE") } },
                "O": { tag: "button", text: "O", attrs: { "data-action": "open", title: _("OPEN_IN_NEW_TAB") } },
                "C": { tag: "button", text: "C", attrs: { "data-action": "copy", title: _("COPY_URL") } },
                "T": { tag: "button", text: "T", attrs: { "data-action": "copy_caption", title: _("COPY_CAPTION") } },
                "G": { tag: "button", text: "G", attrs: { "data-action": "gallery", title: _("GALLERY") } },
                "I": { tag: "button", text: "#", attrs: { "data-action": "goto", title: _("GOTO_SEARCH") } },
                "R": { tag: "button", text: "↻", attrs: { "data-action": "rotate", title: _("ROTATE_RIGHT") } },
                "P": { tag: "button", text: "P", attrs: { "data-action": "preferences", title: _("PREFERENCES") } },
            };
            const btns = cfg.hz.toolbarButtons.toUpperCase().split("").map(b => BOTTONS[b] || null).filter(Boolean);
            buildNodes(PVI.DIV, [{
                tag: "div",
                attrs: { id: "imagus-toolbar", "data-mode": cfg.hz.toolbar },
                nodes: btns,
            }]);
            PVI.TBAR = PVI.DIV.querySelector("#imagus-toolbar");
            PVI.TBAR.addEventListener("click", PVI.tbarClick);
            PVI.TBAR.addEventListener("mousedown", PVI.tbarClick);

            PVI.reset();
        },

        openVideojs: async function(src) {
            // if called multiple times while Videojs still loading then only the newest `src` will be opened
            PVI.onVideojsReady = () => {
                PVI.onVideojsReady = null;
                PVI.CNT = PVI.VIDEOJS;
                PVI.VIDEOJS.IMGS_src = src;
                PVI.PLAYER.src({
                    src: src.split('#')[0],
                    type: /(#mp4|\.(f4v|mka|mp4)($|\?))/i.test(src) ? 'video/mp4' :
                        /(#mp3|\.(wav))$/i.test(src) ? 'audio/mp3' :
                        undefined
                });
            };

            if (PVI.VIDEOJS) {
                PVI.onVideojsReady?.();
                return;
            }

            if (PVI.videojsLoading) {
                return;
            }
            PVI.videojsLoading = true;

            PVI.VID.style.display = "";
            injectCss("lib/videojs_mod.css");
            await injectJs("lib/videojs_mod.js");
            const playerOptions = {
                autoplay: cfg.hz.autoplay ? "any" : false,
                muted: false,
                controls: cfg.hz.hideControlsDelay >= 0,
                experimentalSvgIcons: true,
                liveui: true,
                playbackRates: [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2],
                loop: cfg.hz.mediaLoop === "always" || cfg.hz.mediaLoop === "default",
                preload: "auto",
                inactivityTimeout: cfg.hz.hideControlsDelay,
                plugins: {},
                // volume slider orientation, set by the "Volume control orientation" option
                controlBar: {
                    volumePanel: {
                        inline: cfg.hz.mediaVolOrient === "horizontal"
                    }
                },
                html5: {
                    vhs: {
                        // VideoJs will select an optimal quality for the given dimensions
                        bandwidth: 100 * 1024 * 1024, // 100 Mbps
                        useDevicePixelRatio: true,
                        overrideNative: true,
                        enableLowInitialPlaylist: false,
                        useNetworkInformationApi: false,
                    },
                    nativeAudioTracks: false,
                    nativeVideoTracks: false,
                },
            };

            // videojs.log.level('all');
            videojs.log.history.disable();
            videojs(PVI.VID, playerOptions, () => {
                PVI.VIDEOJS = PVI.VID.parentElement;
                PVI.VIDEOJS.classList.add("content");
                PVI.PLAYER = videojs.getPlayer(PVI.VID) || PVI.VIDEOJS.player;
                const qLevels = PVI.PLAYER.qualityLevels();
                const mqSelector = PVI.PLAYER.maxQualitySelector({
                    autoLabel: "Auto ",
                    disableAuto: true,
                    displayMode: 1,
                    defaultQuality: 0,
                    filterDuplicateHeights: false,
                    filterDuplicates: false,
                    showBitrates: true
                });

                const setSize = (width, height) => {
                    if (!PVI.PLAYER.isFullscreen() && width && height) {
                        PVI.setPlayerSize(width, height);
                    }
                }

                PVI.PLAYER.on("loadstart", () => {
                    PVI.PLAYER.muted(false);
                });

                PVI.PLAYER.on("loadedmetadata", e => {
                    // select original audio
                    for (let aud of PVI.PLAYER.audioTracks()?.tracks_ || []) {
                        if (aud?.id?.toLowerCase().includes("original")) {
                            aud.enabled = true;
                            break;
                        }
                    }

                    if (cfg.hz.mediaLoop === "default") {
                        PVI.PLAYER.loop(PVI.PLAYER.duration() < 60);
                    }

                    if (PVI.TRG?.IMGS_MEDIA?.nodeName === "VIDEO") {
                        const vid = PVI.TRG.IMGS_MEDIA;
                        // pause the hovered video if it is not muted
                        if (!(vid.attributes?.muted || vid.muted || vid.volume === 0)) {
                            PVI.TRG.IMGS_MEDIA.pause();
                        }
                        const totalTime = vid.duration || 0;
                        let curTime = vid.currentTime || 0;
                        curTime = curTime < totalTime * 0.9 ? curTime : 0;
                        PVI.PLAYER.currentTime(curTime);
                    }

                    PVI.content_onready(e);
                    PVI.updateCaption(e);

                    PVI.PLAYER._isAudio = PVI.PLAYER.videoHeight() === 0;
                    PVI.PLAYER.audioPosterMode(PVI.PLAYER._isAudio);
                    PVI.PLAYER.poster(!PVI.PLAYER._isAudio ? "" :
                        `data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTAwIDc1IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNzUiIGZpbGw9IiNmZmYiLz48cGF0aCBkPSJtMjkuNzYgMThoMi41MTg2djAuODE1MDNjNi4zMDI1IDEuMzkzOCA3LjAyMjcgNC4zMzExIDMuMzY4OSA4LjkzNzggMC4zODY1My00LjU3OTEtMC4wODk1MS01LjU1OTUtMy4zNjg5LTUuNzcyMnYxMS41NzZhMS40NzI5IDEuNDI1MyAwIDAgMSAwIDAuMTg1MDZjMCAxLjUwNDEtMS42Mjc1IDIuOTk2My0zLjY0MTYgMy4zMzQ5cy0zLjYzNzUtMC42MTAyOS0zLjYzNzUtMi4xMTgzYzAtMi4wNTE0IDIuOTEzMi0zLjgzNSA0Ljc2MDUtMy4yMDV6bTM3LjE0OCAwaDIuNTE4NnYwLjgxNTAzYzYuMjk4NSAxLjM5MzggNy4wMTg2IDQuMzMxMSAzLjM2NDkgOC45Mzc4IDAuNDA2ODgtNC41NzkxLTAuMDg5NTEtNS41NTk1LTMuMzY0OS01Ljc3MjJ2MTEuNTc2IDAuMTg1MDZjMCAxLjUwNDEtMS42Mjc1IDIuOTk2My0zLjY2MTkgMy4zMzQ5LTIuMDM0NCAwLjMzODYxLTMuNjYxOS0wLjYxMDI5LTMuNjYxOS0yLjExODMgMC0yLjA1MTQgMi45MTMyLTMuODM1IDQuNzYwNS0zLjIwNXYtMTMuNzUzem0tMTMuMjE5IDI3LjAyNmE0LjU4MTQgNC40MzM1IDAgMCAxIDEuODMwOSAwLjAzMTV2LTEyLjQzOGwtMTMuNjAyIDMuNzc1OXEwIDcuMzQ3MSAwIDE0LjY4NmMwIDIuMjkxNS0yLjYxMjIgMy45NjEtNC43MDc2IDQuMzMxMS0yLjU5OTkgMC40MzMxMS00LjcxMTYtMC43ODc0Ny00LjcxMTYtMi43NTYyczIuMTIzOS0zLjg3NDQgNC43MDc2LTQuMzA3NWE1LjI4OTQgNS4xMTg2IDAgMCAxIDIuNjQwNiAwLjE2NTM3di0xNy43ODFsMTcuNzE1LTMuOTAxOXYyMC4wMzNjMC4xOTUzIDIuMTI2Mi0yLjAzNDQgMy43MzY2LTMuODg5NyA0LjA0NzYtMi4xNzI3IDAuMzYyMjQtMy45MzA0LTAuNjYxNDgtMy45MzA0LTIuMjg3NiAwLTEuNjI2MSAxLjc1NzctMy4yMzY1IDMuOTMwNC0zLjU5ODd6Ii8+PC9zdmc+`,
                    );
                    const controlsTimeout = PVI.PLAYER._isAudio ? 0 : cfg.hz.hideControlsDelay;
                    PVI.PLAYER.controls(PVI.PLAYER._isAudio || cfg.hz.hideControlsDelay >= 0);
                    PVI.PLAYER.options({
                        inactivityTimeout: controlsTimeout,
                    });
                    PVI.PLAYER.cache_.inactivityTimeout = controlsTimeout;
                    PVI.PLAYER.userActive(false);
                });

                PVI.PLAYER.on("error", PVI.content_onerror);

                qLevels.on("change", () => {
                    const level = qLevels[qLevels.selectedIndex];
                    setSize(level.width, level.height);
                });

                PVI.PLAYER.on("playing", () => {
                    PVI.PLAYER.controls(PVI.PLAYER._isAudio || cfg.hz.hideControlsDelay >= 0);
                    PVI.PLAYER.options({
                        inactivityTimeout: PVI.PLAYER._isAudio ? 0 : cfg.hz.hideControlsDelay,
                    });
                    PVI.PLAYER.userActive(true);
                });

                PVI.PLAYER.on("pause", () => {
                    PVI.PLAYER.controls(true);
                });

                PVI.PLAYER.on("resize", () => {
                    const vWidth = PVI.PLAYER.videoWidth();
                    const vHeight = PVI.PLAYER.videoHeight();
                    PVI.PLAYER.width(vWidth);
                    PVI.PLAYER.height(vHeight);
                    setSize(vWidth, vHeight);
                });
                PVI.PLAYER.on("fullscreenchange", () => {
                    if (!mqSelector.selectedIndexPrevious) {
                        mqSelector.selectedIndexPrevious = mqSelector.selectedIndex;
                        mqSelector.options.disableAuto = false;
                        mqSelector.changeLevel(-1); // auto
                    } else {
                        mqSelector.changeLevel(mqSelector.selectedIndexPrevious);
                        delete mqSelector.selectedIndexPrevious;
                    }
                });
                PVI.PLAYER.on("timeupdate", PVI.updateCaption);

                PVI.PLAYER.volume(cfg.hz.mediaVolume / 100);

                PVI.videojsLoading = false;
                PVI.onVideojsReady?.();
            });
        },

        setPlayerSize: function(width, height) {
            PVI.VIDEOJS.naturalWidth = width || PVI.PLAYER.videoWidth();
            PVI.VIDEOJS.naturalHeight = height ||  PVI.PLAYER.videoHeight();
            PVI.onWinResize();
        },

        createCAP: function () {
            if (PVI.CAP) return;
            PVI.CAP = doc.createElement("div");
            PVI.CAP.id = "imagus-caption";
            buildNodes(PVI.CAP, [
                { tag: "b", attrs: { style: "display: none;" } },
                { tag: "b", attrs: { style: `display: ${cfg.hz.capWH ? "inline-block" : "none"}` } },
                { tag: "b", attrs: { class: "time", style: "display: none;" } },
                { tag: "b", attrs: { class: "side" } },
                { tag: "span", attrs: { style: "color: inherit; display: " + (cfg.hz.capText ? "inline-block" : "none") } },
            ]);
            PVI.CAP_TIME = PVI.CAP.children[2];
            var e = PVI.CAP.firstElementChild;
            do {
                e.IMGS_ = e.IMGS_c = true;
            } while ((e = e.nextElementSibling));
            PVI.CAP.IMGS_ = PVI.CAP.IMGS_c = true;
            PVI.create();
            e = cfg.hz.capStyle;
            PVI.palette.wh_fg = e ? "rgb(100, 0, 0)" : "rgb(204, 238, 255)";
            PVI.palette.wh_fg_hd = e ? "rgb(255, 0, 0)" : "rgb(120, 210, 255)";
            PVI.CAP.style.cssText = `white-space: ${cfg.hz.capWrapByDef ? "pre-line" : "nowrap"};`;
            e = cfg.hz.capPos ? "bottom" : "top";
            const capShift = cfg.hz.capOver ? 0 : -18;
            PVI.CAP.overhead = Math.max(capShift, Math.min(0, PVI.DBOX[e[0] + "p"] + capShift));
            PVI.CAP.style[e] = PVI.CAP.overhead + "px";
            PVI.CAP.overhead = Math.max(0, -PVI.CAP.overhead - PVI.DBOX[e[0] + "bm"]);

            PVI.CAP.classList.toggle("bottom", cfg.hz.capPos === 1);
            PVI.CAP.classList.toggle("outside", !cfg.hz.capOver);
            PVI.CAP.classList.toggle("light", cfg.hz.capStyle === 1);
            PVI.DIV.appendChild(PVI.CAP);
        },

        prepareCaption: function (trg, caption) {
            if (caption && typeof caption === "string") {
                if (caption.includes("<")) {
                    caption = caption.replace(/<[^>]+>/g, "");
                }
                if (caption.includes("&")) {
                    PVI.domParser = PVI.domParser || new win.DOMParser();
                    caption = PVI.domParser.parseFromString(caption, "text/html").body.textContent || "";
                }
                trg.IMGS_caption = caption.trim().replace(/[\n\r]+/g, " ");
            } else trg.IMGS_caption = "";
        },

        getCapHeight() {
            return PVI.CAP?.overhead &&
                   !(PVI.DIV.curdeg % 360) &&
                   PVI.CAP.state !== 0 &&
                   (PVI.CAP.state === 2 || (PVI.TRG?.IMGS_caption && cfg.hz.capText) || PVI.TRG?.IMGS_album || cfg.hz.capWH)
                       ? PVI.CAP.overhead
                       : 0;
        },

        flash_caption: function () {
            PVI.timers.pileflicker = 0;
            PVI.timers.pile_flash = setInterval(PVI.flick_caption, 150);
        },

        flick_caption: function () {
            if (PVI.timers.pileflicker++ >= cfg.hz.capFlashCount * 2) {
                PVI.timers.pileflicker = null;
                clearInterval(PVI.timers.pile_flash);
                return;
            }
            var s = PVI.CAP.firstChild.style;
            s.backgroundColor = s.backgroundColor === PVI.palette.pile_bg ? "red" : PVI.palette.pile_bg;
        },

        updateCaption: function (e, width, height) {
            var c = PVI.CAP,
                h;
            if (!c || c.state === 0 || !PVI.TRG) return;

            if (e?.type === "timeupdate" || e?.type === "loadedmetadata") {
                // display video remaining time
                if (PVI.PLAYER.duration()) {
                    let remain = Math.floor(PVI.PLAYER.duration() - PVI.PLAYER.currentTime());
                    if (Number.isFinite(remain) && (PVI.PLAYER._remain !== remain || e.type === "loadedmetadata")) {
                        PVI.PLAYER._remain = remain;
                        const text = `[-${Math.floor(remain / 60)}:${('0' + (remain % 60)).slice(-2)}]`;
                        PVI.CAP_TIME.textContent = text;
                        PVI.CAP_TIME.style.display = "inline-block";
                    }
                }
                return;
            }

            if (PVI.TRG?.IMGS_album)
                if (c.firstChild.style.display === "none" && (h = PVI.stack[PVI.TRG.IMGS_album]) && h[2]) {
                    h = c.firstChild.style;
                    h.color = PVI.palette.pile_fg;
                    h.backgroundColor = PVI.palette.pile_bg;
                    h.display = "inline-block";
                    if (cfg.hz.capFlashCount) {
                        if (cfg.hz.capFlashCount > 5) cfg.hz.capFlashCount = 5;
                        clearTimeout(PVI.timers.pile_flash);
                        PVI.timers.pile_flash = setTimeout(PVI.flash_caption, PVI.anim.maxDelay);
                    }
                }
            if (PVI.CNT !== PVI.IFR) {
                h = c.children[1];
                if (cfg.hz.capWH || c.state === 2) {
                    h.style.display = "inline-block";
                    h.style.color = PVI.palette[PVI.TRG.IMGS_HD === false ? "wh_fg_hd" : "wh_fg"];
                    h.textContent = (PVI.TRG.IMGS_SVG ? PVI.stack[PVI.IMG.src] : [PVI.CNT.naturalWidth, PVI.CNT.naturalHeight]).join("×");
                    const scale = Math.round((height || PVI.CNT.offsetHeight) / PVI.CNT.naturalHeight * 100);
                    if (scale !== 100 && Number.isFinite(scale) && PVI.galleryState < 2) {
                        h.textContent += ` (${scale}%)`;
                    }
                } else h.style.display = "none";
            }

            h = c.lastChild;
            if (cfg.hz.capText || c.state === 2) {
                h.textContent = PVI.TRG.IMGS_caption || "";
                h.style.display = "inline";
            } else h.style.display = "none";
            c.style.display = PVI.DIV.curdeg % 360 ? "none" : "block";
        },

        attrObserver: function (target, isStyle, oldValue) {
            if (isStyle) {
                var bgImage = target.style.backgroundImage;
                if (
                    (!bgImage || oldValue.indexOf(bgImage.slice(5, -2)) !== -1) &&
                    oldValue &&
                    oldValue.indexOf("opacity") === -1 &&
                    target.style.cssText.indexOf("opacity") === -1
                )
                    return;
            }
            PVI.resetNode(target);
        },

        onAttrChange: function (e) {
            if (e.attrChange !== 1) return;
            var target = e.target;
            switch (e.attrName) {
                case "style":
                    var bgImg = target.style.backgroundImage;
                    if (
                        (!bgImg || e.prevValue.indexOf(bgImg.slice(5, -2)) !== -1) &&
                        e.prevValue.indexOf("opacity") === -1 &&
                        target.style.cssText.indexOf("opacity") === -1
                    )
                        return;
                // eslint-disable-next-line no-fallthrough
                case "href":
                case "src":
                case "title":
                case "alt":
                    if (target === PVI.TRG) PVI.nodeToReset = target;
                    else PVI.resetNode(target);
            }
            e.stopPropagation();
        },

        listen_attr_changes: function (node) {
            PVI.mutObserver?.observe(node, PVI.mutObserverConf);
        },

        resetAllNodes: function () {
            const nodes = doc.querySelectorAll('a, img[src], :not(img)[style*="background-image"], a, b, i, u, strong, em, span, div, button');
            nodes.forEach(function (el) {
                if (el.IMGS_c !== undefined || el.IMGS_c_resolved !== undefined) {
                    PVI.resetNode(el);
                }
            });
        },

        resetNode: function (node, keepAlbum) {
            delete node.IMGS_c;
            delete node.IMGS_c_resolved;
            delete node.IMGS_thumb;
            delete node.IMGS_thumb_ok;
            delete node.IMGS_SVG;
            delete node.IMGS_HD;
            delete node.IMGS_HD_stack;
            delete node.IMGS_fallback_zoom;
            delete node.IMGS_ext;
            if (!keepAlbum) delete node.IMGS_album;
            if (node.localName !== "a") return;
            var childNodes = node.querySelectorAll('img[src], :not(img)[style*="background-image"], b, i, u, strong, em, span, div, button');
            if (childNodes.length)
                [].forEach.call(childNodes, function (el) {
                    if (el.IMGS_c) PVI.resetNode(el);
                });
        },

        getImages: function (el) {
            var imgs, p;
            var isHTMLElement = el && el instanceof win.HTMLElement;
            if (isHTMLElement)
                if (el.childElementCount > 0 && el.childElementCount < 3) {
                    imgs = el.firstElementChild;
                    if (imgs.childElementCount && imgs.childElementCount < 4)
                        if (imgs.firstElementChild.localName === "img") imgs = imgs.firstElementChild;
                        else if (imgs.lastElementChild.localName === "img") imgs = imgs.lastElementChild;
                    if (imgs.src && !/\S/.test(el.textContent) && el.offsetWidth - imgs.offsetWidth < 25 && el.offsetHeight - imgs.offsetHeight < 25) el = imgs;
                } else if (
                    !el.childElementCount &&
                    el.parentNode.childElementCount <= 5 &&
                    (el.localName === "img"
                        ? el.src.lastIndexOf("data:", 0) === 0 || el.naturalWidth < 3 || el.naturalHeight < 3 || el.style.opacity === "0"
                        : !/\S/.test(el.textContent)) &&
                    !PVI.getBgUrl(el.style.backgroundImage)
                ) {
                    p = el.previousElementSibling;
                    [p && p.previousElementSibling, p, el.nextElementSibling].some(function (sib) {
                        if (
                            sib &&
                            sib.localName === "img" &&
                            sib.offsetParent === el.offsetParent &&
                            Math.abs(sib.offsetLeft - el.offsetLeft) <= 10 &&
                            Math.abs(sib.offsetTop - el.offsetTop) <= 10 &&
                            Math.abs(sib.clientWidth - el.clientWidth) <= 30 &&
                            Math.abs(sib.clientHeight - el.clientHeight) <= 30
                        ) {
                            el = sib;
                            return true;
                        }
                    });
                }
            if (el.clientWidth > topWinW * 0.8 && el.clientHeight > topWinH * 0.8) return null;
            imgs = { imgSRC_o: el.currentSrc || el.src || el.data || null };
            if (!imgs.imgSRC_o && el.localName === "image") {
                imgs.imgSRC_o = el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
                if (imgs.imgSRC_o) imgs.imgSRC_o = PVI.normalizeURL(imgs.imgSRC_o);
                else delete imgs.imgSRC_o;
            }
            if (imgs.imgSRC_o) {
                if (!isHTMLElement) imgs.imgSRC_o = PVI.normalizeURL(imgs.imgSRC_o);
                else if ((el.naturalWidth > 0 && el.naturalWidth < 3) || (el.naturalHeight > 0 && el.naturalHeight < 3)) imgs.imgSRC_o = null;
                if (imgs.imgSRC_o) imgs.imgSRC = imgs.imgSRC_o.replace(PVI.rgxHTTPs, "");
            }
            if (!isHTMLElement) return imgs.imgSRC ? imgs : null;
            imgs.imgBG_o = PVI.getBgUrl(el.style.backgroundImage);
            if (!imgs.imgBG_o && el.parentNode) {
                p = el.parentNode;
                const bgUrl = PVI.getBgUrl(p.style?.backgroundImage);
                if (p.offsetParent === el.offsetParent && bgUrl &&
                    Math.abs(p.offsetLeft - el.offsetLeft) <= 10 &&
                    Math.abs(p.offsetTop - el.offsetTop) <= 10 &&
                    Math.abs(p.clientWidth - el.clientWidth) <= 30 &&
                    Math.abs(p.clientHeight - el.clientHeight) <= 30
                ) {
                    imgs.imgBG_o = bgUrl;
                }
            }
            if (!imgs.imgBG_o) return imgs.imgSRC ? imgs : null;
            imgs.imgBG_o = imgs.imgBG_o.match(/\burl\(([^'")][^)]*|"[^"\\]+(?:\\.[^"\\]*)*|'[^'\\]+(?:\\.[^'\\]*)*)(?=['"]?\))/g);
            if (!imgs.imgBG_o || imgs.imgBG_o.length !== 1) return imgs.imgSRC ? imgs : null;
            el = imgs.imgBG_o[0];
            imgs.imgBG_o = PVI.normalizeURL(el.slice(/'|"/.test(el[4]) ? 5 : 4));
            imgs.imgBG = imgs.imgBG_o.replace(PVI.rgxHTTPs, "");
            return imgs;
        },

        _replace: function (rule, addr, http, param, to, trg) {
            var ret, i;
            if (typeof to === "function") PVI.node = trg;
            var r = to ? addr.replace(rule[param], to) : addr;
            if (typeof to === "function") {
                if (r === "") return 2;
                else if (r === "null") return null;
                if (r.indexOf("\n", 7) > -1) {
                    var prefixSuffix = addr.replace(rule[param], "\r").split("\r");
                    r = r.trim().split(/[\n\r]+/g);
                    ret = [];
                    for (i = 0; i < r.length; ++i) {
                        if (i > 0) r[i] = prefixSuffix[0] + r[i];
                        if (i !== r.length - 1) r[i] += prefixSuffix[1];
                        r[i] = PVI._replace(rule, r[i], http, param, "", trg);
                        if (Array.isArray(r[i])) ret = ret.concat(r[i]);
                        else ret.push(r[i]);
                    }
                    return ret.length > 1 ? ret : ret[0];
                }
            }
            if (rule.dc && ((param === "link" && rule.dc !== 2) || (param === "img" && rule.dc > 1))) r = decodeURIComponent(decodeURIComponent(r));
            if (to[0] === "#" && r[0] !== "#") r = "#" + r.replace("#", "");
            r = PVI.httpPrepend(r, http);
            ret = r.indexOf("#", 1);
            if (ret > 1 && (ret = [ret, r.indexOf("#", ret + 1)])[1] > 1) {
                ret = r.slice(ret[0], ret[1] + 1);
                r = r.split(ret).join("#");
                ret = ret.slice(1, -1).split(/ |%20/);
            } else ret = false;
            if (ret) {
                if (r[0] === "#") {
                    r = r.slice(1);
                    addr = "#";
                } else addr = "";
                for (i = 0; i < ret.length; ++i) ret[i] = addr + r.replace("#", ret[i]);
                r = ret.length > 1 ? ret : ret[0];
            }
            return r;
        },
        replace: function (rule, addr, http, param, trg) {
            var ret, i, j;
            if (PVI.toFunction(rule, "to") === false) return 1;
            if (trg.IMGS_TRG) trg = trg.IMGS_TRG;
            http = http.slice(0, http.length - addr.length);
            if (Array.isArray(rule.to)) {
                ret = [];
                for (i = 0; i < rule.to.length; ++i) {
                    j = PVI._replace(rule, addr, http, param, rule.to[i], trg);
                    if (Array.isArray(j)) ret = ret.concat(j);
                    else ret.push(j);
                }
            } else if (rule.to) ret = PVI._replace(rule, addr, http, param, rule.to, trg);
            else ret = PVI.httpPrepend(addr, http);
            return ret;
        },

        toFunction: function (rule, param, inline) {
            if (typeof rule[param] !== "function" && (inline ? /^:\s*\S/ : /^:\n\s*\S/).test(rule[param])) {
                try {
                    rule[param] = Function(
                        (cfg.hz.debugRules ? "debugger;\n" : "") +
                        "var $ = arguments; " +
                        (inline ? "return " : "") +
                        rule[param].slice(1)
                    ).bind(PVI);
                } catch (ex) {
                    console.error(cfg.app?.name + ": " + param + " - " + ex.message);
                    return false;
                }
            }
        },

        httpPrepend: function (url, preDomain) {
            if (preDomain) url = url.replace(/^(?!#?(?:https?:|\/\/|data:)|$)(#?)/, "$1" + preDomain);
            if (url[1] === "/")
                if (url[0] === "/") url = PVI.pageProtocol + url;
                else if (url[0] === "#" && url[2] === "/") url = "#" + PVI.pageProtocol + url.slice(1);
            return url;
        },

        normalizeURL: function (url) {
            if (url[1] === "/" && url[0] === "/") url = PVI.pageProtocol + url;
            PVI.HLP.href = url;
            return PVI.HLP.href;
        },

        getBgUrl: function(str) {
            return /.*(url\(['"]?([^)]*?)['"]?\))/.exec(str)?.[1];
        },

        resolve: function (URL, rule, trg, nowait) {
            if (!trg || trg.IMGS_c) return false;
            if (trg.IMGS_c_resolved && typeof trg.IMGS_c_resolved.URL !== "string") return false;
            URL = URL.replace(rgxHash, "");
            if (PVI.stack[URL]) {
                trg.IMGS_album = URL;
                URL = PVI.stack[URL];
                return URL[URL[0]][0];
            }
            var params, i;
            if (rule.rule) {
                params = rule;
                rule = params.rule;
            } else {
                params = {};
                i = 0;
                while (i < rule.$.length) params[i] = rule.$[i++];
                params.length = rule.$.length;
                delete rule.$;
                params.rule = rule;
            }
            if (cfg.sieve[rule.id].res === 1) rule.req_res = true;
            else if (rule.skip_resolve)
                if (typeof cfg.sieve[rule.id].res === "function") {
                    params.url = [URL];
                    return PVI.onMessage({ cmd: "resolved", id: -1, m: false, return_url: true, params: params });
                } else delete rule.skip_resolve;
            if (!cfg.hz.waitHide && ((PVI.fireHide && PVI.state > 2) || PVI.state === 2 || (PVI.hideTime && Date.now() - PVI.hideTime < 200))) nowait = true;
            if (!PVI.resolve_delay) clearTimeout(PVI.timers.resolver);
            trg.IMGS_c_resolved = { URL: URL, params: params };
            PVI.timers.resolver = setTimeout(function () {
                PVI.timers.resolver = null;
                Port.send({ cmd: "resolve", url: URL, params: params, id: PVI.resolving.push(trg) - 1 });
            }, PVI.resolve_delay || (nowait ? 50 : Math.max(50, cfg.hz.delay)));
            return null;
        },

        find: function (trg, x, y, srcOnly) {
            var i = 0,
                n = trg,
                ret = false,
                URL,
                rule,
                imgs,
                use_img,
                tmp_el,
                attrModNode;
            do {
                if (n.nodeType !== undefined)
                    if (n.nodeType !== 1 || n === doc.body) break;
                    else if (n.localName !== "a" && i < 4) continue;
                if (!n.href && n.localName === "a") {
                    if (n.href === "") PVI.listen_attr_changes(n);
                    break;
                }
                n.href ||= "";
                if (n instanceof win.HTMLElement) {
                    if (n.childElementCount && n.querySelector("iframe, object, embed")) break;
                    if (typeof x === "number" && typeof y === "number") {
                        tmp_el = getElementsFromPoint(x, y);
                        for (i = 0; i < 5; ++i) {
                            if (!tmp_el[i] || tmp_el[i] === doc.body) break;
                            if (!tmp_el[i].currentSrc && tmp_el[i].style.backgroundImage.lastIndexOf("url(", 0) !== 0) continue;
                            var elRect = tmp_el[i].getBoundingClientRect();
                            if (x >= elRect.left && x < elRect.right && y >= elRect.top && y < elRect.bottom) {
                                var trgRect = trg.getBoundingClientRect();
                                if (
                                    trgRect.left - 10 <= elRect.left &&
                                    trgRect.right + 10 >= elRect.right &&
                                    trgRect.top - 10 <= elRect.top &&
                                    trgRect.bottom + 10 >= elRect.bottom
                                )
                                    imgs = PVI.getImages(tmp_el[i], true);
                            }
                            if (PVI.TRG) PVI.TRG.IMGS_MEDIA = tmp_el[i];
                            break;
                        }
                    }
                    if (tmp_el) tmp_el = null;
                    attrModNode = n;
                } else {
                    if (n.getAttributeNS) {
                        tmp_el = n.getAttributeNS("http://www.w3.org/1999/xlink", "href");
                        if (!tmp_el) continue;
                        n = { href: tmp_el };
                    }
                    n.href = PVI.normalizeURL(n.href);
                }
                URL = n.href.replace(PVI.rgxHTTPs, "");
                if (imgs && (URL === imgs.imgSRC || URL === imgs.imgBG)) break;
                for (i = 0; (rule = cfg.sieve[i]); ++i) {
                    if (!(rule.link && rule.link.test(URL))) {
                        if (!rule.img) continue;
                        tmp_el = rule.img.test(URL);
                        if (tmp_el) use_img = true;
                        else continue;
                    }
                    if (rule.useimg && rule.img) {
                        if (!imgs) imgs = PVI.getImages(trg);
                        if (imgs) {
                            if (imgs.imgSRC && rule.img.test(imgs.imgSRC)) {
                                use_img = [i, false];
                                break;
                            }
                            if (imgs.imgBG) {
                                use_img = rule.img.test(imgs.imgBG);
                                if (use_img) {
                                    use_img = [i, use_img];
                                    break;
                                }
                            }
                        }
                    }

                    if (cfg.hz.debugRules) {
                        console.log(`Rule ${i} matched:`, { url: URL, element: trg, image: imgs?.imgSRC || imgs?.imgBG });
                    }

                    const urlToIgnore = URL || imgs?.imgSRC || imgs?.imgBG;
                    if (srcOnly) return urlToIgnore;
                    if (isUrlIgnored(urlToIgnore)) return false;

                    if (rule.res && (!tmp_el || (!rule.to && rule.url))) {
                        if (win.location.href.replace(rgxHash, "") === n.href.replace(rgxHash, "")) break;
                        if (PVI.toFunction(rule, "url", true) === false) return 1;
                        if (typeof rule.url === "function") PVI.node = trg;
                        ret = rule.url ? URL.replace(rule[tmp_el ? "img" : "link"], rule.url) : URL;
                        ret = PVI.resolve(
                            PVI.httpPrepend(ret || URL, n.href.slice(0, n.href.length - URL.length)),
                            {
                                id: i,
                                $: [n.href].concat((URL.match(rule[tmp_el ? "img" : "link"]) || []).slice(1)),
                                loop_param: tmp_el ? "img" : "link",
                                skip_resolve: ret === "",
                            },
                            trg.IMGS_TRG || trg
                        );
                    } else ret = PVI.replace(rule, URL, n.href, tmp_el ? "img" : "link", trg);
                    if (ret === 1) return 1;
                    else if (ret === 2) ret = false;
                    if (
                        typeof ret === "string" &&
                        n !== trg &&
                        /* access the attribute directly because src property could be missed in custom media elements (new reddit for example)
                        trg.hasAttribute("src") &&
                        trg.src.replace(/^https?:\/\//, "") === ret.replace(/^#?(https?:)?\/\//, "") */
                        trg.attributes.src?.value?.replace(/^https?:\/\//, "") === ret.replace(/^#?(https?:)?\/\//, "")
                    )
                        ret = false;
                    break;
                }
                break;
            } while (++i < 5 && (n = n.parentNode));
            if (!ret && ret !== null) {
                imgs = PVI.getImages(trg) || imgs;
                if (imgs && (imgs.imgSRC || imgs.imgBG)) {
                    if (typeof use_img === "object") {
                        i = use_img[0];
                        use_img[0] = true;
                    } else {
                        i = 0;
                        use_img = [];
                    }
                    for (; (rule = cfg.sieve[i]); ++i) {
                        let mImg = "";
                        if (
                            use_img[0] ||
                            (rule.img && (
                                (imgs.imgSRC && rule.img.test(imgs.imgSRC) && (mImg = imgs.imgSRC)) ||
                                (imgs.imgBG && (use_img[1] = rule.img.test(imgs.imgBG)) && (mImg = imgs.imgBG))
                            ))
                        ) {
                            if (cfg.hz.debugRules) {
                                console.log(`Rule ${i} matched:`, { image: mImg, element: trg });
                            }
                            if (!use_img[1] && imgs.imgSRC) {
                                use_img = 1;
                                URL = imgs.imgSRC;
                                imgs = imgs.imgSRC_o;
                            } else {
                                use_img = 2;
                                URL = imgs.imgBG;
                                imgs = imgs.imgBG_o;
                            }
                            if (!rule.to && rule.res && rule.url) {
                                if (PVI.toFunction(rule, "url", true) === false) return 1;
                                if (typeof rule.url === "function") PVI.node = trg;
                                ret = URL.replace(rule.img, rule.url);
                                ret = PVI.resolve(
                                    PVI.httpPrepend(ret, imgs.slice(0, imgs.length - URL.length)),
                                    { id: i, $: [imgs].concat((URL.match(rule.img) || []).slice(1)), loop_param: "img", skip_resolve: ret === "" },
                                    trg.IMGS_TRG || trg
                                );
                            } else ret = PVI.replace(rule, URL, imgs, "img", trg);
                            if (ret === 1) return 1;
                            else if (ret === 2) return false;
                            if (trg.nodeType === 1) {
                                attrModNode = trg;
                                if (cfg.hz.history) trg.IMGS_nohistory = true;
                            }
                            break;
                        }
                    }
                }
            }

            const urlToIgnore = URL || ret;
            if (srcOnly) return urlToIgnore;
            if (isUrlIgnored(urlToIgnore)) return false;

            if (rule && rule.loop && typeof ret === "string" && rule.loop & (use_img ? 2 : 1)) {
                if ((trg.nodeType !== 1 && ret === trg.href) || trg.IMGS_loop_count > 5) return false;
                rule = ret;
                ret = PVI.find({ href: ret, IMGS_TRG: trg.IMGS_TRG || trg, IMGS_loop_count: 1 + (trg.IMGS_loop_count || 0) });
                if (ret) ret = Array.isArray(ret) ? ret.concat(rule) : [ret, rule];
                else if (ret !== null) ret = rule;
            }
            if (tmp_el === true) trg.IMGS_fallback_zoom = n.href;
            if (ret && (typeof ret === "string" || Array.isArray(ret))) {
                URL = /^https?:\/\//;
                URL = [
                    n && n.href && n.href.replace(URL, ""),
                    trg.nodeType === 1 && trg.src && trg.hasAttribute("src") && (trg.currentSrc || trg.src).replace(URL, ""),
                ];
                if (typeof ret === "string") ret = [ret];
                for (i = 0; i < ret.length; ++i) {
                    var url = ret[i].replace(/^#?(https?:)?\/\//, "");
                    if (URL[1] === url) {
                        if (ret[i][0] === "#") {
                            use_img = ret = false;
                            break;
                        }
                    } else if (URL[0] === url) continue;
                    if (tmp_el === true) tmp_el = 1;
                    else if (tmp_el === 1) ret.splice(i--, 1);
                }
                if (!ret.length)
                    if (trg.IMGS_fallback_zoom) {
                        ret = trg.IMGS_fallback_zoom;
                        delete trg.IMGS_fallback_zoom;
                    } else ret = false;
                else if (ret.length === 1) ret = ret[0][0] === "#" ? ret[0].slice(1) : ret[0];
            }
            if (trg.nodeType !== 1) return ret;
            imgFallbackCheck: if (trg.localName === "img" && trg.hasAttribute("src")) {
                if (ret)
                    if (ret === (trg.currentSrc || trg.src) && (!n || !n.href || n !== trg)) use_img = ret = false;
                    else if (typeof use_img === "number") use_img = 3;
                if (rgxIsSVG.test(trg.currentSrc || trg.src)) break imgFallbackCheck;
                if (trg.parentNode.localName === "picture") tmp_el = trg.parentNode.querySelectorAll("[srcset]");
                else if (trg.hasAttribute("srcset")) tmp_el = [trg];
                else tmp_el = [];
                rule = { naturalWidth: trg.naturalWidth, naturalHeight: trg.naturalHeight, src: null };
                for (i = 0; i < tmp_el.length; ++i) {
                    URL = tmp_el[i]
                        .getAttribute("srcset")
                        .trim()
                        // split with ", ", to avoid issues with URIs containing commas
                        // .split(/\s*,\s*/);
                        .split(/,\s+/);
                    var j = URL.length;
                    while (j--) {
                        var srcItem = URL[j].trim().split(/\s+/);
                        if (srcItem.length !== 2) continue;
                        var descriptor = srcItem[1].slice(-1);
                        if (descriptor === "x") srcItem[1] = trg.naturalWidth * srcItem[1].slice(0, -1);
                        else if (descriptor === "w") srcItem[1] = parseInt(srcItem[1], 10);
                        else continue;
                        if (srcItem[1] > rule.naturalWidth) {
                            rule.naturalWidth = srcItem[1];
                            PVI.HLP.href = srcItem[0];
                            rule.src = PVI.HLP.href;
                        }
                    }
                }
                if (rule.src) rule.naturalHeight *= rule.naturalWidth / trg.naturalWidth;
                if (rule.src && PVI.isEnlargeable(trg, rule)) rule = rule.src;
                else if (PVI.isEnlargeable(trg)) rule = trg.currentSrc || trg.src;
                else rule = null;
                var oParent = trg;
                i = 0;
                do {
                    if (oParent === doc.body || oParent.nodeType !== 1) break;
                    tmp_el = win.getComputedStyle(oParent);
                    if (tmp_el.position === "fixed") break;
                    if (i === 0) continue;
                    if (tmp_el.overflowY === "visible" && tmp_el.overflowX === "visible") continue;
                    switch (tmp_el.display) {
                        case "block":
                        case "inline-block":
                        case "flex":
                        case "inline-flex":
                        case "list-item":
                        case "table-caption":
                            break;
                        default:
                            continue;
                    }
                    if (rule) {
                        if (typeof rule !== "string") rule = null;
                        trg.IMGS_overflowParent = oParent;
                        break;
                    }
                    if (oParent.offsetWidth <= 32 || oParent.offsetHeight <= 32) continue;
                    if (!PVI.isEnlargeable(oParent, trg, true)) continue;
                    rule = trg.currentSrc || trg.src;
                    trg.IMGS_fallback_zoom = trg.IMGS_fallback_zoom ? [trg.IMGS_fallback_zoom, rule] : rule;
                    break;
                } while (++i < 5 && (oParent = oParent.parentNode));
                if (!rule) break imgFallbackCheck;
                attrModNode = trg;
                if (typeof ret === "object") {
                    if (trg.IMGS_fallback_zoom !== rule) trg.IMGS_fallback_zoom = trg.IMGS_fallback_zoom ? [trg.IMGS_fallback_zoom, rule] : rule;
                } else if (ret) {
                    if (ret !== rule) ret = [ret, rule];
                } else {
                    ret = rule;
                    if (cfg.hz.history) trg.IMGS_nohistory = true;
                }
            }
            if (!ret && ret !== null) {
                if (attrModNode) PVI.listen_attr_changes(attrModNode);
                return ret;
            }
            if (use_img && imgs) {
                if (use_img === 2) trg.IMGS_thumb_ok = true;
                trg.IMGS_thumb = imgs;
            } else if (use_img === 3) trg.IMGS_thumb = true;
            tmp_el = n && n.href ? (n.textContent || "").trim() : null;
            if (tmp_el === n.href) tmp_el = null;
            i = 0;
            n = trg;
            do {
                if (n.IMGS_caption || (n.title && (!trg.hasAttribute("src") || trg.src !== n.title))) trg.IMGS_caption = n.IMGS_caption || n.title;
                if (i === 0 && !cfg.hz.capNoSBar) trg.title = "";
                if (trg.IMGS_caption) break;
            } while (++i <= 5 && (n = n.parentNode) && n.nodeType === 1);
            if (!trg.IMGS_caption)
                if (trg.alt && trg.alt !== trg.src && trg.alt !== imgs) trg.IMGS_caption = trg.alt;
                else if (tmp_el /* && cfg.hz.capLinkText */) trg.IMGS_caption = tmp_el;
            if (trg.IMGS_caption)
                if (/* (!cfg.hz.capLinkText && trg.IMGS_caption === tmp_el) || */ trg.IMGS_caption === trg.href) delete trg.IMGS_caption;
                else PVI.prepareCaption(trg, trg.IMGS_caption);
            if (attrModNode) PVI.listen_attr_changes(attrModNode);
            return ret;
        },

        delayed_loader: function () {
            if (PVI.TRG && PVI.state < 4) PVI.show(PVI.LDR_msg, true);
        },

        show: function (msg, delayed) {
            if (PVI.iFrame) {
                win.parent.postMessage({
                    vdfDpshPtdhhd: "from_frame",
                    msg: msg,
                    x: PVI.x,
                    y: PVI.y
                 }, "*");
                return;
            }
            if (!delayed && typeof msg === "string") {
                PVI.DIV.style.display = "none";
                PVI.HD_cursor(true);
                PVI.BOX = PVI.LDR;
                PVI.LDR.style.backgroundColor =
                    cfg.hz.LDRbgOpacity < 100 ? PVI.palette[msg].replace(/\(([^)]+)/, "a($1, " + cfg.hz.LDRbgOpacity / 100) : PVI.palette[msg];
                if (cfg.hz.LDRdelay > 20) {
                    clearTimeout(PVI.timers.delayed_loader);
                    if (msg[0] !== "R" && PVI.state !== 3 && !PVI.fullZm) {
                        PVI.setState(3);
                        PVI.LDR_msg = msg;
                        PVI.timers.delayed_loader = setTimeout(PVI.delayed_loader, cfg.hz.LDRdelay);
                        return;
                    }
                }
            }
            var box;
            if (msg) {
                if (PVI.state === 2 && cfg.hz.waitHide) return;
                viewportDimensions();
                if (PVI.state < 3 || PVI.LDR_msg) {
                    PVI.LDR_msg = null;
                    win.addEventListener("wheel", PVI.onWheel, { capture: true, passive: false });
                }
                if (msg === true) {
                    PVI.BOX = PVI.DIV;
                    PVI.LDR.style.display = "none";
                    if (cfg.hz.LDRanimate) PVI.LDR.style.opacity = "0";
                    PVI.CNT.style.display = "block";
                    const el = (PVI.CNT === PVI.IMG ? PVI.VIDEOJS : PVI.IMG);
                    if (el) el.style.display = "none";
                    if (typeof PVI.DIV.cursor_hide === "function") PVI.DIV.cursor_hide();
                } else if (PVI.state < 4) {
                    if (PVI.anim.left || PVI.anim.top) {
                        PVI.DIV.style.left = PVI.x + "px";
                        PVI.DIV.style.top = PVI.y + "px";
                    }
                    if (PVI.anim.width || PVI.anim.height) PVI.DIV.style.width = PVI.DIV.style.height = "0";
                }
                box = PVI.BOX.style;
                if (
                    (PVI.state < 3 || PVI.BOX === PVI.LDR) &&
                    box.display === "none" &&
                    (((PVI.anim.left || PVI.anim.top) && PVI.BOX === PVI.DIV) || (cfg.hz.LDRanimate && PVI.BOX === PVI.LDR))
                )
                    PVI.show(null);
                box.display = "block";
                if (box.opacity === "0" && ((PVI.BOX === PVI.DIV && PVI.anim.opacity) || (PVI.BOX === PVI.LDR && cfg.hz.LDRanimate)))
                    if (PVI.state === 2) PVI.anim.opacityTransition();
                    else setTimeout(PVI.anim.opacityTransition, 0);
                PVI.setState(PVI.BOX === PVI.LDR ? 3 : 4);

                if (cfg.hz.fzDefault && PVI.state === 4) {
                    PVI.fzEnable();
                }
                PVI.DIV.classList.toggle("album", !!PVI.TRG.IMGS_album);
            }
            var x = PVI.x;
            var y = PVI.y;
            var rSide = winW - x;
            var bSide = winH - y;
            var left, top, rot, w, h, ratio;

            if ((msg === undefined && PVI.state === 4) || msg === true) {
                msg = false;
                if (PVI.TRG.IMGS_SVG) {
                    h = PVI.stack[PVI.IMG.src];
                    w = h[0];
                    h = h[1];
                } else {
                    w = PVI.CNT.naturalWidth;
                    h = PVI.CNT.naturalHeight;
                    if (!w) {
                        msg = true;
                    }
                }
            }

            if (PVI.fullZm) {
                if (!PVI.BOX) PVI.BOX = PVI.LDR;
                if (msg === false) {
                    box = PVI.DIV.style;
                    box.visibility = "hidden";
                    PVI.resize(PVI.resizeMode || false);
                    // PVI.m_move();
                    box.visibility = "visible";
                    PVI.updateCaption();
                } else PVI.m_move();
                return;
            }

            if (msg === false) {
                rot = PVI.DIV.curdeg % 180 !== 0;
                if (rot) {
                    ratio = w;
                    w = h;
                    h = ratio;
                }
                if (cfg.hz.placement === 3) {
                    box = PVI.TBOX;
                    x = box.left;
                    y = box.top;
                    rSide = winW - box.right;
                    bSide = winH - box.bottom;
                }
                box = PVI.DBOX;
                ratio = w / h;
                let lrMax = Math.max(rSide, x);
                let tbMax = Math.max(bSide, y);
                let fs = cfg.hz.fullspace || cfg.hz.placement === 2,
                    cap_size = PVI.getCapHeight(),
                    wBor = box["wm"] + (rot ? box["hpb"] : box["wpb"]),
                    hBor = box["hm"] + (rot ? box["wpb"] : box["hpb"]) + cap_size,
                    wImageAreaMin = Math.min(w, (fs ? winW : lrMax) - wBor),
                    wImageWinMin = Math.min(w, winW - wBor),
                    hImageWinMin = Math.min(h, winH - hBor),
                    hImageAreaMin = Math.min(h, (fs ? winH : tbMax) - hBor);

                if (cfg.hz.scaleUp) {
                    wImageAreaMin = wImageWinMin = winW - wBor;
                    hImageAreaMin = hImageWinMin = winH - hBor;
                }

                if ((fs = wImageAreaMin / ratio) > hImageWinMin) wImageAreaMin = hImageWinMin * ratio;
                else hImageWinMin = fs;
                if ((fs = hImageAreaMin * ratio) > wImageWinMin) hImageAreaMin = wImageWinMin / ratio;
                else wImageWinMin = fs;
                if (wImageWinMin > wImageAreaMin) {
                    w = Math.floor(wImageWinMin);
                    h = Math.ceil(hImageAreaMin);
                } else {
                    w = Math.floor(wImageAreaMin);
                    h = Math.ceil(hImageWinMin);
                }

                wImageAreaMin = w + wBor;
                hImageWinMin = h + hBor;
                wImageWinMin = PVI.TRG !== PVI.HLP && cfg.hz.minPopupDistance;
                switch (cfg.hz.placement) {
                    case 1: // cursor at pop-up side
                        hImageAreaMin = lrMax < wImageAreaMin;
                        if (hImageAreaMin && cfg.hz.fullspace && (winH - hImageWinMin <= winW - wImageAreaMin || wImageAreaMin <= lrMax)) hImageAreaMin = false;
                        left = x - (hImageAreaMin ? wImageAreaMin / 2 : x < rSide ? 0 : wImageAreaMin);
                        top = y - (hImageAreaMin ? (y < bSide ? 0 : hImageWinMin) : hImageWinMin / 2);
                        break;
                    case 2: // pop-up at the center of the screen
                        left = (winW - wImageAreaMin) / 2;
                        top = (winH - hImageWinMin) / 2;
                        wImageWinMin = false;
                        break;
                    case 3: // no cover
                        left = x < rSide || (wImageAreaMin >= PVI.x && winW - PVI.x >= wImageAreaMin) ? PVI.TBOX.right : x - wImageAreaMin;
                        top = y < bSide || (hImageWinMin >= PVI.y && winH - PVI.y >= hImageWinMin) ? PVI.TBOX.bottom : y - hImageWinMin;
                        hImageAreaMin =
                            lrMax < wImageAreaMin ||
                            ((tbMax) >= hImageWinMin && winW >= wImageAreaMin && (PVI.TBOX.width >= winW / 2 || Math.abs(PVI.x - left) >= winW / 3.5));
                        if (!cfg.hz.fullspace || (hImageAreaMin ? hImageWinMin <= (tbMax) : wImageAreaMin <= lrMax)) {
                            fs = PVI.TBOX.width / PVI.TBOX.height;
                            if (hImageAreaMin) {
                                left = (PVI.TBOX.left + PVI.TBOX.right - wImageAreaMin) / 2;
                                if (fs > 10) left = x < rSide ? Math.max(left, PVI.TBOX.left) : Math.min(left, PVI.TBOX.right - wImageAreaMin);
                            } else {
                                top = (PVI.TBOX.top + PVI.TBOX.bottom - hImageWinMin) / 2;
                                if (fs < 0.1) top = y < bSide ? Math.min(top, PVI.TBOX.top) : Math.min(top, PVI.TBOX.bottom - hImageWinMin);
                            }
                        }
                        break;
                    case 4: // cursor at pop-up center
                        left = x - wImageAreaMin / 2;
                        top = y - hImageWinMin / 2;
                        wImageWinMin = false;
                        break;
                    default: // cursor at pop-up corner
                        hImageAreaMin = null;
                        left = x - (x < rSide ? Math.max(0, wImageAreaMin - rSide) : wImageAreaMin);
                        top = y - (y < bSide ? Math.max(0, hImageWinMin - bSide) : hImageWinMin);
                }
                if (wImageWinMin)
                    if (hImageAreaMin || lrMax < wImageAreaMin || winH < hImageWinMin) {
                        hImageAreaMin = 0;
                        if (wImageWinMin > hImageAreaMin) {
                            wImageWinMin -= hImageAreaMin;
                            top += y < bSide ? wImageWinMin : -wImageWinMin;
                        }
                    } else {
                        hImageAreaMin = 0;
                        if (wImageWinMin > hImageAreaMin) {
                            wImageWinMin -= hImageAreaMin;
                            left += x < rSide ? wImageWinMin : -wImageWinMin;
                        }
                    }
                left = left < 0 ? 0 : left > winW - wImageAreaMin ? winW - wImageAreaMin : left;
                top = top < 0 ? 0 : top > winH - hImageWinMin ? winH - hImageWinMin : top;
                if (cap_size && !cfg.hz.capPos) top += cap_size;
                if (rot) {
                    rot = w;
                    w = h;
                    h = rot;
                    rot = (wImageAreaMin - hImageWinMin) / 2;
                    left += rot;
                    top -= rot;
                }
                PVI.DIV.style.width = Math.floor(w) + "px";
                PVI.DIV.style.height = Math.ceil(h) + "px";
                PVI.updateCaption();
            } else {
                if (cfg.hz.placement === 1) {
                    left = cfg.hz.minPopupDistance;
                    top = PVI.LDR.wh[1] / 2;
                } else {
                    left = 13;
                    top = y < bSide ? -13 : PVI.LDR.wh[1] + 13;
                }
                left = x - (x < rSide ? -left : PVI.LDR.wh[0] + left);
                top = y - top;
            }
            if (left !== undefined) {
                PVI.BOX.style.left = Math.floor(left) + "px";
                PVI.BOX.style.top = Math.floor(top) + "px";
            }
            PVI.showHVR();
        },
        album: function (idx, manual) {
            var s, i;
            if (!PVI.TRG || !PVI.TRG.IMGS_album) return;
            var album = PVI.stack[PVI.TRG.IMGS_album];
            if (!album || album.length < 2) return;
            if (!PVI.fullZm && PVI.timers.no_anim_in_album) {
                clearInterval(PVI.timers.no_anim_in_album);
                PVI.timers.no_anim_in_album = null;
                PVI.DIV.style.transition = "all 0s";
            }
            switch (typeof idx) {
                case "boolean":
                    idx = idx ? 1 : album.length - 1;
                    break;
                case "number":
                    idx = album[0] + (idx || 0);
                    break;
                default:
                    if (/^[+-]?\d+$/.test(idx)) {
                        i = parseInt(idx, 10);
                        idx = idx[0] === "+" || idx[0] === "-" ? album[0] + i : i || 1;
                    } else {
                        idx = idx.trim();
                        if (!idx) return;
                        idx = RegExp(idx, "i");
                        s = album[0];
                        i = s + 1;
                        for (i = i < album.length ? i : 1; i !== s; ++i < album.length ? 0 : (i = 1))
                            if (album[i][1] && idx.test(album[i][1])) {
                                idx = i;
                                break;
                            }
                        if (typeof idx !== "number") return;
                    }
            }
            if (cfg.hz.pileCycle) {
                s = album.length - 1;
                idx = idx % s || s;
                idx = idx < 0 ? s + idx : idx;
            } else idx = Math.max(1, Math.min(idx, album.length - 1));
            s = album[0];
            if (s === idx && manual && PVI.state > 3) return;
            album[0] = idx;
            album[idx] = PVI.parseExtensionItem(album[idx]) || album[idx];

            PVI.gallery(1);
            PVI.resetNode(PVI.TRG, true);
            PVI.CAP.style.display = "none";
            PVI.CAP_TIME.style.display = "none";
            PVI.CAP.firstChild.textContent = idx + " / " + (album.length - 1);
            PVI.prepareCaption(PVI.TRG, album[idx][1]);
            PVI.set(album[idx][0]);
            s = (s <= idx && !(s === 1 && idx === album.length - 1)) || (s === album.length - 1 && idx === 1) ? 1 : -1;
            i = 0;
            var until = cfg.hz.preload < 3 ? 1 : 3;
            while (i++ <= until) {
                if (!album[idx + i * s] || idx + i * s < 1) return;
                PVI._preload(album[idx + i * s][0]);
            }
        },

        parseExtensionItem(item) {
            const m = /<imagus-extension type="videojs" url="(.+)">.*<\/imagus-extension>(.*)/i.exec(item?.[1]);
            if (m) return [m[1], m[2], item[2]];
        },

        set: function (src) {
            var i, src_left, src_HD;
            if (!src) return;
            if (PVI.iFrame) {
                i = PVI.TRG;
                win.parent.postMessage(
                    {
                        vdfDpshPtdhhd: "from_frame",
                        src: src,
                        thumb: i.IMGS_thumb ? [i.IMGS_thumb, i.IMGS_thumb_ok] : null,
                        album: i.IMGS_album ? { id: i.IMGS_album, list: PVI.stack[i.IMGS_album] } : null,
                        caption: i.IMGS_caption,
                        x: PVI.x,
                        y: PVI.y,
                        tbox: PVI.TBOX,
                    },
                    "*"
                );
                return;
            }
            clearInterval(PVI.timers.onReady);
            PVI.create();
            PVI.DIV.classList.remove("video1", "video2");
            if (Array.isArray(src)) {
                if (!src.length) {
                    PVI.show("R_load");
                    return;
                }
                src_left = [];
                src_HD = [];
                for (i = 0; i < src.length; ++i) {
                    if (!src[i]) continue;
                    if (src[i][0] === "#") src_HD.push(PVI.httpPrepend(src[i].slice(1)));
                    else src_left.push(PVI.httpPrepend(src[i]));
                }
                if (!src_left.length) src_left = src_HD;
                else if (src_HD.length) {
                    PVI.TRG.IMGS_HD = cfg.hz.hiRes;
                    i = cfg.hz.hiRes ? src_left : src_HD;
                    PVI.TRG.IMGS_HD_stack = i.length > 1 ? i : i[0];
                    src_left = cfg.hz.hiRes ? src_HD : src_left;
                }
                PVI.TRG.IMGS_c_resolved = src_left;
                src = src_left[0];
            } else if (src[0] === "#") src = src.slice(1);
            if (src[1] === "/") src = PVI.httpPrepend(src);
            if (typeof src === "string" && src.includes("&amp;")) src = src.replace(/&amp;/g, "&");
            if (rgxIsSVG.test(src)) PVI.TRG.IMGS_SVG = true;
            else delete PVI.TRG.IMGS_SVG;
            if (src === PVI.CNT.src) {
                PVI.checkContentRediness(src);
                return;
            }
            if (isVideoUrl(src)) {
                PVI.show("load");
                PVI.openVideojs(src);
                return;
            }
            PVI.PLAYER?.pause();
            PVI.onVideojsReady = null;
            if (PVI.CNT !== PVI.IMG) {
                PVI.CNT = PVI.IMG;
            }
                if (PVI.interlacer) PVI.interlacer.style.display = "none";
                PVI.CNT.loaded = PVI.TRG.IMGS_SVG || PVI.stack[src] === 1;
            if (!PVI.TRG.IMGS_SVG && !PVI.stack[src] && cfg.hz.preload === 1) new Image().src = src;
            PVI.CNT.removeAttribute("src");
            if (PVI.TRG.IMGS_SVG && !PVI.stack[src]) {
                var svg = doc.createElement("img");
                svg.style.cssText = ["position: fixed", "visibility: hidden", "max-width: 500px", ""].join(" !important;");
                svg.onerror = PVI.content_onerror;
                svg.src = src;
                svg.counter = 0;
                PVI.timers.onReady = setInterval(function () {
                    if (svg.width || svg.counter++ > 300) {
                        var ratio = svg.width / svg.height;
                        clearInterval(PVI.timers.onReady);
                        doc.body.removeChild(svg);
                        if (ratio) {
                            // PVI.stack[src] = [win.screen.width, Math.round(win.screen.width / ratio)];
                            PVI.stack[src] = [svg.naturalWidth, svg.naturalHeight];
                            PVI.IMG.src = src;
                            PVI.assign_src();
                        } else PVI.show("Rload");
                        svg = null;
                    }
                }, 100);
                doc.body.appendChild(svg);
                PVI.show("load");
                return;
            }
            PVI.CNT.src = src;
            PVI.checkContentRediness(src, !src.startsWith("data:image/"));
        },
        checkContentRediness: function (src, showLoader) {
            if (PVI.CNT.naturalWidth || (PVI.TRG.IMGS_SVG && PVI.stack[src])) {
                PVI.assign_src();
                return;
            }
            if (showLoader) PVI.show("load");
            PVI.timers.onReady = setInterval(PVI.content_onready, PVI.CNT === PVI.IMG ? 100 : 300);
        },

        content_onready: function () {
            if (!PVI.CNT || !PVI.fireHide) {
                clearInterval(PVI.timers.onReady);
                if (!PVI.fireHide) PVI.reset();
                return;
            }
            if (PVI.CNT === PVI.VIDEOJS) {
                PVI.VIDEOJS.naturalWidth = PVI.PLAYER.videoWidth() || 640;
                PVI.VIDEOJS.naturalHeight = PVI.PLAYER.videoHeight() || 480;
                PVI.DIV.classList.add(PVI.PLAYER.tech_?.src().startsWith("blob:") ? "video2" : "video1");

            } else if (!PVI.IMG.naturalWidth) return;
            clearInterval(PVI.timers.onReady);
            PVI.assign_src();
        },

        content_onerror: function (e) {
            clearInterval(PVI.timers.onReady);
            if (!PVI.TRG || (this !== PVI.CNT && this !== PVI.PLAYER)) return;
            var src_left;
            var t = PVI.TRG;
            var src_res_arr = t.IMGS_c_resolved;
            var src = typeof this.src === "function" ? this.src() : this.src;
            if (!src) return;
            this.removeAttribute("src");
            do src_left = Array.isArray(src_res_arr) ? src_res_arr.shift() : null;
            while (src_left === src);
            if (!src_res_arr || !src_res_arr.length)
                if (src_left) t.IMGS_c_resolved = src_left;
                else delete t.IMGS_c_resolved;
            if (src_left && !src_left.URL) PVI.set(src_left);
            else if (t.IMGS_HD_stack) {
                src_left = t.IMGS_HD_stack;
                delete t.IMGS_HD_stack;
                delete t.IMGS_HD;
                PVI.set(src_left);
            } else if (t.IMGS_fallback_zoom) {
                PVI.set(t.IMGS_fallback_zoom);
                delete t.IMGS_fallback_zoom;
            } else {
                if (PVI.CAP) PVI.CAP.style.display = "none";
                delete t.IMGS_c_resolved;
                PVI.show("R_load");
            }
            console.info(`${cfg.app?.name}: Load error > ${src}`, e);
        },

        content_onload: function (e) {
            /* if (cfg.hz.thumbAsBG) */ this.loaded = true;
            if (PVI.TRG) delete PVI.TRG.IMGS_c_resolved;
            if (PVI.stack[this.src] && !(PVI.TRG || e).IMGS_SVG) PVI.stack[this.src] = 1;
            if (PVI.interlacer) PVI.interlacer.style.display = "none";
        },

        history: function (manual) {
            var url, i, n;
            if (!PVI.CNT || !PVI.TRG || chrome?.extension?.inIncognitoContext) return;
            if (manual) {
                cfg.hz.history = !cfg.hz.history;
                return;
            }
            manual = manual !== undefined;
            if (!manual && PVI.TRG.IMGS_nohistory) return;
            if (PVI.TRG.IMGS_album) {
                url = PVI.stack[PVI.TRG.IMGS_album];
                if (!manual && (url.in_history || (url.length > 4 && url[0] === 1))) return;
                url.in_history = !url.in_history;
            }
            n = PVI.TRG;
            i = 0;
            do {
                if (n.localName !== "a") continue;
                url = n.href;
                if (url && url.baseVal) url = url.baseVal;
                break;
            } while (++i < 5 && (n = n.parentNode) && n.nodeType === 1);
            if (url) Port.send({ cmd: "history", url: url, manual: manual });
        },

        HD_cursor: function (reset) {
            if (!PVI.TRG || (!reset && (cfg.hz.capWH || PVI.TRG.IMGS_HD === undefined))) return;
            if (reset) {
                if (PVI.DIV) PVI.DIV.style.cursor = "";
                if (PVI.lastTRGStyle.cursor !== null) {
                    PVI.TRG.style.cursor = PVI.lastTRGStyle.cursor;
                    PVI.lastTRGStyle.cursor = null;
                }
            } else {
                if (PVI.lastTRGStyle.cursor === null) PVI.lastTRGStyle.cursor = PVI.TRG.style.cursor;
                PVI.DIV.style.cursor = PVI.TRG.style.cursor = "crosshair";
            }
        },

        isEnlargeable: function (img, oImg, isOverflow) {
            if (!img) return true;
            if (PVI.CNT && PVI.CNT !== PVI.IMG) return true;
            if (!oImg) oImg = img;
            var w = img.clientWidth;
            var h = img.clientHeight;
            var ow = oImg.naturalWidth;
            var oh = oImg.naturalHeight;
            if ((ow <= 64 && oh <= 64 && !isOverflow) || ow <= 1 || oh <= 1) return false;
            if (isOverflow) {
                w = img.getBoundingClientRect();
                ow = oImg.getBoundingClientRect();
                if (ow.right - 10 > w.right || ow.bottom - 10 > w.bottom || ow.left + 10 < w.left || ow.top + 10 < w.top) return true;
                return false;
            }
            if (img === oImg) {
                if (ow < 600 && oh < 600 && Math.abs(ow / 2 - (img.width || w)) < 8 && Math.abs(oh / 2 - (img.height || h)) < 8) return false;
            } else if (/^[^?#]+\.(?:gif|apng)(?:$|[?#])/.test(oImg.src)) return true;
            if ((w >= ow || h >= oh) && Math.abs(ow / oh - w / h) <= 0.2) return false;
            return (w < topWinW * 0.9 && 100 - (w * 100) / ow >= cfg.hz.zoomresized) || (h < topWinH * 0.9 && 100 - (h * 100) / oh >= cfg.hz.zoomresized);
        },

        not_enlargeable: function () {
            PVI.resetNode(PVI.TRG);
            PVI.TRG.IMGS_c = true;
            PVI.reset();
            if (!cfg.hz.markOnHovered) return;
            if (cfg.hz.markOnHovered === "cr" || cfg.hz.markOnHovered === "both") {
                PVI.lastTRGStyle.cursor = PVI.TRG.style.cursor;
                PVI.TRG.style.cursor = "not-allowed";
                return;
            }
            if (PVI.lastTRGStyle.outline === null) PVI.lastTRGStyle.outline = PVI.TRG.style.outline;
            PVI.lastScrollTRG = PVI.TRG;
            PVI.TRG.style.outline = "1px solid purple";
        },

        assign_src: function () {
            if (!PVI.TRG || PVI.switchToHiResInFZ()) return;
            if (!PVI.TRG.IMGS_SVG) {
                if (PVI.TRG !== PVI.HLP && PVI.TRG.IMGS_thumb && !PVI.isEnlargeable(PVI.TRG, PVI.IMG)) {
                    if (PVI.TRG.IMGS_HD_stack && !PVI.TRG.IMGS_HD) {
                        PVI.show("load");
                        PVI.hiResToggle();
                        return;
                    }
                    if (!PVI.TRG.IMGS_fallback_zoom) {
                        PVI.not_enlargeable();
                        return;
                    }
                    PVI.TRG.IMGS_thumb = false;
                }
                if (PVI.CNT === PVI.IMG && !PVI.IMG.loaded && PVI.TRG.IMGS_thumb !== false) {
                    var inner_thumb, w, h;
                    if (PVI.TRG.IMGS_album) {
                        const album = PVI.stack[PVI.TRG.IMGS_album] || [];
                        const thumb = album[album[0]]?.[2];
                        if (thumb && thumb !== PVI.IMG.src) {
                            PVI.TRG.IMGS_thumb = thumb;
                            PVI.TRG.IMGS_thumb_ok = true;
                        } else {
                            delete PVI.TRG.IMGS_thumb;
                            delete PVI.TRG.IMGS_thumb_ok;
                            if (PVI.interlacer) PVI.interlacer.style.display = "none";
                        }
                    } else if (typeof PVI.TRG.IMGS_thumb !== "string") {
                        PVI.TRG.IMGS_thumb = PVI.TRG?.src || PVI.TRG?.IMGS_MEDIA?.src || null;
                        if (!PVI.TRG.IMGS_thumb && PVI.TRG.childElementCount) {
                            inner_thumb = PVI.TRG.querySelector("img[src]");
                            if (inner_thumb) PVI.TRG.IMGS_thumb = inner_thumb.src;
                        }
                    }
                    if (PVI.TRG.IMGS_thumb === PVI.IMG.src) {
                        delete PVI.TRG.IMGS_thumb;
                        delete PVI.TRG.IMGS_thumb_ok;
                    } else if (PVI.TRG.IMGS_thumb) {
                        w = true;
                        if (!PVI.TRG.IMGS_thumb_ok) {
                            const thumb = inner_thumb || PVI.TRG;
                            w = thumb.naturalWidth || thumb.clientWidth;
                            h = thumb.naturalHeight || thumb.clientHeight;
                            PVI.TRG.IMGS_thumb_ok = Math.abs(PVI.IMG.naturalWidth / PVI.IMG.naturalHeight - w / h) <= 0.2;
                            w = (w < 1024 || h < 1024) && w < PVI.IMG.naturalWidth && h < PVI.IMG.naturalHeight;
                        }
                        if (w && PVI.TRG.IMGS_thumb_ok) {
                            if (PVI.interlacer) w = PVI.interlacer.style;
                            else {
                                PVI.interlacer = doc.createElement("div");
                                PVI.interlacer.id = "imagus-preview";
                                PVI.DIV.insertBefore(PVI.interlacer, PVI.IMG);
                            }
                            PVI.interlacer.style.backgroundImage = "url(" + PVI.TRG.IMGS_thumb + ")";
                            PVI.interlacer.style.display = "block";
                        }
                        delete PVI.TRG.IMGS_thumb;
                        delete PVI.TRG.IMGS_thumb_ok;
                    }
                }
            }
            delete PVI.TRG.IMGS_c_resolved;
            PVI.TRG.IMGS_c = PVI.CNT === PVI.VIDEOJS ? PVI.VIDEOJS.IMGS_src : PVI.CNT.src;
            if (!PVI.TRG.IMGS_SVG) PVI.stack[PVI.IMG.src] = true;
            PVI.show(true);
            PVI.HD_cursor(PVI.TRG.IMGS_HD !== false);
            if (cfg.hz.history) PVI.history();
            if (!PVI.fullZm && PVI.anim.maxDelay && PVI.TRG.IMGS_album)
                PVI.timers.no_anim_in_album = setTimeout(function () {
                    PVI.DIV.style.transition = PVI.anim.css;
                }, 100);
        },

        hide: function (e) {
            PVI.HD_cursor(true);
            PVI.fireHide = false;
            if (PVI.iFrame) {
                win.parent.postMessage({ vdfDpshPtdhhd: "from_frame", hide: true }, "*");
                return;
            } else win.removeEventListener("mousemove", PVI.m_move, true);
            if (PVI.state < 3 || PVI.LDR_msg || PVI.state === null) {
                if (PVI.state >= 2) PVI.reset();
                return;
            }
            var animDIV = PVI.BOX === PVI.DIV && PVI.anim.maxDelay;
            var animLDR = PVI.BOX === PVI.LDR && cfg.hz.LDRanimate;
            if ((!animDIV && !animLDR) || PVI.fullZm) {
                if (!cfg.hz.waitHide) PVI.hideTime = Date.now();
                PVI.reset();
                return;
            }
            PVI.setState(2);
            if (PVI.CAP) {
                PVI.HLP.textContent = "";
                PVI.CAP.style.display = "none";
            }
            if ((animDIV && PVI.anim.left) || animLDR)
                PVI.BOX.style.left = (/* cfg.hz.follow ?  */e.clientX || PVI.x/*  : parseInt(PVI.BOX.style.left, 10) + PVI.BOX.offsetWidth / 2 */) + "px";
            if ((animDIV && PVI.anim.top) || animLDR)
                PVI.BOX.style.top = (/* cfg.hz.follow ?  */e.clientY || PVI.y/*  : parseInt(PVI.BOX.style.top, 10) + PVI.BOX.offsetHeight / 2 */) + "px";
            if (animDIV) {
                if (PVI.anim.width) PVI.DIV.style.width = "0";
                if (PVI.anim.height) PVI.DIV.style.height = "0";
            }
            if ((animDIV && PVI.anim.opacity) || animLDR) PVI.BOX.style.opacity = "0";
            PVI.timers.anim_end = setTimeout(PVI.reset, PVI.anim.maxDelay, null, e.relatedTarget);
        },

        reset: function (preventImmediateHover, target) {
            if (!PVI.DIV) return;
            if (PVI.iFrame) win.parent.postMessage({ vdfDpshPtdhhd: "from_frame", reset: true }, "*");
            if (PVI.state > 0) win.removeEventListener("mousemove", PVI.m_move, true);
            PVI.node = null;
            PVI.LDR_msg = null;
            clearTimeout(PVI.timers.delayed_loader);
            win.removeEventListener("wheel", PVI.onWheel, true);

            if (wheelRAF) {
                cancelAnimationFrame(wheelRAF);
                wheelRAF = null;
            }
            wheelDeltaAccum = 0;
            albumDeltaAccum = 0;
            clearTimeout(albumDeltaTimer);

            PVI.DIV.style.display = PVI.LDR.style.display = "none";
            PVI.DIV.style.width = PVI.DIV.style.height = "0";
            PVI.DIV.classList.remove("video1", "video2", "album");
            if (PVI.CNT === PVI.IMG) PVI.CNT.removeAttribute("src");
            PVI.TBAR.style.display = "";
            PVI.PLAYER?.pause();
            if (PVI.VIDEOJS) PVI.VIDEOJS.IMGS_src = undefined;
            if (PVI.anim.left || PVI.anim.top) PVI.DIV.style.left = PVI.DIV.style.top = "auto";
            if (PVI.anim.opacity) PVI.DIV.style.opacity = "0";
            if (cfg.hz.LDRanimate) {
                PVI.LDR.style.left = "auto";
                PVI.LDR.style.top = "auto";
                PVI.LDR.style.opacity = "0";
            }
            if (PVI.CAP) {
                PVI.CAP.style.display = "none";
                PVI.CAP.children[0].style.display = "none";
                PVI.CAP_TIME.style.display = "none";
            }
            if (PVI.IMG.scale) {
                delete PVI.IMG.scale;
                PVI.IMG.style.transform = "";
            }
            PVI.CNT.filename = PVI.VID.filename = PVI.IMG.filename = undefined;

            PVI.DIV.curdeg = 0;
            PVI.DIV.style.transform = "";
            PVI.DIV.dataset.rotate = "";
            PVI.DIV.classList.remove("fz");
            PVI.HD_cursor(true);
            if (PVI.fullZm) {
                PVI.fullZm = false;
                PVI.hideTime = null;
                if (PVI.anim.maxDelay) PVI.DIV.style.transition = PVI.anim.css;
                win.removeEventListener("click", PVI.fzClickAct, true);
                PVI.DIV.removeEventListener("click", PVI.fzClickAct, true);
                win.addEventListener("mouseover", PVI.m_over, true);
                doc.addEventListener("wheel", PVI.onPageScroll, { capture: true, passive: true });
                doc.documentElement.addEventListener("mouseleave", PVI.m_leave);
            }
            if (preventImmediateHover) {
                PVI.lastScrollTRG = PVI.TRG;
                PVI.onPageScroll();
            }
            PVI.showHVR(false, target);
            PVI.setCursor();
            PVI.gallery(0);
            PVI.setState(1);
        },

        onVisibilityChange: function (e) {
            if (PVI.fullZm) return;
            if (doc.hidden) {
                if (PVI.fireHide) PVI.m_over({ relatedTarget: PVI.TRG });
            } else releaseFreeze(e);
        },
        keyup_freeze: function (e) {
            if (!e || shortcut.key(e) === cfg.hz.actTrigger) {
                PVI.freeze = !cfg.hz.deactivate;
                PVI.keyup_freeze_on = false;
                win.removeEventListener("keyup", PVI.keyup_freeze, true);
            }
        },

        tbarClick: function (e) {
            const action = e.target.closest("[data-action]")?.dataset?.action;
            if (e.type === "mousedown") {
                if (e.button === 1 && action === "open") {
                    openTab(e);
                }
                return pdsp(e);
            }

            switch (action) {
                case "hide":
                    PVI.TBAR.style.display = "none";
                    break;
                case "gallery":
                    PVI.gallery();
                    break;
                case "download":
                    download();
                    break;
                case "goto":
                    PVI.key_action({ which: 35, shiftKey: true });
                    break;
                case "preferences":
                    Port.send({ cmd: "options" });
                    break;
                case "rotate":
                    rotate(true);
                    break;
                case "open":
                    openTab(e);
                    break;
                case "copy":
                    copyUrls(e);
                    break;
                case "copy_caption":
                    copyUrls(e, true);
                    break;
                default:
                    break;
            }
            pdsp(e);
        },

        keyup_pause: function (e) {
            if (!PVI.pauseIsDown) return;
            const k = shortcut.key(e);
            if (k !== cfg.keys.pause && !(k === "Space" && e.ctrlKey)) return;

            PVI.PLAYER.options({ inactivityTimeout: PVI.PLAYER._isAudio ? 0 : cfg.hz.hideControlsDelay });
            PVI.PLAYER.controls(cfg.hz.hideControlsDelay >= 0 || PVI.PLAYER._isAudio);
            PVI.PLAYER.userActive(PVI.PLAYER._isAudio || cfg.hz.hideControlsDelay === 0);
            if (PVI.pauseIsDown === 1) {
                PVI.playerIsPaused = !PVI.PLAYER.paused();
            } else if (PVI.pauseIsDown === 2) {
                PVI.PLAYER.playbackRate(1);
            }
            if (PVI.playerIsPaused) {
                PVI.PLAYER.pause();
            } else {
                PVI.PLAYER.play();
            }
            PVI.pauseIsDown = 0;
            win.removeEventListener("keyup", PVI.keyup_pause, true);
        },

        key_action: function (e) {
            var pv, key;
            if (!cfg) return;

            if (shortcut.isModifier(e)) {
                if (PVI.keyup_freeze_on || typeof PVI.freeze === "number") return;
                if (!e.repeat && PVI.fullZm && (e.shiftKey || e.altKey || e.ctrlKey)) PVI.m_move(e);
                if (e.repeat || shortcut.key(e) !== cfg.hz.actTrigger) return;
                if (PVI.fireHide && PVI.state < 3)
                    if (cfg.hz.deactivate) PVI.m_over({ relatedTarget: PVI.TRG });
                    else PVI.load(PVI.SRC === null ? PVI.TRG.IMGS_c_resolved : PVI.SRC);
                PVI.freeze = !!cfg.hz.deactivate;
                PVI.keyup_freeze_on = true;
                win.addEventListener("keyup", PVI.keyup_freeze, true);
                return;
            }

            if (!e.repeat) {
                if (PVI.keyup_freeze_on) PVI.keyup_freeze();
            } else if (PVI.freeze === false && !PVI.fullZm && PVI.lastScrollTRG) {
                PVI.mover({ target: PVI.lastScrollTRG });
            }

            key = shortcut.key(e);
            if (PVI.state < 3 && PVI.fireHide && key === "Esc") {
                PVI.m_over({ relatedTarget: PVI.TRG });
            }
            pv = e.target;

            if (cfg.hz.scOffInInput && pv && (pv.isContentEditable || ((pv = pv.nodeName.toUpperCase()) && (pv[2] === "X" || pv === "INPUT")))) {
                return;
            }

            if (PVI.state === 4 && PVI.isVideo() && !e.shiftKey &&
                (key === cfg.keys.pause && !e.ctrlKey || key === "Space" && e.ctrlKey)
            ) {
                if (e.repeat) {
                    if (PVI.pauseIsDown === 1) {
                        PVI.pauseIsDown = 2;
                        PVI.playerIsPaused = PVI.PLAYER.paused();
                        PVI.PLAYER.play();
                        PVI.PLAYER.playbackRate(2);
                        PVI.PLAYER.options({ inactivityTimeout: 0 });
                        PVI.PLAYER.controls(true);
                        PVI.PLAYER.userActive(true);
                    }
                } else {
                    PVI.pauseIsDown = 1;
                    win.addEventListener("keyup", PVI.keyup_pause, true);
                }

            } else if (e.altKey && e.shiftKey) {
                pv = true;
                if (key === cfg.keys.hz_preload) {
                    win.top.postMessage({ vdfDpshPtdhhd: "preload" }, "*");
                } else if (key === cfg.keys.hz_toggle) {
                    chrome.runtime.sendMessage({ cmd: "toggle" });
                } else {
                    pv = false;
                }

            } else if (!(e.altKey || e.metaKey) && (PVI.state > 2 || PVI.LDR_msg)) {
                pv = !e.ctrlKey;
                if (e.ctrlKey && !e.shiftKey && key === "S" || !e.ctrlKey && !e.shiftKey && key === cfg.keys.hz_save) {
                    if (!e.repeat) {
                        download(null, e);
                    }
                    pv = true;

                } else if (PVI.state === 4 && !e.shiftKey &&
                    (e.ctrlKey && key === "C" || !e.ctrlKey && key === cfg.keys.hz_copy)
                ) {
                    pv = true;
                    copyUrls(e);
                } else if (e.ctrlKey) {
                    if (PVI.state === 4) {
                        if (key === cfg.keys.openTab) {
                            openTab(e);
                            pv = true;
                        } else if (PVI.isVideo()) {
                            if (key === "Left" || key === "Right") {
                                let delta = (key === "Left" ? -5 : 5) * (e.shiftKey ? 3 : 1);
                                let time = PVI.PLAYER.currentTime() + delta;
                                PVI.PLAYER.currentTime(Math.max(0, time));
                                PVI.PLAYER.userActive(true);
                                e.preventDefault?.();
                            } else if (key === "Up" || key === "Down") {
                                const delta = key === "Down" ? -0.05 : 0.05;
                                PVI.PLAYER.volume(Math.max(0, Math.min(1, PVI.PLAYER.volume() + delta)));
                                PVI.PLAYER.userActive(true);
                                if (delta > 0) {
                                    PVI.PLAYER.muted(false);
                                }
                            }
                        }
                    }

                } else if (key === "-" || key === "+" || key === "=") {
                    PVI.resize(key === "-" ? "-" : "+");

                } else if (key === cfg.keys.gallery) {
                    PVI.gallery();

                } else if (key === cfg.keys.hiResToggle) {
                    PVI.hiResToggle(e);

                } else if (key === "Esc" || key === cfg.keys.hz_reset) {
                    if (PVI.isVideo() && (win.fullScreen || doc.fullscreenElement || (topWinW === win.screen.width && topWinH === win.screen.height))) {
                        pv = false;
                    } else {
                        PVI.reset(true);
                    }

                } else if (key === cfg.keys.hz_fullZm || key === "Enter") {
                    if (PVI.fullZm)
                        if (e.shiftKey) PVI.fullZm = PVI.fullZm === 1 ? 2 : 1;
                        else PVI.reset(true);
                    else {
                        PVI.fzEnable(e);
                    }
                } else if (e.which > 31 && e.which < 41) {
                    pv = null;
                    if (PVI.isVideo()) {
                        pv = true;
                        if (key === "Space" && e.shiftKey) {
                            PVI.PLAYER.controls(!PVI.PLAYER.controls());
                        } else if (key === "Space" && e.ctrlKey) {
                            PVI.PLAYER.controls(!PVI.PLAYER.controls());
                        } else if (
                            (key === "Right" || key === "Left") &&
                            (!PVI.TRG.IMGS_album || PVI.TRG.IMGS_album && (e.ctrlKey || cfg.hz.singleArrowTimeJumpInAlbum))
                        ) {
                            let delta = (key === "Left" ? -5 : 5) * (e.shiftKey ? 3 : 1);
                            let time = PVI.PLAYER.currentTime() + delta;
                            PVI.PLAYER.currentTime(Math.max(0, time));
                            PVI.PLAYER.userActive(true);
                            e.preventDefault?.();

                        } else if (key === "Up" || key === "Down") {
                            if (e.shiftKey) {
                                let rate = PVI.PLAYER.playbackRate() + (key === "Up" ? 0.05 : -0.05);
                                rate = Math.round(rate * 100) / 100;
                                PVI.PLAYER.playbackRate(rate);
                            } else {
                                const delta = key === "Down" ? -0.05 : 0.05;
                                PVI.PLAYER.volume(Math.max(0, Math.min(1, PVI.PLAYER.volume() + delta)));
                                PVI.PLAYER.userActive(true);
                                if (delta > 0) {
                                    PVI.PLAYER.muted(false);
                                }
                            }

                        } else pv = null;
                    }
                    if (!pv && PVI.TRG.IMGS_album) {
                        switch (key) {
                            case "End":
                                if (e.shiftKey && (pv = prompt("#", PVI.stack[PVI.TRG.IMGS_album].search || "") || null))
                                    PVI.stack[PVI.TRG.IMGS_album].search = pv;
                                else pv = false;
                                break;
                            case "Home":
                                pv = true;
                                break;
                            case "Up":
                            case "Down":
                                pv = null;
                                break;
                            default:
                                pv = ((key === "Space" && !e.shiftKey) || key === "Right" || key === "PgDn" ? 1 : -1) * (e.shiftKey && key !== "Space" ? 5 : 1);
                        }
                        if (pv !== null) {
                            PVI.album(pv, true);
                            pv = true;
                        }
                    }

                } else if (key === cfg.keys.frameNext || key === cfg.keys.framePrev) {
                    if (PVI.isVideo()) {
                        if (PVI.isAudio) {
                            PVI.PLAYER.currentTime(PVI.PLAYER.currentTime() + (key === cfg.keys.frameNext ? 4 : -4));
                        } else {
                            PVI.PLAYER.pause();
                            PVI.PLAYER.currentTime(PVI.PLAYER.currentTime() + (key === cfg.keys.frameNext ? 1 : -1) / 30);
                        }
                        pv = true;
                    }

                // Shift + 0-9
                } else if (e.shiftKey && e.keyCode >= 48 && e.keyCode <= 57 && PVI.isVideo()) {
                    PVI.PLAYER.currentTime(PVI.PLAYER.duration() * ((e.keyCode - 48) / 10));
                    PVI.PLAYER.userActive(true);

                } else if (key === cfg.keys.mOrig || key === cfg.keys.mFit || key === cfg.keys.mFitBoth || key === cfg.keys.mFitW || key === cfg.keys.mFitH || key === cfg.keys.mZoomLock) {
                    PVI.resizeMode = cfg.hz.resizeMode = key;
                    if (cfg.hz.resizeModeType === "memory") {
                        Port.send({ cmd: "savePrefs", prefs: { hz: { resizeMode: key } } });
                    }

                    if (PVI.fullZm) {
                        PVI.resize(key);
                    } else {
                        PVI.fzEnable(e);
                    }
                } else if (key === cfg.keys.toggleScaleUp) {
                    if (!PVI.fullZm && PVI.state > 2) {
                        cfg.hz.scaleUp = !cfg.hz.scaleUp;
                        Port.send({ cmd: "savePrefs", prefs: { hz: { scaleUp: cfg.hz.scaleUp } } });
                        PVI.show();
                    }
                } else if (key === cfg.keys.hz_fullSpace) {
                    cfg.hz.fullspace = !cfg.hz.fullspace;
                    Port.send({ cmd: "savePrefs", prefs: { hz: { fullspace: cfg.hz.fullspace } } });
                    PVI.show();
                } else if (key === cfg.keys.flipH) flip(PVI.CNT, 0);
                else if (key === cfg.keys.flipV) flip(PVI.CNT, 1);
                else if (key === cfg.keys.rotL || key === cfg.keys.rotR) {
                    rotate(key === cfg.keys.rotR);
                } else if (key === cfg.keys.hz_caption)
                    if (e.shiftKey) {
                        PVI.createCAP();
                        switch (PVI.CAP.state) {
                            case 0:
                                key = cfg.hz.capWH || cfg.hz.capText ? 1 : 2;
                                break;
                            case 2:
                                key = 0;
                                break;
                            default:
                                key = cfg.hz.capWH && cfg.hz.capText ? 0 : 2;
                        }
                        PVI.CAP.state = key;
                        PVI.CAP.style.display = "none";
                        PVI.updateCaption();
                        PVI.show();
                    } else {
                        if (PVI.CAP) PVI.CAP.style.whiteSpace = PVI.CAP.style.whiteSpace === "nowrap" ? "normal" : "nowrap";
                    }
                else if (key === cfg.keys.hz_history) PVI.history(e.shiftKey);
                else if (key === cfg.keys.send) {
                    if (PVI.CNT === PVI.IMG) imageSendTo({ url: PVI.CNT.src, active: !e.shiftKey });
                } else if (key === cfg.keys.openTab) {
                    openTab(e);
                } else if (key === cfg.keys.prefs) {
                    Port.send({ cmd: "options" });
                    if (!PVI.fullZm) PVI.reset();

                } else if (key === "M" && PVI.CNT === PVI.VIDEOJS) {
                    PVI.PLAYER.muted(!PVI.PLAYER.muted());

                } else pv = false;
            } else pv = false;
            if (pv) pdsp(e);
        },

        gallery: function (state) {
            let album = PVI.stack[PVI.TRG?.IMGS_album] || [];
            if (album.length < 2) return;

            PVI.galleryState = state ?? (PVI.galleryState === 2 ? 1 : 2);

            PVI.GLR.style.display = PVI.galleryState === 2 ? "" : "none";

            if (PVI.galleryState === 0) {
                PVI.GLR.scrollTop = 0;
                PVI.GLR.textContent = "";

            } else if (PVI.galleryState === 1) {
                if (state === undefined) {
                    PVI.album(0);
                }

            } else {
                PVI.fzEnable();
                PVI.PLAYER?.pause();
                PVI.resetNode(PVI.TRG, true);

                if (!PVI.GLR.childElementCount) {
                    let nodes = [];
                    for (let i = 0; i < album.length; i++) {
                        if (!album[i][0]) continue;
                        let src = album[i][0];
                        let preview = album[i][2];
                        if (Array.isArray(src)) src = src[0];
                        if (!src) continue;
                        if (src[0] === "#") src = PVI.httpPrepend(src.slice(1));
                        let video = isVideoUrl(src) || album[i][1]?.includes(` type="videojs"`);

                        nodes.push({
                            tag: "div",
                            attrs: { class: video ? 'vid' : '' },
                            nodes: [{
                                tag: video && !preview ? "video" : "img",
                                attrs: {
                                    loading: "lazy",
                                    preload: "metadata",
                                    "data-idx": i,
                                    src: preview || src
                                }
                            }]
                        });
                    }
                    buildNodes(PVI.GLR, nodes);
                    setTimeout(() => PVI.GLR.scrollTop = 0, 100);

                } else if (state === undefined) {
                    setTimeout(() => PVI.GLR.querySelector(`[data-idx="${album[0]}"]`)?.scrollIntoView({ block: "center" }), 100);
                }

                // calculate gallery dimensions
                const GRID_SIZE = cfg.hz.galleryGridSize + 8;
                const ratio = window.innerWidth / window.innerHeight;
                const w = Math.floor(Math.ceil(Math.sqrt(album.length)) * Math.sqrt(ratio));
                const h = Math.max(2, Math.ceil(album.length / w));
                PVI.DIV.style.setProperty('--gallery-grid-size', `${cfg.hz.galleryGridSize}px`);
                PVI.GLR._height = Math.floor(Math.min(h * GRID_SIZE, window.innerHeight / 1.2)) + 16;
                PVI.GLR._width  = Math.floor(Math.min(w * GRID_SIZE, window.innerWidth  / 1.2)) + 16;
                // PVI.GLR._width = Math.floor(PVI.GLR._width / GRID_SIZE) * GRID_SIZE + 30;
                PVI.set(`data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${PVI.GLR._width}" height="${PVI.GLR._height}"></svg>`);
            }
        },

        galleryClick: function (ev) {
            ev.preventDefault();
            if (ev.target.localName !== "img" && ev.target.localName !== "video") {
                // PVI.reset();
                return;
            }
            let idx = ev.target.dataset.idx;
            PVI.album("" + idx);
        },

        hiResToggle: function(e) {
            if (PVI.TRG.IMGS_HD_stack) {
                if (PVI.CAP) PVI.CAP.style.display = "none";
                PVI.TRG.IMGS_HD = !PVI.TRG.IMGS_HD;
                const stack = PVI.TRG.IMGS_c || PVI.TRG.IMGS_c_resolved;
                delete PVI.TRG.IMGS_c;
                PVI.set(PVI.TRG.IMGS_HD_stack);
                PVI.TRG.IMGS_HD_stack = stack;
            }
            if (e?.shiftKey) {
                cfg.hz.hiRes = !cfg.hz.hiRes;
            }
        },

        switchToHiResInFZ: function () {
            if (!PVI.fullZm || !PVI.TRG || cfg.hz.hiResOnFZ < 1) return false;
            if (PVI.TRG.IMGS_HD !== false) return false;
            if (PVI.IMG.naturalWidth < 800 && PVI.IMG.naturalHeight < 800) return false;
            var ratio = PVI.IMG.naturalWidth / PVI.IMG.naturalHeight;
            if ((ratio < 1 ? 1 / ratio : ratio) < cfg.hz.hiResOnFZ) return false;
            PVI.show("load");
            PVI.hiResToggle();
            return true;
        },

        fzEnable: function (e) {
            if (!e && PVI.fullZm) return;
            win.removeEventListener("mouseover", PVI.m_over, true);
            doc.removeEventListener("wheel", PVI.onPageScroll, true);
            doc.documentElement.removeEventListener("mouseleave", PVI.m_leave, false);
            PVI.fullZm = (cfg.hz.fzMode !== 1) !== !e?.shiftKey ? 1 : 2;
            PVI.switchToHiResInFZ();
            if (PVI.anim.maxDelay)
                setTimeout(function () {
                    if (PVI.fullZm) PVI.DIV.style.transition = "all 0s";
                }, PVI.anim.maxDelay);
            if (PVI.state > 2) {
                PVI.DIV.style.visibility = "hidden";

                let resizeModes = {
                    "orig": cfg.keys.mOrig,
                    "fit":  cfg.keys.mFit,
                    "fitboth": cfg.keys.mFitBoth,
                    "fitw": cfg.keys.mFitW,
                    "fith": cfg.keys.mFitH,
                    "zoomlock": cfg.keys.mZoomLock,
                }
                PVI.resizeMode = resizeModes[cfg.hz.resizeModeType] || cfg.hz.resizeMode || cfg.keys.mFit;

                PVI.resize(PVI.resizeMode || false);
                PVI.m_move();
                PVI.DIV.style.visibility = "visible";
            }
            if (!PVI.iFrame) win.addEventListener("mousemove", PVI.m_move, true);
            win.addEventListener("click", PVI.fzClickAct, true);
            PVI.DIV.addEventListener("click", PVI.fzClickAct, true);
            PVI.DIV.classList.add("fz");
        },

        fzDragEnd: function () {
            PVI.fullZm = PVI.fullZm > 1 ? 2 : 1;
            win.removeEventListener("mouseup", PVI.fzDragEnd, true);
            PVI.setCursor();
            PVI.DIV.classList.remove("dragging");
        },

        fzClickAct: function (e) {
            if (e.button !== 0) return;

            // clicked inside the root element but handler is attached to the window
            if (PVI.ROOT === e.target) {
                return;
            }

            if (mdownstart === false) {
                mdownstart = null;
                pdsp(e);
                return;
            }

            if (PVI.GLR.contains(e.target) || PVI.TBAR?.contains(e.target)) {
                // clicking inside the gallery or toolbar - ignore
                return;
            }

            if (PVI.VIDEOJS?.contains(e.target)) {
                if (e.target.matches("video, .vjs-poster, .vjs-poster *")) {
                    if ((e.offsetY || e.layerY || 0) < Math.min(PVI.CNT.clientHeight - 40, (2 * PVI.CNT.clientHeight) / 3)) {
                        PVI.DIV.click();

                    } else if (
                        (e.offsetY || e.layerY || 0) < PVI.CNT.clientHeight - 40 &&
                        (e.offsetY || e.layerY || 0) > (2 * PVI.CNT.clientHeight) / 3
                    ) {
                        if (PVI.PLAYER.paused()) {
                            PVI.PLAYER.play();
                        } else {
                            PVI.PLAYER.pause();
                        }
                    }
                    pdsp(e);
                }

            } else if (PVI.DIV.contains(e.target) && PVI.GLR.childElementCount > 0) {
                PVI.gallery();

            } else {
                PVI.reset(true);
            }

            if (e.target.IMGS_ || e.target === PVI.ROOT) pdsp(e);
        },

        onPageScroll: function (e) {
            if (e) {
                if (PVI.fullZm) return;
                if (!e.target.IMGS_ && e.target !== PVI.ROOT) {
                    if (PVI.lastScrollTRG && PVI.lastScrollTRG !== e.target) {
                        PVI.lastScrollTRG = false;
                    } else if (PVI.lastScrollTRG !== false) {
                        PVI.lastScrollTRG = e.target;
                    }
                }
            }
            if (PVI.freeze || PVI.keyup_freeze_on) return;
            if (e) {
                if (PVI.fireHide) PVI.m_over({ relatedTarget: PVI.TRG });
                PVI.x = e.clientX;
                PVI.y = e.clientY;
            }
            PVI.freeze = true;
            win.addEventListener("mousemove", PVI.mover, true);
        },

        mover: function (e) {
            if (PVI.x === e.clientX && PVI.y === e.clientY) return;
            win.removeEventListener("mousemove", PVI.mover, true);
            if (PVI.keyup_freeze_on) {
                PVI.lastScrollTRG = null;
                return;
            }
            if (PVI.freeze === true) PVI.freeze = !cfg.hz.deactivate;
            if (PVI.lastScrollTRG !== e.target) {
                PVI.hideTime -= 1e3;
                PVI.m_over(e);
            }
            PVI.lastScrollTRG = null;
        },

        shouldScroll: function (e, target) {
            const gap = 100;
            let x = e?.clientX || PVI.x;
            let y = e?.clientY || PVI.y;
            target ||= e?.target;
            if (
                PVI.TRG &&
                cfg.hz.pileWheel &&
                !e?.altKey &&
                (
                    !PVI.fullZm ||
                    e?.shiftKey ||
                    x < gap ||
                    y < gap ||
                    win.innerWidth - x < gap ||
                    win.innerHeight - y < gap ||
                    target && !PVI.DIV.contains(target) && (e?.clientX >= 0 || e?.ctrlKey) ||
                    e?.ctrlKey && PVI.isVideo()
                )
            ) {
                return true;
            }
            return false;
        },

        isVideo: function() {
            return PVI.CNT === PVI.VID || PVI.CNT === PVI.VIDEOJS;
        },

        // for backward compatibility with Extension rule
        wheeler: function () {},

        onWheel: function (e) {
            if (e.clientX >= winW || e.clientY >= winH || PVI.state < 0) return;
            const target =
                PVI.ROOT.shadowRoot.elementsFromPoint?.(e.clientX, e.clientY)?.[0] ||
                doc.elementsFromPoint(e.clientX, e.clientY)?.[0];
            // const target = getElementsFromPoint(e.clientX, e.clientY)?.[0];
            if (!target) return;

            if (PVI.DIV.contains(target) &&
                target.closest(".imagus-sidebar, .vjs-control-bar") &&
                !target.closest(".vjs-progress-control, .vjs-volume-panel")
            ) {
                return;
            }

            var d = cfg.hz.scrollDelay;
            if (PVI.state > 2 && d >= 20)
                if (e.timeStamp - (PVI.lastScrollTime || 0) < d) d = null;
                else PVI.lastScrollTime = e.timeStamp;

            const isScroll = PVI.shouldScroll(e, target);
            if (PVI.isVideo() && (
                    e.ctrlKey ||
                    !PVI.TRG?.IMGS_album && !cfg.hz.scrollVideoWithCtrl && isScroll ||
                    target.closest(".vjs-progress-control, .vjs-volume-panel")
                )
            ) {
                pdsp(e);
                if (e.timeStamp - lastZoomScrollTime < 500) {
                    return;
                }
                const wheelDown = cfg.hz.invertWheel ? e.deltaY < 0 : e.deltaY > 0;
                if (target.closest(".vjs-volume-panel")) {
                    PVI.key_action({ which: wheelDown ? 38 : 40, target: PVI.CNT });
                } else {
                    PVI.key_action({ which: wheelDown ? 39 : 37, ctrlKey: true, target: PVI.CNT });
                }
                return;

            } else if (PVI.galleryState === 2 && PVI.GLR.contains(target) && e.ctrlKey) {
                pdsp(e);
                cfg.hz.galleryGridSize = Math.round(cfg.hz.galleryGridSize * (e.deltaY < 0 ? 1.25 : (1 / 1.25)));
                Port.send({ cmd: "savePrefs", prefs: { hz: { galleryGridSize: cfg.hz.galleryGridSize } } });
                PVI.gallery(2);
                return;

            } else if (PVI.galleryState === 2 && PVI.GLR.contains(target) && !e.altKey) {
                // scroll over gallery
                return;

            } else if (isScroll && PVI.TRG.IMGS_album) {
                if (d !== null) {
                    if (e.timeStamp - lastZoomScrollTime < 500) {
                        pdsp(e);
                        return;
                    }
                    if (cfg.hz.smoothScroll) {
                        let rawDelta;
                        if (cfg.hz.pileWheel === 2) {
                            if (!e.deltaX && !e.wheelDeltaX) return;
                            rawDelta = e.deltaX || -e.wheelDeltaX || 0;
                        } else {
                            rawDelta = e.deltaY || -e.wheelDelta || 0;
                        }
                        albumDeltaAccum += rawDelta;
                        clearTimeout(albumDeltaTimer);
                        albumDeltaTimer = setTimeout(() => albumDeltaAccum = 0, 200);
                        if (Math.abs(albumDeltaAccum) >= 80) {
                            PVI.album(albumDeltaAccum > 0 ? 1 : -1, true);
                            albumDeltaAccum = 0;
                        }
                    } else {
                        if (cfg.hz.pileWheel === 2) {
                            if (!e.deltaX && !e.wheelDeltaX) return;
                            d = (e.deltaX || -e.wheelDeltaX) > 0;
                        } else d = (e.deltaY || -e.wheelDelta) > 0;
                        PVI.album(d ? 1 : -1, true);
                    }
                }
                pdsp(e);
                return;

            } else if (PVI.fullZm) {
                if (d !== null) {
                    lastZoomScrollTime = e.timeStamp;
                    const xy_img = PVI.DIV.contains(target) ? [e.clientX, e.clientY] : [];
                    wheelLastXY = PVI.fullZm > 1 ? xy_img : null;

                    if (cfg.hz.smoothScroll) {
                        wheelDeltaAccum += (e.deltaY || -e.wheelDelta || 0);
                        if (!wheelRAF) {
                            wheelRAF = requestAnimationFrame(applyAccumulatedZoom);
                        }
                    } else {
                        PVI.resize((e.deltaY || -e.wheelDelta) > 0 ? "-" : "+", xy_img);
                    }
                }
                pdsp(e);
                return;
            }
            PVI.lastScrollTRG = PVI.TRG;
            PVI.reset();
        },

        setCursor: function (cursor) {
            win.document.documentElement.style.setProperty("cursor", cursor || "", "important");
            PVI.DIV.style.setProperty("cursor", cursor || "");
        },

        resize: function (x, xy_img) {
            if (PVI.state !== 4 || !PVI.fullZm) return;
            var s = PVI.TRG.IMGS_SVG ? PVI.stack[PVI.IMG.src].slice() : [PVI.CNT.naturalWidth, PVI.CNT.naturalHeight];
            var rot = PVI.DIV.curdeg % 180;
            viewportDimensions();
            if (rot) s.reverse();
            let winWI = winW - PVI.DBOX["wpb"] - PVI.DBOX["wm"];
            let winHI = winH - PVI.DBOX["hpb"] - PVI.DBOX["hm"] - PVI.getCapHeight();
            if (x === cfg.keys.mZoomLock) {
                s[0] *= cfg.hz.lockedZoom || 1;
                s[1] *= cfg.hz.lockedZoom || 1;
            } else if (x === cfg.keys.mFit || x === false) {
                if (winWI / winHI < s[0] / s[1]) {
                    x = winWI > s[0] ? false : cfg.keys.mFitW;
                } else {
                    x = winHI > s[1] ? false : cfg.keys.mFitH;
                }
            } else if (x === cfg.keys.mFitBoth) {
                if (winWI / winHI < s[0] / s[1]) {
                    x = cfg.keys.mFitW;
                } else {
                    x = cfg.keys.mFitH;
                }
            }
            switch (typeof x === "number" ? "num" : x) {
                case cfg.keys.mFitW:
                    s[1] *= winWI / s[0];
                    s[0] = winWI;
                    if (PVI.fullZm > 1) PVI.y = 0;
                    break;
                case cfg.keys.mFitH:
                    s[0] *= winHI / s[1];
                    s[1] = winHI;
                    if (PVI.fullZm > 1) PVI.y = 0;
                    break;
                case "+":
                case "-":
                case "num": {
                    let k = [parseInt(PVI.DIV.style.width, 10), 0];
                    k[1] = (k[0] * s[rot ? 0 : 1]) / s[rot ? 1 : 0];
                    if (xy_img) {
                        if (PVI.fullZm > 1 && xy_img.length) {
                            xy_img[0] -= parseFloat(PVI.BOX.style.left) || 0;
                            xy_img[1] -= parseFloat(PVI.BOX.style.top) || 0;
                        }
                        if (xy_img[1] === undefined) {
                            xy_img[0] = k[0] / 2;
                            xy_img[1] = k[1] / 2;
                        }
                        xy_img[0] /= k[rot ? 1 : 0];
                        xy_img[1] /= k[rot ? 0 : 1];
                    }
                    x = typeof x === "number" ?
                        Math.max(0.25, Math.min(4, Math.exp(-x * 0.002877))) :
                        x === "+" ? 4 / 3 : 0.75;
                    s[0] = x * Math.max(16, k[rot ? 1 : 0]);
                    s[1] = x * Math.max(16, k[rot ? 0 : 1]);
                    if (xy_img) {
                        xy_img[0] *= k[rot ? 1 : 0] - s[0];
                        xy_img[1] *= k[rot ? 0 : 1] - s[1];
                    }
                    break;
                }
            }

            if (PVI.resizeMode === cfg.keys.mZoomLock) {
                const natW = PVI.TRG.IMGS_SVG ? PVI.stack[PVI.IMG.src][0] : PVI.CNT.naturalWidth;
                const zoom = natW > 0 ? s[rot ? 1 : 0] / natW : 1;
                if (zoom !== cfg.hz.lockedZoom) {
                    cfg.hz.lockedZoom = zoom;
                    Port.send({ cmd: "savePrefs", prefs: { hz: { lockedZoom: cfg.hz.lockedZoom } } });
                }
            }
            if (!xy_img) xy_img = [true, null];
            xy_img.push(Math.floor(s[rot ? 1 : 0]), Math.ceil(s[rot ? 0 : 1]));
            PVI.m_move(xy_img);
        },

        m_leave: function (e) {
            if (!PVI.fireHide || e.relatedTarget) return;
            if (PVI.x === e.clientX && PVI.y === e.clientY) return;
            PVI.m_over({ relatedTarget: PVI.TRG, clientX: e.clientX, clientY: e.clientY });
        },

        m_over: function (e) {
            if (cfg.hz.deactivate && (PVI.freeze || e[cfg._freezeTriggerEventKey]) || PVI.fullZm || doc.fullscreenElement || PVI.state < 0) return;

            var src, trg, cache;

            if (e.target === PVI.ROOT) return;

            if (PVI.fireHide) {
                if (e.target && (e.target.IMGS_ || ((e.relatedTarget || e).IMGS_ && e.target === PVI.TRG))
                    || e.target === PVI.ROOT || e.relatedTarget === PVI.ROOT
                ) {
                    if (cfg.hz.capNoSBar) e.preventDefault();
                    return;
                }
                if (PVI.CAP) {
                    PVI.CAP.style.display = "none";
                    PVI.CAP.children[0].style.display = "none";
                    PVI.CAP_TIME.style.display = "none";
                }
                clearTimeout(PVI.timers.preview);
                clearInterval(PVI.timers.onReady);
                if (PVI.timers.resolver) {
                    clearTimeout(PVI.timers.resolver);
                    PVI.timers.resolver = null;
                }
                if (e.relatedTarget) {
                    PVI.showHVR(false, e.relatedTarget);
                    const ls = PVI.lastTRGStyle;
                    if (ls.outline !== null) {
                        e.relatedTarget.style.outline = ls.outline;
                        ls.outline = null;
                    }
                    if (ls.cursor !== null) {
                        e.relatedTarget.style.cursor = ls.cursor;
                        ls.cursor = null;
                    }
                }
                if (PVI.nodeToReset) {
                    PVI.resetNode(PVI.nodeToReset);
                    PVI.nodeToReset = null;
                }
                if (PVI.TRG) {
                    if (PVI.DIV)
                        if (PVI.timers.no_anim_in_album) {
                            PVI.timers.no_anim_in_album = null;
                            PVI.DIV.style.transition = PVI.anim.css;
                        }
                    PVI.TRG = null;
                }
                if (PVI.hideTime === 0 && PVI.state < 3) PVI.hideTime = Date.now();
                if (!e.target) {
                    PVI.hide(e);
                    return;
                }
            }

            trg = e.target;
            if (trg.IMGS_c === true || trg.IMGS_m_over) {
                if (PVI.fireHide) PVI.hide(e);
                PVI.showHVR(false);
                return;
            }

            if (e.target?.clientWidth > topWinW * 0.8 && e.target?.clientHeight > topWinH * 0.8 && !e.target.shadowRoot) return;
            if (trg.IMGS_c && trg.IMGS_c !== true) {
                cache = trg.IMGS_c;
            }
            if (!cache)
                if (trg.IMGS_c_resolved) src = trg.IMGS_c_resolved;
                else PVI.TRG = trg;
            if (cache || src || (src = PVI.find(trg, e.clientX, e.clientY)) || src === null) {
                if (src === 1) src = false;
                if (cfg.hz.capNoSBar) e.preventDefault();
                clearTimeout(PVI.timers.preview);
                if (!cfg.hz.waitHide) clearTimeout(PVI.timers.anim_end);
                if (!PVI.iFrame) win.addEventListener("mousemove", PVI.m_move, true);
                if (!cache && src && !trg.IMGS_c_resolved) {
                    if (cfg.hz.preload === 2 && !PVI.stack[src]) PVI._preload(src);
                    trg.IMGS_c_resolved = src;
                }
                PVI.TRG = trg;
                PVI.SRC = cache || src;
                PVI.x = e.clientX;
                PVI.y = e.clientY;
                var isFrozen = PVI.freeze && !cfg.hz.deactivate && !e[cfg._freezeTriggerEventKey];
                if (
                    !isFrozen &&
                    (!cfg.hz.waitHide || cfg.hz.delay < 15) &&
                    ((PVI.fireHide && PVI.state > 2) || PVI.state === 2 || (PVI.hideTime && Date.now() - PVI.hideTime < 200))
                ) {
                    if (PVI.hideTime) PVI.hideTime = 0;
                    PVI.fireHide = 1;
                    PVI.load(PVI.SRC);
                    return;
                }
                if (PVI.fireHide && PVI.state > 2 && (cfg.hz.waitHide || !cfg.hz.deactivate)) {
                    PVI.hide(e);
                    if (!PVI.anim.maxDelay && !PVI.iFrame) win.addEventListener("mousemove", PVI.m_move, true);
                    if (PVI.hideTime) PVI.hideTime = 0;
                }
                PVI.fireHide = true;
                if (cfg.hz.markOnHovered && (isFrozen || cfg.hz.delay >= 25))
                    if (cfg.hz.markOnHovered === "cr" || cfg.hz.markOnHovered === "both") {
                        PVI.lastTRGStyle.cursor = trg.style.cursor;
                        trg.style.cursor = "zoom-in";
                    }
                    if (cfg.hz.markOnHovered === "styled" || cfg.hz.markOnHovered === "both") {
                        PVI.showHVR(true);
                    }
                if (isFrozen) {
                    clearTimeout(PVI.timers.resolver);
                    return;
                }
                var delay = (PVI.state === 2 || PVI.hideTime) && cfg.hz.waitHide ? Math.max(PVI.anim.maxDelay, cfg.hz.delay) : cfg.hz.delay;
                if (delay) PVI.timers.preview = setTimeout(PVI.load, delay);
                else PVI.load(PVI.SRC);

            } else if (trg.shadowRoot) {
                if (!trg.IMGS_m_over) {
                    trg.shadowRoot.addEventListener("mouseover", PVI.m_over, true);
                    trg.IMGS_m_over = true;
                }

            } else {
                trg.IMGS_c = true;
                PVI.TRG = null;
                if (PVI.fireHide) PVI.hide(e);
                PVI.showHVR(false);
            }
        },

        showHVR: function (visible = true, target) {
            PVI.create();
            if (!PVI.HVR) return;
            clearTimeout(PVI.timers.hvr_hide);
            if (!visible){
                if (PVI.HVR?.style.opacity !== "0" && (!target || target === PVI.TRG || PVI.ROOT.contains(target))) {
                    PVI.timers.hvr_hide = setTimeout(() => PVI.HVR.style.opacity = "0", 0);
                }
                win.removeEventListener("scrollend", PVI.updateHVR, { passive: true });
                return;
            }
            if (!PVI.TRG || cfg.hz.markOnHovered !== "styled" && cfg.hz.markOnHovered !== "both") return;
            PVI.HVR.TRG = PVI.TRG;
            const rect = PVI.TRG.getBoundingClientRect();
            const style = win.getComputedStyle(PVI.TRG);
            PVI.HVR.style.width = rect.width + "px";
            PVI.HVR.style.height = rect.height + "px";
            PVI.HVR.style.left = rect.x + "px";
            PVI.HVR.style.top = rect.y + "px";
            PVI.HVR.style.borderTopLeftRadius     = (parseInt(style.borderTopLeftRadius, 10) || 2) + "px";
            PVI.HVR.style.borderTopRightRadius    = (parseInt(style.borderTopRightRadius, 10) || 2) + "px";
            PVI.HVR.style.borderBottomLeftRadius  = (parseInt(style.borderBottomLeftRadius, 10) || 2) + "px";
            PVI.HVR.style.borderBottomRightRadius = (parseInt(style.borderBottomRightRadius, 10) || 2) + "px";
            PVI.HVR.style.display = "block";
            PVI.HVR.style.opacity = "1";
            win.addEventListener("scrollend", PVI.updateHVR, { passive: true });
        },

        updateHVR: function () {
            PVI.showHVR();
        },

        load: function (src) {
            if ((cfg.hz.waitHide || !cfg.hz.deactivate) && PVI.anim.maxDelay && !PVI.iFrame) win.addEventListener("mousemove", PVI.m_move, true);
            if (!PVI.TRG) return;
            if (src === undefined) src = (cfg.hz.delayOnIdle && PVI.TRG.IMGS_c_resolved) || PVI.SRC;
            if (PVI.SRC !== undefined) PVI.SRC = undefined;
            PVI.TBOX = (PVI.TRG.IMGS_overflowParent || PVI.TRG).getBoundingClientRect();
            PVI.TBOX.Left = PVI.TBOX.left + win.pageXOffset;
            PVI.TBOX.Right = PVI.TBOX.Left + PVI.TBOX.width;
            PVI.TBOX.Top = PVI.TBOX.top + win.pageYOffset;
            PVI.TBOX.Bottom = PVI.TBOX.Top + PVI.TBOX.height;

            if ((cfg.hz.markOnHovered === "cr" || cfg.hz.markOnHovered === "both") && PVI.lastTRGStyle.cursor !== null) {
                if (PVI.DIV) PVI.DIV.style.cursor = "";
                PVI.TRG.style.cursor = PVI.lastTRGStyle.cursor;
                PVI.lastTRGStyle.cursor = null;
            }
            if (src === null || (src && src.params) || src === false) {
                if (src === false || (src && (src = PVI.resolve(src.URL, src.params, PVI.TRG)) === 1)) {
                    PVI.create();
                    PVI.show("R_js");
                    return;
                }
                if (src === false) {
                    PVI.reset();
                    return;
                }
                if (src === null) {
                    if (PVI.state < 4 || !PVI.TRG.IMGS_c) {
                        if (PVI.state > 3) PVI.IMG.removeAttribute("src");
                        PVI.create();
                        PVI.show("res");
                    }
                    return;
                }
            }
            if (PVI.TRG.IMGS_album) {
                PVI.createCAP();
                const idx = PVI.TRG.IMGS_album_idx ?? PVI.stack[PVI.TRG.IMGS_album][0];
                PVI.album(String(idx));
                return;
            }
            PVI.set(src);
        },

        m_move: function (e) {
            if (e && PVI.x === e.clientX && PVI.y === e.clientY || doc.fullscreenElement || PVI.state < 0) return;
            rotate(0);
            let trg = e?.target;
            while (trg?.shadowRoot && trg !== PVI.TRG && e.clientX && e.clientY) {
                const newTrg = trg.shadowRoot.elementsFromPoint(e.clientX, e.clientY)?.[0];
                if (!newTrg || newTrg === trg) break;
                trg = newTrg;
            }

            if (PVI.fullZm) {
                const target = e?.clientX >= 0 && PVI.ROOT.shadowRoot.elementsFromPoint(e.clientX, e.clientY)?.[0] || trg;
                if (PVI.shouldScroll(e, target) && (PVI.TRG.IMGS_album || PVI.isVideo() && (!cfg.hz.scrollVideoWithCtrl || e?.ctrlKey))) {
                    PVI.setCursor();
                } else if (trg) {
                    if (PVI.fullZm !== 3) {
                        PVI.setCursor("zoom-in");
                    }
                }
                // that's keydown event
                if (trg && !e.clientX) {
                    e.preventDefault();
                    return;
                }

                var x = PVI.x,
                    y = PVI.y,
                    w,
                    h;
                if (!e) e = {};
                const rot = PVI.state === 4 && PVI.DIV.curdeg % 180;
                if (mdownstart === true) mdownstart = false;
                if (trg) {
                    PVI.x = e.clientX;
                    PVI.y = e.clientY;
                }
                if (PVI.fullZm > 1 && e[0] !== true) {
                    w = PVI.BOX.style;
                    if (PVI.fullZm === 3 && trg) {
                        x = parseFloat(w.left) - x + e.clientX;
                        y = parseFloat(w.top) - y + e.clientY;
                    } else if (e[1] !== undefined) {
                        x = parseFloat(w.left) + e[0];
                        y = parseFloat(w.top) + e[1];
                    } else x = null;
                } else {
                    if (PVI.BOX === PVI.DIV) {
                        if (PVI.TRG.IMGS_SVG) {
                            h = PVI.stack[PVI.IMG.src];
                            h = h[1] / h[0];
                        }
                        w = e[2] || parseInt(PVI.DIV.style.width, 10);
                        h = parseInt(w * (h || PVI.CNT.naturalHeight / PVI.CNT.naturalWidth), 10);
                        w += PVI.DBOX["hpb"];
                        h += PVI.DBOX["wpb"];
                    } else {
                        w = PVI.LDR.wh[0];
                        h = PVI.LDR.wh[1];
                    }
                    let shift = 0;
                    if (rot) {
                        [w, h] = [h, w];
                        shift = (w - h) / 2;
                    }
                    x = (w - PVI.DBOX["wpb"] > winW ? -((PVI.x * (w - winW + 80)) / winW) + 40 : (winW - w) / 2) + shift - PVI.DBOX["ml"];
                    y = (h - PVI.DBOX["hpb"] > winH ? -((PVI.y * (h - winH + 80)) / winH) + 40 : (winH - h) / 2) - shift - PVI.DBOX["mt"] + (PVI.getCapHeight() / 2);
                }
                if (e[2] !== undefined) {
                    w = Math.floor(e[2]);
                    h = Math.ceil(e[3]);
                    PVI.BOX.style.width = w + "px";
                    PVI.BOX.style.height = h + "px";
                    PVI.updateCaption(null, w, h);
                }
                if (x !== null) {
                    PVI.BOX.style.left = Math.floor(x) + "px";
                    PVI.BOX.style.top = Math.floor(y) + "px";
                }
                return;
            }
            PVI.x = e.clientX;
            PVI.y = e.clientY;
            if (PVI.freeze && !cfg.hz.deactivate && !e[cfg._freezeTriggerEventKey]) return;
            if (PVI.state < 3) {
                if (cfg.hz.delayOnIdle && PVI.fireHide !== 1 && PVI.state < 2) {
                    if (PVI.timers.resolver) clearTimeout(PVI.timers.resolver);
                    clearTimeout(PVI.timers.preview);
                    PVI.timers.preview = setTimeout(PVI.load, cfg.hz.delay);
                }
            } else if (
                ((trg?.IMGS_ || trg === PVI.ROOT) && PVI.TBOX &&
                    (PVI.TBOX.Left > e.pageX || PVI.TBOX.Right < e.pageX || PVI.TBOX.Top > e.pageY || PVI.TBOX.Bottom < e.pageY)
                ) ||
                (!trg?.IMGS_ && trg !== PVI.ROOT && PVI.TRG !== trg && !PVI.DIV.contains(trg))
            )
                PVI.m_over({ relatedTarget: PVI.TRG, clientX: e.clientX, clientY: e.clientY });
            else if (cfg.hz.move && PVI.state > 2 && !PVI.timers.m_move && (PVI.state === 3 || cfg.hz.placement < 2 || cfg.hz.placement > 3))
                PVI.timers.m_move = win.requestAnimationFrame(PVI.m_move_show);
        },

        m_move_show: function () {
            if (PVI.state > 2) PVI.show();
            PVI.timers.m_move = null;
        },

        _preload: function (srcs) {
            if (!Array.isArray(srcs)) {
                if (typeof srcs !== "string") return;
                srcs = [srcs];
            }
            for (var i = 0, lastIdx = srcs.length - 1; i <= lastIdx; ++i) {
                var url = srcs[i];
                var isHDUrl = url[0] === "#";
                if (!((cfg.hz.hiRes && isHDUrl) || (!cfg.hz.hiRes && !isHDUrl))) {
                    if (i !== lastIdx) continue;
                    if (i !== 0) {
                        url = srcs[0];
                        isHDUrl = url[0] === "#";
                    }
                }
                if (isHDUrl) url = url.slice(1);
                if (typeof url !== "string") return;
                if (url.indexOf("&amp;") !== -1) url = url.replace(/&amp;/g, "&");
                new Image().src = url[1] === "/" ? PVI.httpPrepend(url) : url;
                return;
            }
        },

        preload: function (e) {
            if (PVI.state < 0) return;

            if (PVI.preloading) {
                if (!e || e.type !== "DOMNodeInserted") {
                    if (e === false) {
                        delete PVI.preloading;
                        doc.body.removeEventListener("DOMNodeInserted", PVI.preload, true);
                    }
                    return;
                }
            } else {
                e = null;
                PVI.preloading = [];
                doc.body.addEventListener("DOMNodeInserted", PVI.preload, true);
            }
            var nodes = (e && e.target) || doc.body;
            if (
                !nodes ||
                nodes.IMGS_ ||
                nodes.nodeType !== 1 ||
                !(nodes = nodes.querySelectorAll('img[src], :not(img)[style*="background-image"], a[href]')) ||
                !nodes.length
            )
                return;
            nodes = [].slice.call(nodes);
            PVI.preloading = PVI.preloading ? PVI.preloading.concat(nodes) : PVI.preloading;
            nodes = function () {
                var node, src;
                var process_amount = 50;
                var onImgError = function () {
                    this.src = this.IMGS_src_arr.shift().replace(/^#/, "");
                    if (!this.IMGS_src_arr.length) this.onerror = null;
                };
                PVI.resolve_delay = 200;
                while ((node = PVI.preloading.shift())) {
                    if (
                        (node.nodeName.toUpperCase() === "A" && node.childElementCount) ||
                        node.IMGS_c_resolved ||
                        node.IMGS_c ||
                        typeof node.IMGS_caption === "string" ||
                        node.IMGS_thumb
                    )
                        continue;
                    if ((src = PVI.find(node))) {
                        node.IMGS_c_resolved = src;
                        if (Array.isArray(src)) {
                            var i,
                                img = new Image();
                            img.IMGS_src_arr = [];
                            for (i = 0; i < src.length; ++i)
                                if (cfg.hz.hiRes && src[i][0] === "#") img.IMGS_src_arr.push(src[i].slice(1));
                                else if (src[i][0] !== "#") img.IMGS_src_arr.push(src[i]);
                            if (!img.IMGS_src_arr.length) return;
                            img.onerror = onImgError;
                            img.onerror();
                        } else if (typeof src === "string" && !rgxIsSVG.test(src)) new Image().src = src;
                        break;
                    }
                    if (src === null || process_amount-- < 1) break;
                }
                PVI.resolve_delay = 0;
                if (PVI.preloading.length) PVI.timers.preload = setTimeout(nodes, 300);
                else delete PVI.timers.preload;
            };
            if (PVI.timers.preload) {
                clearTimeout(PVI.timers.preload);
                PVI.timers.preload = setTimeout(nodes, 300);
            } else nodes();
        },

        onWinResize: function () {
            viewportDimensions();
            if (PVI.state < 3) return;
            if (!PVI.fullZm) {
                PVI.show();
            } else if (PVI.fullZm === 1) {
                if (PVI.resizeMode) {
                    PVI.resize(PVI.resizeMode);
                } else {
                    PVI.m_move();
                }
            }
        },

        winOnMessage: function (e) {
            var d = e.data;
            var cmd = d && d.vdfDpshPtdhhd;
            if (cmd === "toggle" || cmd === "preload" || cmd === "isFrame") {
                var frms = win.frames;
                if (!frms) return;
                var i = frms.length;
                while (i--) {
                    if (!frms[i] || !frms[i].postMessage) continue;
                    try {
                        if (frms[i].location.href.lastIndexOf("about:", 0) === 0) continue;
                    } catch (ex) { /* ignore */ }
                    frms[i].postMessage({ vdfDpshPtdhhd: cmd, parent: doc.body.nodeName.toUpperCase() }, "*");
                }
                if (cmd === "isFrame") {
                    PVI.iFrame = d.parent === "BODY";
                    if (!PVI.iFrame) win.addEventListener("resize", PVI.onWinResize);
                } else PVI[cmd](d);
            } else if (cmd === "from_frame") {
                if (PVI.iFrame) {
                    win.parent.postMessage(d, "*");
                    return;
                }
                if (PVI.fullZm) return;
                if (d.reset) {
                    PVI.reset();
                    return;
                }
                PVI.create();
                PVI.fireHide = true;
                PVI.TRG = PVI.HLP;
                PVI.resetNode(PVI.TRG);
                if (d.hide) {
                    PVI.hide({ target: PVI.TRG, clientX: PVI.DIV.offsetWidth / 2 + cfg.hz.margin, clientY: PVI.DIV.offsetHeight / 2 + cfg.hz.margin });
                    return;
                }

                const iframe = findIframe(e.source);
                const rect = iframe?.getBoundingClientRect() || { x: 0, y: 0 };
                PVI.x = (d.x + rect.x) || 0;
                PVI.y = (d.y + rect.y) || 0;
                if (d.tbox) {
                    PVI.TBOX = {
                        left: d.tbox.left + rect.x,
                        right: d.tbox.right + rect.x,
                        top: d.tbox.top + rect.y,
                        bottom: d.tbox.bottom + rect.y,
                    }
                }

                if (typeof d.msg === "string") {
                    PVI.show(d.msg);
                    return;
                }
                if (!d.src) return;
                PVI.TRG.IMGS_caption = d.caption;
                if (d.album) {
                    PVI.TRG.IMGS_album = d.album.id;
                    if (!PVI.stack[d.album.id]) PVI.stack[d.album.id] = d.album.list;
                    d.album = "" + PVI.stack[d.album.id][0];
                }
                if (d.thumb && d.thumb[0]) {
                    PVI.TRG.IMGS_thumb = d.thumb[0];
                    PVI.TRG.IMGS_thumb_ok = d.thumb[1];
                }
                if (d.album) PVI.album(d.album);
                else PVI.set(d.src);

            } else if (cmd === "relay" && platform === "firefox") {
                const rCmd = d.message?.cmd;
                if (rCmd === "enable" || rCmd === "disable") {
                    Port.send({ cmd: "get_status" });
                } else if (rCmd === "reinit") {
                    PVI.onMessage({ cmd: rCmd });
                }
            }
        },

        onMessage: function (d) {
            if (!d) return;
            if (d.cmd === "resolved") {
                var trg = PVI.resolving[d.id] || PVI.TRG;
                var rule = cfg.sieve[d.params.rule.id];
                delete PVI.resolving[d.id];
                if (!d.return_url) PVI.create();
                if (!d.cache && (d.m === true || d.params.rule.skip_resolve)) {
                    try {
                        if (rule.res === 1 && typeof d.params.rule.req_res === "string") {
                            rule.res = Function(
                                "$",
                                (cfg.hz.debugRules ? "debugger;\n" : "") +
                                d.params.rule.req_res
                            );
                        }
                        PVI.node = trg;
                        d.m = rule.res.call(PVI, d.params);
                    } catch (ex) {
                        console.error(cfg.app?.name + ": [rule " + d.params.rule.id + "] " + ex.message);
                        if (!d.return_url && trg === PVI.TRG) PVI.show("R_js");
                        return 1;
                    }

                    if (PVI.TRG?.IMGS_ext_data &&
                        (typeof d.m === "string" && d.m.trim().toLowerCase() === "imagus://extension" ||
                        typeof d.m?.loop === "string" && d.m.loop.trim().toLowerCase() === "imagus://extension"))
                    {
                        // prevent Extension rule from executing on Videojs item
                        const ext = PVI.parseExtensionItem(PVI.TRG.IMGS_ext_data);
                        if (ext) {
                            d.m = ext;
                            d.noloop = true;
                        }
                    }
                    if (d.params.url) d.params.url = d.params.url.join("");
                    if (cfg.tls.sieveCacheRes && !d.params.rule.skip_resolve && d.m)
                        Port.send({ cmd: "resolve_cache", url: d.params.url, cache: JSON.stringify(d.m), rule_id: d.params.rule.id });
                }
                if (d.m && !Array.isArray(d.m) && typeof d.m === "object")
                    if (d.m[""]) {
                        if (typeof d.m.idx === "number") d.idx = d.m.idx + 1;
                        d.m = d.m[""];
                    } else if (typeof d.m.loop === "string") {
                        d.loop = true;
                        d.m = d.m.loop;
                    }
                if (Array.isArray(d.m))
                    if (d.m.length) {
                        if (Array.isArray(d.m[0])) {
                            d.m.forEach(function (el) {
                                if (Array.isArray(el[0]) && el[0].length === 1) el[0] = el[0][0];
                            });
                            if (d.m.length > 1) {
                                trg.IMGS_album = d.params.url;
                                if (PVI.stack[d.params.url]) {
                                    d.m = PVI.stack[d.params.url];
                                    d.m = d.m[d.m[0]];
                                } else {
                                    PVI.createCAP();
                                    d.idx = Math.max(1, Math.min(d.idx, d.m.length)) || 1;
                                    d.m.unshift(d.idx);
                                    PVI.stack[d.params.url] = d.m;
                                    d.m = d.m[d.idx];
                                    d.idx += "";
                                }
                            } else d.m = d.m[0];
                        }
                        if (cfg.hz.capText && d.m[0]) {
                            if (d.m[1]) PVI.prepareCaption(trg, d.m[1]);
                            else if (/* cfg.hz.capLinkText && */ trg.IMGS_caption) d.m[1] = trg.IMGS_caption;
                        } else if (d.m[0] && d.m[1]) {
                            PVI.prepareCaption(trg, d.m[1]);
                        }
                        d.m = d.m[0];
                    } else d.m = null;
                else if (typeof d.m !== "object" && typeof d.m !== "string") d.m = false;
                if (d.m) {
                    if (
                        !d.noloop &&
                        !trg.IMGS_album &&
                        typeof d.m === "string" &&
                        (d.loop || (rule.loop && rule.loop & (d.params.rule.loop_param === "img" ? 2 : 1)))
                    ) {
                        d.m = PVI.find({ href: d.m, IMGS_TRG: trg });
                        if (d.m === null || d.m === 1) return d.m;
                        else if (d.m === false) {
                            if (!d.return_url) PVI.show("R_res");
                            return d.m;
                        }
                    }
                    if (d.return_url) return d.m;
                    if (trg === PVI.TRG)
                        if (trg.IMGS_album) PVI.album(d.idx || "1");
                        else PVI.set(d.m);
                    else {
                        if (cfg.hz.preload > 1 || PVI.preloading) PVI._preload(d.m);
                        trg.IMGS_c_resolved = d.m;
                    }
                } else if (d.return_url) {
                    delete PVI.TRG.IMGS_c_resolved;
                    return d.m;
                } else if (trg === PVI.TRG) {
                    if (trg.IMGS_fallback_zoom) {
                        PVI.set(trg.IMGS_fallback_zoom);
                        delete trg.IMGS_fallback_zoom;
                        return;
                    }
                    if (d.m === false) {
                        PVI.m_over({ relatedTarget: trg });
                        trg.IMGS_c = true;
                        delete trg.IMGS_c_resolved;
                    } else PVI.show("R_res");
                }

            } else if (d.cmd === "ignore_element") {
                let url = PVI.find(PVI.TRG || PVI.contextEvent.target, PVI.contextEvent.clientX, PVI.contextEvent.clientY, true);
                if (!url) {
                    window.alert(_("CANNOT_FIND_URL"));
                    return;
                }
                url = window.prompt(_("ADD_TO_IGNORE_LIST"), `!:${url}`);
                const grant = /(!{1,2}):(.+)/.exec(url);
                if (!grant) return;

                Port.send({
                    cmd: "ignore_url",
                    grantString: url,
                });

                cfg.grantUrls ||= [];
                cfg.grantUrls.push({ op: grant[1], url: grant[2] });
                PVI.resetNode(PVI.contextEvent.target || PVI.TRG);

            } else if (d.cmd === "toggle" || d.cmd === "preload") {
                win.top.postMessage({ vdfDpshPtdhhd: d.cmd, data: d.data }, "*");

            } else if (d.cmd === "reinit") {
                PVI.reset();
                PVI.resetAllNodes();
                PVI.resetExtension();
                PVI.stack = {};
                PVI.init(null, true);
                window.addEventListener("mousemove", PVI.onInitMouseMove, true);

            } else if (d.cmd === "hello") {
                PVI.init(null, true);
                PVI.init(d);

            } else if (d.cmd === "disable") {
                if (PVI.state !== -1) {
                    PVI.reset();
                    PVI.setState(-1, true);
                }

            } else if (d.cmd === "enable") {
                if (PVI.state === -1) {
                    PVI.setState(0, true);
                }

            } else if (d.cmd === "download") {
                download(d);
            }
        },

        resetExtension: function () {
            if (!PVI.EXTENSION) return;
            PVI.EXTENSION = undefined;
            for (const k of Object.keys(PVI)) {
                if (k.endsWith("_original") && typeof PVI[k] === "function") {
                    const originalKey = k.slice(0, -9);
                    if (typeof PVI[originalKey] === "function") {
                        PVI[originalKey] = PVI[k];
                        delete PVI[k];
                    }
                }
            }
        },

        init: function (e, deinit) {
            if (deinit) {
                PVI.reset();
                PVI.setState(0);
                if (PVI.ROOT) {
                    doc.documentElement.removeChild(PVI.ROOT);
                    PVI.ROOT = PVI.BOX = PVI.DIV = PVI.HVR = PVI.CNT = PVI.VID = PVI.VIDEOJS = PVI.IMG = PVI.CAP = PVI.TRG = PVI.interlacer = null;
                }
                PVI.lastScrollTRG = null;
            } else {
                PVI.iFrame = !!e.isIframe;
                catchEvent.onkeydown = PVI.key_action;
                if (e !== undefined) {
                    if (!e) {
                        PVI.initOnMouseMoveEnd();
                        return;
                    }
                    cfg = e.prefs;
                    if (cfg && !cfg.hz.deactivate && cfg.hz.actTrigger === "0") cfg = null;
                    if (e.disabled) {
                        PVI.setState(-1, true);
                    }
                    PVI.freeze = !cfg.hz.deactivate;
                    cfg._freezeTriggerEventKey = cfg.hz.actTrigger.toLowerCase() + "Key";
                    PVI.convertSieveRegexes();
                    var pageLoaded = function () {
                        doc.removeEventListener("DOMContentLoaded", pageLoaded);
                        if (doc.body) doc.body.IMGS_c = true;
                        if (cfg.hz.preload === 3) PVI.preload();
                        PVI.create();
                    };
                    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", pageLoaded);
                    else pageLoaded();
                } else if (!cfg?.sieve) {
                    PVI.initOnMouseMoveEnd();
                    return;
                }
                viewportDimensions();
                Port.listen(PVI.onMessage);
                catchEvent.onmessage = PVI.winOnMessage;
            }
            e = (deinit ? "remove" : "add") + "EventListener";
            doc[e]("wheel", PVI.onPageScroll, { capture: true, passive: true });
            doc.documentElement[e]("mouseleave", PVI.m_leave, false);
            doc[e]("visibilitychange", PVI.onVisibilityChange, true);
            win[e]("contextmenu", onContextMenu, true);
            win[e]("mouseover", PVI.m_over, true);
            win[e]("mousedown", onMouseDown, true);
            win[e]("mouseup", releaseFreeze, true);
            win[e]("dragend", releaseFreeze, true);
            if (!PVI.iFrame) win[e]("resize", PVI.onWinResize);
            PVI.initOnMouseMoveEnd(!!PVI.capturedMoveEvent);
            if (!win.MutationObserver) {
                PVI.attrObserver = null;
                return;
            }
            PVI.onAttrChange = null;
            if (PVI.mutObserver) {
                PVI.mutObserver.disconnect();
                PVI.mutObserver = null;
            }
            if (deinit) return;

            PVI.mutObserver = new win.MutationObserver(function (muts) {
                var i = muts.length;
                while (i--) {
                    var m = muts[i];
                    var trg = m.target;
                    var attr = m.attributeName;
                    notTRG: if (trg !== PVI.TRG) {
                        if (PVI.TRG) if (trg.contains(PVI.TRG) || PVI.TRG.contains(trg)) break notTRG;
                        PVI.attrObserver(trg, attr === "style", m.oldValue);
                        continue;
                    }
                    if (attr === "title" || attr === "alt") {
                        if (trg[attr] === "") continue;
                    } else if (attr === "style") {
                        var bgImg = trg.style.backgroundImage;
                        if (!bgImg) continue;
                        if (m.oldValue.indexOf(bgImg) !== -1) continue;
                    }
                    PVI.nodeToReset = trg;
                }
            });
            PVI.mutObserverConf = { attributes: true, attributeOldValue: true, attributeFilter: ["href", "src", "style", "alt", "title"] };
        },

        _: function (varName) {
            var value;
            var evName = Math.random().toString(36).slice(2);
            var callback = function (e) {
                this.removeEventListener(e.type, callback);
                value = e.detail;
            };
            win.addEventListener(evName, callback);
            var script = doc.createElement("script");
            script.textContent = "dispatchEvent(new CustomEvent('" + evName + "', {bubbles: false, detail: window['" + varName + "']}))";
            doc.body.appendChild(script).parentNode.removeChild(script);
            return value;
        },

        capturedMoveEvent: null,
        onInitMouseMove: function (e) {
            if (PVI.state < 0) return;
            if (PVI.capturedMoveEvent) {
                PVI.capturedMoveEvent = e;
                return;
            }
            PVI.capturedMoveEvent = e;
            win.top.postMessage({ vdfDpshPtdhhd: "isFrame" }, "*");
            Port.listen(PVI.onMessage);
            Port.send({ cmd: "hello" }, PVI.onMessage);
        },

        initOnMouseMoveEnd: function (triggerMouseover) {
            window.removeEventListener("mousemove", PVI.onInitMouseMove, true);
            if (cfg && triggerMouseover && (!PVI.x || PVI.state !== null)) PVI.m_over(PVI.capturedMoveEvent);
            delete PVI.capturedMoveEvent;
        },
    };

    window.addEventListener("mousemove", PVI.onInitMouseMove, true);
    window.catchEvent ||= {};
    catchEvent.onmessage = PVI.winOnMessage;
})(window, document);
