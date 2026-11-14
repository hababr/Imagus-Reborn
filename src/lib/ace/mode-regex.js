ace.define("ace/mode/regex_highlight_rules", ["require", "exports", "module", "ace/lib/oop", "ace/mode/text_highlight_rules"], function (require, exports, module) {
    "use strict";
    var oop = require("../lib/oop");
    var TextHighlightRules = require("./text_highlight_rules").TextHighlightRules;
    var RegexHighlightRules = function (options) {
        this.$rules = {
            "start": [
                {
                    token: "string.regexp",
                    regex: "^",
                    next: "regex"
                }
            ],
            "regex": [
                {
                    token: "keyword",
                    regex: "\\\\(?:u[\\da-fA-F]{4}|x[\\da-fA-F]{2}|.)"
                }, {
                    token: "invalid",
                    regex: /\{\d+\b,?\d*\}[+*]|[+*$^?][+*]|[$^][?]|\?{3,}/
                }, {
                    token: "variable.language",
                    regex: /\(\?[:=!]|\)|\{\d+\b,?\d*\}|[+*]\?|[()$^+*?.]/
                }, {
                    token: "constant.language.delimiter",
                    regex: /\|/
                }, {
                    token: "constant.language.escape",
                    regex: /\[\^?/,
                    next: "regex_character_class"
                }, {
                    defaultToken: "string.regexp"
                }
            ],
            "regex_character_class": [
                {
                    token: "regexp.charclass.keyword.operator",
                    regex: "\\\\(?:u[\\da-fA-F]{4}|x[\\da-fA-F]{2}|.)"
                }, {
                    token: "constant.language.escape",
                    regex: "]",
                    next: "regex"
                }, {
                    token: "constant.language.escape",
                    regex: "-"
                }, {
                    defaultToken: "string.regexp.charachterclass"
                }
            ],
        };
        this.normalizeRules();
    };
    oop.inherits(RegexHighlightRules, TextHighlightRules);
    exports.RegexHighlightRules = RegexHighlightRules;
});

ace.define("ace/mode/regex", ["require", "exports", "module", "ace/lib/oop", "ace/mode/text", "ace/mode/regex_highlight_rules", "ace/mode/behaviour/cstyle"], function (require, exports, module) {
    "use strict";
    var oop = require("../lib/oop");
    var TextMode = require("./text").Mode;
    var RegexHighlightRules = require("./regex_highlight_rules").RegexHighlightRules;
    var CstyleBehaviour = require("./behaviour/cstyle").CstyleBehaviour;
    var Mode = function () {
        this.HighlightRules = RegexHighlightRules;
        this.$behaviour = new CstyleBehaviour();
    };
    oop.inherits(Mode, TextMode);
    (function () {
        this.$id = "ace/mode/regex";
    }).call(Mode.prototype);
    exports.Mode = Mode;

}); (function () {
    ace.require(["ace/mode/regex"], function (m) {
        if (typeof module == "object" && typeof exports == "object" && module) {
            module.exports = m;
        }
    });
})();
