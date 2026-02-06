import { Record } from "./fable_modules/fable-library.4.9.0/Types.js";
import { record_type, string_type } from "./fable_modules/fable-library.4.9.0/Reflection.js";
import { keys, Key, Modifier_$reflection, Key_$reflection } from "./Keyboard.fs.js";
import { equals } from "./fable_modules/fable-library.4.9.0/Util.js";
import { scan, map, iterate } from "./fable_modules/fable-library.4.9.0/Seq.js";

export class Model extends Record {
    constructor(Screen) {
        super();
        this.Screen = Screen;
    }
}

export function Model_$reflection() {
    return record_type("Program.Model", [], Model, () => [["Screen", string_type]]);
}

export class Input extends Record {
    constructor(Key, Modifier) {
        super();
        this.Key = Key;
        this.Modifier = Modifier;
    }
}

export function Input_$reflection() {
    return record_type("Program.Input", [], Input, () => [["Key", Key_$reflection()], ["Modifier", Modifier_$reflection()]]);
}

export function init() {
    return new Model("");
}

export function view(model) {
    console.log(model.Screen);
}

export function update(model, input) {
    if (equals(input.Key, new Key(0, []))) {
        return new Model(model.Screen + "A");
    }
    else {
        return model;
    }
}

iterate((model_1) => {
    view(model_1);
}, (() => {
    const source_1 = map((tupledArg) => (new Input(tupledArg[0], tupledArg[1])), keys());
    return scan(update, init(), source_1);
})());

