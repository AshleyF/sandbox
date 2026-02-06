import { Union } from "./fable_modules/fable-library.4.9.0/Types.js";
import { union_type } from "./fable_modules/fable-library.4.9.0/Reflection.js";
import { equals } from "./fable_modules/fable-library.4.9.0/Util.js";
import { singleton, append, delay } from "./fable_modules/fable-library.4.9.0/Seq.js";

export class Key extends Union {
    constructor(tag, fields) {
        super();
        this.tag = tag;
        this.fields = fields;
    }
    cases() {
        return ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "CapA", "CapB", "CapC", "CapD", "CapE", "CapF", "CapG", "CapH", "CapI", "CapJ", "CapK", "CapL", "CapM", "CapN", "CapO", "CapP", "CapQ", "CapR", "CapS", "CapT", "CapU", "CapV", "CapW", "CapX", "CapY", "CapZ", "Esc", "Backspace", "Enter", "Space", "LArrow", "RArrow", "UArrow", "DArrow", "Tilde", "Bang", "At", "Pound", "Dollar", "Percent", "Carot", "Ampersand", "Star", "LParen", "RParen", "Underscore", "Plus", "Backtick", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D0", "Minus", "Equals", "LCurly", "RCurly", "Pipe", "LSquare", "RSquare", "Backslash", "Colon", "Quote", "Semicolon", "Tick", "LAngle", "RAngle", "Question", "Comma", "Dot", "Slash"];
    }
}

export function Key_$reflection() {
    return union_type("Keyboard.Key", [], Key, () => [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []]);
}

export class Modifier extends Union {
    constructor(tag, fields) {
        super();
        this.tag = tag;
        this.fields = fields;
    }
    cases() {
        return ["None", "Control", "Meta"];
    }
}

export function Modifier_$reflection() {
    return union_type("Keyboard.Modifier", [], Modifier, () => [[], [], []]);
}

