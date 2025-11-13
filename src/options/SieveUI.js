"use strict";

var sieve_sec,
    sieve_container,
    SieveUI = {
        loaded: false,
        lastClicked: null,
        lastXY: [],
        cntr: 0,
        sieve: {},
        init: function () {
            this.loaded = true;
            this.search_f = document.getElementById("sieve_search");
            this.info_container = sieve_sec.querySelector(".container_info");
            this.countRules();
            this.search_f.onkeydown = function (e) {
                clearTimeout(this.timer);
                if (e.keyCode === 27) {
                    this.value = "";
                    SieveUI.search();
                    e.preventDefault();
                    return;
                } else if (e.keyCode === 13) {
                    e.preventDefault();
                    SieveUI.search();
                    var visibles = document.querySelectorAll("#sieve_container > div:not(.hidden)");
                    if (visibles.length === 1) {
                        visibles[0].classList.toggle("opened");
                        if (!visibles[0].lastElementChild.textContent) SieveUI.genData(visibles[0]);
                    }
                    return;
                }
                this.timer = setTimeout(SieveUI.search, 200);
            };
            document.addEventListener("keydown", function (e) {
                if (document.location.hash !== "#sieve") return;
                let t = e.target;
                if (t.nodeName === "SPAN" && (e.code === "Escape" || e.code === "Enter")) {
                    e.preventDefault();
                    let rname = t.textContent.trim();
                    if (
                        e.code === "Escape" &&
                        rname === "" &&
                        t.nextElementSibling.textContent &&
                        [].every.call(t.parentNode.querySelectorAll('input[type="text"], textarea'), function (el) {
                            return el.value.trim() === "";
                        })
                    ) {
                        t.parentNode.parentNode.removeChild(t.parentNode);
                        SieveUI.countRules();
                    } else if (t.textContent) {
                        rname = rname.replace(/[\s,]+/g, "_").substr(0, 50);
                        if (t.parentNode.rule !== rname) {
                            if (SieveUI.sieve[rname]) {
                                color_trans(t, "red");
                                return;
                            }
                            if (t.parentNode.rule && SieveUI.sieve[t.parentNode.rule]) {
                                SieveUI.sieve[rname] = SieveUI.sieve[t.parentNode.rule];
                                delete SieveUI.sieve[t.parentNode.rule];
                            }
                        }
                        t.textContent = t.parentNode.rule = rname;
                        t.contentEditable = false;
                        t.className = "";
                        if (e.code === "Enter") {
                            t = t.parentNode.querySelector('input[type="text"]');
                            if (t) t.focus();
                        }
                    }
                } else if (t.isContentEditable || t.nodeName === "INPUT" || t.nodeName === "TEXTAREA") {
                    return;
                } else if (e.code === "Escape") {
                    sieve_container.querySelectorAll("div.selected").forEach(el => el.classList.remove("selected"));
                } else if (e.code === "KeyE" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    SieveUI.export();
                } else if (e.code === "Delete") {
                    e.preventDefault();
                    SieveUI.remove();
                } else if (e.code === "Space" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    SieveUI.disable();
                } else if (e.code === "KeyI" && (e.ctrlKey || e.metaKey) || e.code === "Insert") {
                    e.preventDefault();
                    document.querySelector("[data-action='import-rules']").click();
                }
            });
            sieve_container.onmousedown = SieveUI.move;
            sieve_container.onclick = SieveUI.click;
            sieve_container.oncontextmenu = SieveUI.rightClick;
            sieve_sec.querySelector(".action_buttons").onclick = function (e) {
                switch (e.target.dataset.action) {
                    case "●":
                        SieveUI.select("add");
                        break;
                    case "○":
                        SieveUI.select("remove");
                        break;
                    case "◐":
                        SieveUI.select("toggle");
                        break;
                    case "new-rule":
                        SieveUI.add();
                        break;
                    case "delete-rules":
                        SieveUI.remove();
                        break;
                    case "toggle-rules":
                        SieveUI.disable();
                        break;
                    case "import-rules":
                        ImprtHandler(_("NAV_SIEVE"), SieveUI.load);
                        break;
                    case "export-rules":
                        SieveUI.export(e);
                        break;
                    case "copy-rules":
                        SieveUI.export(e, null, true);
                        break;
                    case "update-rules":
                        SieveUI.update();
                        break;
                    case "show-details":
                        var t = $("sieve_tips").style;
                        t.display = "none" === t.display ? "block" : "none";
                }
            };
        },
        load: function (local_sieve, options) {
            if (!local_sieve && SieveUI.loaded) return;
            try {
                var ignored_rules, name, rule, sfrag, visible_rules, i;
                sieve_sec = $("sieve_sec");
                sieve_container = $("sieve_container");
                if (local_sieve) ignored_rules = [];
                else local_sieve = cfg.sieve || {};
                if (options && options.clear) sieve_container.textContent = "";
                if (Object.keys(local_sieve).length) {
                    sfrag = document.createDocumentFragment();
                    visible_rules = {};
                    i = sieve_container.childElementCount;
                    while (i--) {
                        rule = sieve_container.children[i];
                        if (rule.rule) visible_rules[rule.rule] = rule;
                    }
                    for (name in local_sieve) {
                        if (visible_rules[name] && options && !options.overwrite) {
                            ignored_rules.push(name);
                            continue;
                        }
                        rule = SieveUI.genEntry(name, local_sieve[name], visible_rules[name]?.classList.contains("opened"));
                        if (visible_rules[name]) {
                            sieve_container.replaceChild(rule, visible_rules[name]);
                        } else sfrag.appendChild(rule);
                        SieveUI.sieve[name] = local_sieve[name];
                    }
                    if (sfrag.childNodes.length)
                        if (sieve_container.firstElementChild) sieve_container.insertBefore(sfrag, sieve_container.firstElementChild);
                        else sieve_container.appendChild(sfrag);
                }
                if (SieveUI.loaded) {
                    SieveUI.countRules();
                    SieveUI.sieve = SieveUI.prepareRules();
                } else SieveUI.sieve = local_sieve;
                if (ignored_rules && ignored_rules.length) console.log(app.name, "Ignored rules:", ignored_rules);
            } catch (ex) {
                console.error(ex);
            }
            if (!SieveUI.loaded) SieveUI.init();
        },
        prepareRules: function (ignore_dupes) {
            var rgxWhitespace = /\s+/g,
                output = {},
                dupes = [],
                rules = sieve_sec.querySelectorAll("#sieve_container > div"),
                some_func = function (el) {
                    return el.env?.editor?.getValue().trim() !== "" || el.value.trim() !== "";
                };
            for (let i = 0; i < rules.length; ++i) {
                const rule = rules[i].querySelector(":scope > [data-action='rule']");
                const opt_name = rule.textContent.trim().replace(rgxWhitespace, " ");
                rule.textContent = opt_name;
                if (!opt_name && (!rule.nextElementSibling.textContent || [].some.call(rules[i].querySelectorAll('input[type="text"], textarea, pre'), some_func))) {
                    alert(_("SIV_ERR_EMPTYNAME"));
                    rule.contentEditable = true;
                    rule.focus();
                    return null;
                }
                if (!ignore_dupes && output[opt_name]) dupes.push(opt_name.replace(/[[\]{}()*+?.\\^$|]/g, "\\$&"));
                output[opt_name] = true;
            }
            if (!ignore_dupes && dupes.length) {
                alert(_("SIV_ERR_DUPENAME"));
                SieveUI.search_f.value = dupes
                    .filter(function (el, idx, s) {
                        return s.indexOf(el, idx + 1) < 0;
                    })
                    .join("|");
                SieveUI.search();
                return null;
            }
            output = {};
            for (let i = 0; i < rules.length; ++i) {
                let opt_name = rules[i].querySelector(":scope > [data-action='rule']").textContent;
                if (!opt_name) continue;
                output[opt_name] = {};
                let rule = output[opt_name];
                if (rules[i].classList.contains("disabled")) rule.off = 1;

                const params = rules[i].querySelectorAll("[data-name]");
                if (!params.length) {
                    if (SieveUI.sieve[rules[i].rule]) {
                        rule = SieveUI.sieve[rules[i].rule];
                        if (rules[i].classList.contains("disabled")) rule.off = 1;
                        else delete rule.off;
                        output[opt_name] = rule;
                        if (rules[i].rule === opt_name) rules[i].rule = opt_name;
                    }
                    continue;
                }

                for (let j = 0; j < params.length; ++j) {
                    let name = params[j].dataset.name;
                    switch (name) {
                        case "useimg":
                            if (params[j].checked) rule[name] = 1;
                            break;
                        case "note":
                            params[j].value = params[j].value.trim();
                            rule[name] = params[j].value.replace(/\r\n?/g, "\n");
                            break;
                        case "link":
                        case "url":
                        case "res":
                        case "img":
                        case "to": {
                            let value = params[j].env?.editor?.getValue();
                            if (typeof value === "string" && value !== "") {
                                rule[name] = value.replace(/\r\n?/g, "\n");
                            }
                            break;
                        }
                        case "link_ci":
                        case "img_ci":
                        case "link_dc":
                        case "img_dc":
                        case "link_loop":
                        case "img_loop":
                            opt_name = name.split("_");
                            name = opt_name[1];
                            opt_name = opt_name[0];
                            if (rule[opt_name] && params[j].checked) {
                                opt_name = (rule[name] || 0) | (opt_name === "link" ? 1 : 2);
                                if (opt_name) rule[name] = opt_name;
                            }
                            break;
                    }
                }
            }
            return output;
        },
        countRules: function (msg) {
            var count = (sieve_sec.querySelectorAll("#sieve_container > div:not(.hidden)") || []).length;
            $("sieve_count").textContent = count;
            if (count) this.info_container.style.display = "none";
            else {
                this.info_container.textContent = _(msg || (this.search_f.value.trim() ? "NOMATCH" : "EMPTY"));
                this.info_container.style.display = "block";
            }
        },
        genData: function (container, data) {
            ++this.cntr;
            var vals = container.lastChild,
                c = "[" + this.cntr + "]",
                sd = data || this.sieve[container.rule] || {};

            buildNodes(container, [
                {
                    tag: "div", attrs: { class: "action_buttons" },
                    nodes: [
                        { tag: "span", attrs: { title: _("SIV_REN_RULE"), "data-action": "rename" },  nodes: ["✏️"] },
                        { tag: "span", attrs: { title: _("SIV_TOG_RULE"), "data-action": "toggle", class: "bold" },  nodes: ["Ø"] },
                        { tag: "span", attrs: { title: _("SIV_DEL_RULE"), "data-action": "delete", class: "bold" },  nodes: ["-"] },
                        { tag: "span", attrs: { title: _("SIV_EXP_RULE"), "data-action": "export", class: "bold" },  nodes: ["↑"] },
                        { tag: "span", attrs: { title: _("SIV_COPY_RULE"), "data-action": "copy" },  nodes: ["📋"] },
                        { tag: "span", attrs: { title: _("SIV_FORMAT_JS"), "data-action": "format" },  nodes: ["{}"] },
                    ]
                }
            ]);

            buildNodes(vals, [
                {
                    tag: "div",
                    attrs: { class: "rule_line" },
                    nodes: [
                        { tag: "label", nodes: ["Link:"] },
                        { tag: "pre", attrs: { "data-name": "link", placeholder: "link", class: "sieve_shorter_inp tar_small" } },
                        { tag: "input", attrs: { type: "checkbox", id: "link_ci", "data-name": "link_ci" } },
                        { tag: "label", attrs: { class: "checkbox" } },
                        { tag: "input", attrs: { type: "checkbox", id: "link_dc", "data-name": "link_dc" } },
                        { tag: "label", attrs: { class: "checkbox" } },
                        { tag: "input", attrs: { type: "checkbox", id: "link_loop", "data-name": "link_loop" } },
                        { tag: "label", attrs: { class: "checkbox" } },
                    ]
                },
                {
                    tag: "div",
                    attrs: { class: "rule_line" },
                    nodes: [
                        { tag: "label", nodes: ["Url:"] },
                        { tag: "pre", attrs: { "data-name": "url", placeholder: "url", class: "tar_small" } },
                    ]
                },
                {
                    tag: "div",
                    attrs: { class: "rule_line" },
                    nodes: [
                        { tag: "label", nodes: ["Res:"] },
                        { tag: "pre", attrs: { "data-name": "res", placeholder: "res", class: "tar_code" } },
                    ]
                },
                { tag: "hr" },
                {
                    tag: "div",
                    attrs: { class: "rule_line" },
                    nodes: [
                        { tag: "label", nodes: [""] },
                        {
                            tag: "label",
                            nodes: [
                                { tag: "input", attrs: { type: "checkbox", "data-name": "useimg" } },
                                { tag: "label", attrs: { class: "checkbox" } },
                                " " + _("SIV_USEIMG"),
                            ]
                        }
                    ]
                },
                {
                    tag: "div",
                    attrs: { class: "rule_line" },
                    nodes: [
                        { tag: "label", nodes: ["Img:"] },
                        { tag: "pre", attrs: { "data-name": "img", placeholder: "img", class: "sieve_shorter_inp tar_small" } },
                        { tag: "input", attrs: { type: "checkbox", id: "img_ci", "data-name": "img_ci" } },
                        { tag: "label", attrs: { class: "checkbox" } },
                        { tag: "input", attrs: { type: "checkbox", id: "img_dc", "data-name": "img_dc" } },
                        { tag: "label", attrs: { class: "checkbox" } },
                        { tag: "input", attrs: { type: "checkbox", id: "img_loop", "data-name": "img_loop" } },
                        { tag: "label", attrs: { class: "checkbox" } },
                    ]
                },
                {
                    tag: "div",
                    attrs: { class: "rule_line" },
                    nodes: [
                        { tag: "label", nodes: ["To:"] },
                        { tag: "pre", attrs: { "data-name": "to", placeholder: "to", class: "tar_code" } },
                    ]
                },
                { tag: "hr" },
                {
                    tag: "div",
                    attrs: { class: "rule_line" },
                    nodes: [
                        { tag: "label", nodes: ["Note:"] },
                        { tag: "textarea", attrs: { "data-name": "note", placeholder: "note", class: "" } },
                    ]
                }
            ]);
            vals = vals.querySelectorAll("input, textarea, [data-name]");
            for (const el of vals) {
                if (el.id) {
                    const inp_name = el.id.split("_");
                    el.defaultChecked = el.checked = sd[inp_name[1]] && sd[inp_name[1]] & (inp_name[0] === "img" ? 2 : 1);
                    el.id += c;
                    el.nextSibling.setAttribute("for", el.id);
                    el.nextSibling.title = _("SIV_" + inp_name[1].toUpperCase());
                }
                if (el.nodeName === 'PRE' && el.dataset.name) {
                    let value = sd[el.dataset.name] || "";
                    let small = el.classList.contains("tar_small");
                    let isCode = value.startsWith(":");
                    let editor = ace.edit(el, {
                        mode: !isCode ? "ace/mode/tex" : "ace/mode/javascript",
                        theme: "ace/theme/chrome",
                        useWorker: false,
                        selectionStyle: "text",
                        wrap: true,
                        cursorStyle: "slim",
                        animatedScroll: true,
                        printMargin: false,
                        showGutter: !small,
                        highlightActiveLine: !small,
                        // minLines: small ? 1 : 5,
                        // maxLines: small ? 10 : 300,
                        value: value,
                        tabSize: 2,
                        indentedSoftWrap: isCode,
                        enableBasicAutocompletion: true,
                        enableSnippets: true,
                        enableLiveAutocompletion: !small,
                    });
                    editor.session.setOptions({
                        wrap: true,
                        wrapMethod: isCode ? "code" : "text",
                    });
                    editor.renderer.setScrollMargin(4, 4, 0, 0);
                    editor.setKeyboardHandler("ace/keyboard/vscode");
                    if (!small) {
                        editor.on('focus', function (ev) {
                            ev.target.parentElement.classList.add("tar_focus");
                        });
                    }
                } else if (el.dataset.name) {
                    if (sd[el.dataset.name])
                        if (el.type === "checkbox") {
                            el.defaultChecked = el.checked = !!sd[el.dataset.name];
                        } else {
                            el.defaultValue = el.value = sd[el.dataset.name] || "";
                        }
                }
            }
        },
        genEntry: function (name, data, open) {
            var container = document.createElement("div");
            if (data?.off) container.classList.add("disabled");
            if (open) container.classList.add("opened");
            container.rule = name;
            buildNodes(container, [
                { tag: "span", attrs: { "data-action": "rule" } },
                { tag: "div", attrs: { "data-form": "1" } },
            ]);
            if (name) container.firstChild.textContent = name;
            if (open) this.genData(container, data);
            return container;
        },
        add: function () {
            sieve_container.insertBefore(this.genEntry(), sieve_container.firstElementChild);
            var rd = sieve_container.firstElementChild,
            rd_fc = rd.querySelector(':scope > [data-action="rule"]');
            rd_fc.click();
            rd.querySelector('[data-action="rename"]').click();
            this.countRules();
            $("save_button").classList.add("alert");
        },
        select: function (type, i, until) {
            var cl;
            i = i || 0;
            until = until || sieve_container.childElementCount;
            for (; i < until; ++i) {
                cl = sieve_container.children[i].classList;
                if (!cl.contains("hidden")) cl[type]("selected");
            }
        },
        click: function (e) {
            e.stopPropagation();
            const target = e.target;
            const action = target.dataset?.action;
            if (!action || e.button !== 0) return;

            if (action === "rule") {
                if (e.shiftKey && SieveUI.lastClicked !== null) {
                    let child = e.target.parentNode;
                    let currentIndex = 0;
                    while ((child = child.previousElementSibling)) currentIndex++;
                    SieveUI.select(
                        sieve_container.children[SieveUI.lastClicked].classList.contains("selected") ? "add" : "remove",
                        Math.min(SieveUI.lastClicked, currentIndex),
                        Math.max(SieveUI.lastClicked, currentIndex) + 1
                    );
                } else if (e.ctrlKey || e.metaKey) {
                    SieveUI.lastClicked = 0;
                    let child = e.target.parentNode;
                    while ((child = child.previousElementSibling)) SieveUI.lastClicked++;
                    e.target.parentNode.classList.toggle("selected");
                    e.preventDefault();
                } else if (!e.target.isContentEditable &&
                    (!e.clientX || Math.abs(SieveUI.lastXY[0] - e.clientX) < 4) &&
                    (!e.clientY || Math.abs(SieveUI.lastXY[1] - e.clientY) < 4)
                ) {
                    e.target.parentNode.classList.toggle("opened");
                    if (!e.target.nextElementSibling.textContent) SieveUI.genData(e.target.parentNode);
                }

            } else if (action === "delete") {
                SieveUI.remove([target.closest(".opened")]);

            } else if (action === "toggle") {
                SieveUI.disable([target.closest(".opened")]);

            } else if (action === "export") {
                SieveUI.export(e, [target.closest(".opened")]);

            } else if (action === "copy") {
                SieveUI.export(e, [target.closest(".opened")], true);

            } else if (action === "rename") {
                SieveUI.renameRule(target.closest(".opened"));

            } else if (action === "format") {
                SieveUI.formatEditor(target.closest(".opened")?.querySelector(".ace_editor.ace_focus"));
            }
        },
        move: function (e) {
            e.stopPropagation();
            SieveUI.lastXY = [e.clientX, e.clientY];
            var div = e.target.parentNode,
                i,
                list;
            if (e.target.isContentEditable || e.target.nodeName !== "SPAN" || div.classList.contains("opened") || e.button !== 0) return;
            e.preventDefault();
            document.onmousemove = function (e) {
                if (Math.abs(SieveUI.lastXY[0] - e.clientX) < 4 && Math.abs(SieveUI.lastXY[1] - e.clientY) < 4) return;
                div.style.cssText = "left:" + (e.clientX + 15) + "px;" + "top:" + (e.clientY + 15) + "px";
                if (div.classList.contains("move")) return;
                div.classList.add("move");
                list = sieve_container.querySelectorAll((div.classList.contains("selected") ? ".selected, " : "") + ".move");
                for (i = 0; i < list.length; ++i) if (div !== list[i]) list[i].classList.add("move_multi");
            };
            document.onmouseup = function (e) {
                if (div.classList.contains("move") && e.target.parentNode.rule) {
                    var dcfr = document.createDocumentFragment();
                    for (i = 0; i < list.length; ++i) {
                        sieve_container.removeChild(list[i]);
                        dcfr.appendChild(list[i]);
                    }
                    sieve_container.insertBefore(dcfr, e.target.parentNode);
                }
                div.classList.remove("move");
                div.style.top = div.style.left = null;
                list = sieve_container.querySelectorAll(".move_multi");
                for (i = 0; i < list.length; ++i) list[i].classList.remove("move_multi");
                sieve_container.onmouseover = document.onmouseup = document.onmousemove = null;
            };
        },
        export: function (e, rules, copy) {
            if (!sieve_container.childElementCount) return;
            var selected = rules || sieve_container.querySelectorAll("div.selected"),
                sieve = SieveUI.prepareRules(true),
                exp = {};
            if (!sieve) return;
            if (selected.length) {
                for (let i = 0; i < selected.length; ++i) {
                    exp[selected[i].rule] = sieve[selected[i].rule];
                }
            } else {
                exp = sieve;
            }
            exp = JSON.stringify(exp, null, e?.shiftKey ? 0 : 2);
            const name = !selected.length ? `sieve` : selected.length === 1 ? `${selected[0].rule}` : `rules`;
            if (exp !== "{}") {
                if (copy) {
                    navigator.clipboard.writeText(exp)
                    .catch(err => {
                        console.error("Failed to copy to clipboard:", err);
                        alert("Failed to copy to clipboard.");
                    });
                } else {
                    download(exp, `Imagus_${name}.json`, e?.ctrlKey || e?.metaKey);
                }
            }
        },
        disable: function (rules) {
            let list = rules || sieve_container.querySelectorAll("div.selected");
            if (!list?.length) {
                list = sieve_container.children;
            }
            for (let i = 0; i < list.length; ++i) {
                list[i].classList.toggle("disabled");
                list[i].classList.remove("selected");
            }
            $("save_button").classList.add("alert");
        },
        remove: function (rules) {
            var list = rules || sieve_container.querySelectorAll("div.selected");
            let names = [...list].map(d => d.querySelector('[data-action="rule"]').textContent).join(", ") || "All rules";
            if (!confirm(_("DELITEMS") + "\n\n" + names)) return;

            if (list?.length) {
                for (let i = 0; i < list.length; ++i) {
                    sieve_container.removeChild(list[i]);
                    delete SieveUI.sieve[list[i].rule];
                    $("save_button").classList.add("alert");
                }
            } else {
                sieve_container.textContent = "";
                SieveUI.sieve = {};
                $("save_button").click();
            }
            this.countRules();
        },
        rightClick: function (e) {
            e.stopPropagation();
            let target = e.target;
            let action = target.dataset?.action;

            if (action === "rule") {
                e.preventDefault();
                document.getSelection().removeAllRanges();
                if (e.shiftKey) {
                    SieveUI.disable([target.parentElement]);
                } else if (e.ctrlKey || e.metaKey) {
                    SieveUI.remove([target.parentNode]);
                } else if (e.altKey) {
                    SieveUI.export(e, [target.parentNode]);
                } else {
                    SieveUI.renameRule(target.parentNode);
                }
            }
        },
        renameRule: function (ruleNode) {
            let span = ruleNode.querySelector("[data-action='rule']");
            span.textContent = span.textContent.trim();
            span.contentEditable = !span.isContentEditable;
            span.className = span.isContentEditable ? "focus" : "";
            if (span.isContentEditable) {
                span.focus();
            }
        },
        formatEditor: function (pre) {
            const editor = pre?.env?.editor;
            if (!editor) return;
            const value = editor.getValue() || "";
            if (value.startsWith(":")) {
                const cur = editor.selection.getCursor();
                editor.setValue(
                    // options: https://beautifier.io
                    js_beautify(value, {
                        "indent_size": "2",
                        "keep_array_indentation": true,
                        "space_before_conditional": true,
                        "brace_style": "none,preserve-inline",
                    }),
                    -1
                );
                editor.gotoLine(cur.row + 1, cur.column);
            }
        },

        search: function () {
            var what = RegExp(SieveUI.search_f.value.trim() || ".", "i"),
                list = sieve_container.children,
                i = list.length;
            while (i--) {
                let name = list[i].querySelector(":scope > [data-action='rule']").textContent;
                if (name) {
                    list[i].classList[what.test(name) ? "remove" : "add"]("hidden");
                }
            }
            SieveUI.countRules();
        },
        update: async function (local) {
            if (local || !cfg.sieve || !Object.keys(cfg.sieve).length || confirm(_("SIV_UPDALERT"))) {
                sieve_container.textContent = "";
                SieveUI.countRules("LOADING");
                let res = await Port.send({ cmd: "update_sieve", local: !!local });
                if (res?.updated_sieve) {
                    SieveUI.load(res.updated_sieve);
                } else if (res?.error) {
                    alert(res.error);
                    if (confirm(_("SIV_LOCALALERT"))) {
                        SieveUI.update(true);
                        return;
                    }
                }
                readCfg();
            }
        },
    };