export function toKey(k) {
    let patternInput;
    if (0 == null) {
        patternInput = [new Modifier(0, []), false];
    }
    else if (1 == null) {
        patternInput = [new Modifier(2, []), false];
    }
    else if (2 == null) {
        patternInput = [new Modifier(0, []), true];
    }
    else if (4 == null) {
        patternInput = [new Modifier(1, []), false];
    }
    else {
        throw new Error("Unexpected modifier");
    }
    const m = patternInput[0];
    const cap = (lower, upper) => {
        if (patternInput[1]) {
            return upper;
        }
        else {
            return lower;
        }
    };
    if (equals(null, 8)) {
        return [new Key(53, []), m];
    }
    else if (equals(null, 13)) {
        return [new Key(54, []), m];
    }
    else if (equals(null, 27)) {
        return [new Key(52, []), m];
    }
    else if (equals(null, 32)) {
        return [new Key(55, []), m];
    }
    else if (equals(null, 37)) {
        return [new Key(56, []), m];
    }
    else if (equals(null, 38)) {
        return [new Key(58, []), m];
    }
    else if (equals(null, 39)) {
        return [new Key(57, []), m];
    }
    else if (equals(null, 40)) {
        return [new Key(59, []), m];
    }
    else if (equals(null, 65)) {
        return [cap(new Key(0, []), new Key(26, [])), m];
    }
    else if (equals(null, 66)) {
        return [cap(new Key(1, []), new Key(27, [])), m];
    }
    else if (equals(null, 67)) {
        return [cap(new Key(2, []), new Key(28, [])), m];
    }
    else if (equals(null, 68)) {
        return [cap(new Key(3, []), new Key(29, [])), m];
    }
    else if (equals(null, 69)) {
        return [cap(new Key(4, []), new Key(30, [])), m];
    }
    else if (equals(null, 70)) {
        return [cap(new Key(5, []), new Key(31, [])), m];
    }
    else if (equals(null, 71)) {
        return [cap(new Key(6, []), new Key(32, [])), m];
    }
    else if (equals(null, 72)) {
        return [cap(new Key(7, []), new Key(33, [])), m];
    }
    else if (equals(null, 73)) {
        return [cap(new Key(8, []), new Key(34, [])), m];
    }
    else if (equals(null, 74)) {
        return [cap(new Key(9, []), new Key(35, [])), m];
    }
    else if (equals(null, 75)) {
        return [cap(new Key(10, []), new Key(36, [])), m];
    }
    else if (equals(null, 76)) {
        return [cap(new Key(11, []), new Key(37, [])), m];
    }
    else if (equals(null, 77)) {
        return [cap(new Key(12, []), new Key(38, [])), m];
    }
    else if (equals(null, 78)) {
        return [cap(new Key(13, []), new Key(39, [])), m];
    }
    else if (equals(null, 79)) {
        return [cap(new Key(14, []), new Key(40, [])), m];
    }
    else if (equals(null, 80)) {
        return [cap(new Key(15, []), new Key(41, [])), m];
    }
    else if (equals(null, 81)) {
        return [cap(new Key(16, []), new Key(42, [])), m];
    }
    else if (equals(null, 82)) {
        return [cap(new Key(17, []), new Key(43, [])), m];
    }
    else if (equals(null, 83)) {
        return [cap(new Key(18, []), new Key(44, [])), m];
    }
    else if (equals(null, 84)) {
        return [cap(new Key(19, []), new Key(45, [])), m];
    }
    else if (equals(null, 85)) {
        return [cap(new Key(20, []), new Key(46, [])), m];
    }
    else if (equals(null, 86)) {
        return [cap(new Key(21, []), new Key(47, [])), m];
    }
    else if (equals(null, 87)) {
        return [cap(new Key(22, []), new Key(48, [])), m];
    }
    else if (equals(null, 88)) {
        return [cap(new Key(23, []), new Key(49, [])), m];
    }
    else if (equals(null, 89)) {
        return [cap(new Key(24, []), new Key(50, [])), m];
    }
    else if (equals(null, 90)) {
        return [cap(new Key(25, []), new Key(51, [])), m];
    }
    else if (equals(null, "!")) {
        return [new Key(61, []), m];
    }
    else if (equals(null, "\"")) {
        return [new Key(93, []), m];
    }
    else if (equals(null, "#")) {
        return [new Key(63, []), m];
    }
    else if (equals(null, "$")) {
        return [new Key(64, []), m];
    }
    else if (equals(null, "%")) {
        return [new Key(65, []), m];
    }
    else if (equals(null, "&")) {
        return [new Key(67, []), m];
    }
    else if (equals(null, "\'")) {
        return [new Key(95, []), m];
    }
    else if (equals(null, "(")) {
        return [new Key(69, []), m];
    }
    else if (equals(null, ")")) {
        return [new Key(70, []), m];
    }
    else if (equals(null, "*")) {
        return [new Key(68, []), m];
    }
    else if (equals(null, "+")) {
        return [new Key(72, []), m];
    }
    else if (equals(null, ",")) {
        return [new Key(99, []), m];
    }
    else if (equals(null, "-")) {
        return [new Key(84, []), m];
    }
    else if (equals(null, ".")) {
        return [new Key(100, []), m];
    }
    else if (equals(null, "/")) {
        return [new Key(101, []), m];
    }
    else if (equals(null, "0")) {
        return [new Key(83, []), m];
    }
    else if (equals(null, "1")) {
        return [new Key(74, []), m];
    }
    else if (equals(null, "2")) {
        return [new Key(75, []), m];
    }
    else if (equals(null, "3")) {
        return [new Key(76, []), m];
    }
    else if (equals(null, "4")) {
        return [new Key(77, []), m];
    }
    else if (equals(null, "5")) {
        return [new Key(78, []), m];
    }
    else if (equals(null, "6")) {
        return [new Key(79, []), m];
    }
    else if (equals(null, "7")) {
        return [new Key(80, []), m];
    }
    else if (equals(null, "8")) {
        return [new Key(81, []), m];
    }
    else if (equals(null, "9")) {
        return [new Key(82, []), m];
    }
    else if (equals(null, ":")) {
        return [new Key(92, []), m];
    }
    else if (equals(null, ";")) {
        return [new Key(94, []), m];
    }
    else if (equals(null, "<")) {
        return [new Key(96, []), m];
    }
    else if (equals(null, "=")) {
        return [new Key(85, []), m];
    }
    else if (equals(null, ">")) {
        return [new Key(97, []), m];
    }
    else if (equals(null, "?")) {
        return [new Key(98, []), m];
    }
    else if (equals(null, "@")) {
        return [new Key(62, []), m];
    }
    else if (equals(null, "[")) {
        return [new Key(89, []), m];
    }
    else if (equals(null, "\\")) {
        return [new Key(91, []), m];
    }
    else if (equals(null, "]")) {
        return [new Key(90, []), m];
    }
    else if (equals(null, "^")) {
        return [new Key(66, []), m];
    }
    else if (equals(null, "_")) {
        return [new Key(71, []), m];
    }
    else if (equals(null, "`")) {
        return [new Key(73, []), m];
    }
    else if (equals(null, "{")) {
        return [new Key(86, []), m];
    }
    else if (equals(null, "|")) {
        return [new Key(88, []), m];
    }
    else if (equals(null, "}")) {
        return [new Key(87, []), m];
    }
    else if (equals(null, "~")) {
        return [new Key(60, []), m];
    }
    else {
        throw new Error("Unexpected console key");
    }
}

export function keys() {
    return delay(() => append(singleton(toKey(null)), delay(keys)));
}

