
import debugLib from "debug";

var Promise = require("bluebird");

let hooks = [];

export class Hook {

    constructor(name) {
        Hook.validateHookName(name);
        this._name = name;
        this._debug = debugLib(`hooks ${name}`);
        hooks.push(this);
    }

    before(data) {
        this._debug(`hit before`);
        return Promise.resolve(data);
    }

    beforeSync(data) {
        this._debug(`hit before`);
        return data;
    }

    after(data) {
        this._debug(`hit after`);
        return Promise.resolve(data);
    }

    afterSync(data) {
        this._debug(`hit after`);
        return data;
    }

    get name() {
        return this._name; 
    }

    static validateHookName(name) {
        let actual = hooks.find(x => x.name === name);

        if (actual) {
            throw new Error("Hook already exists");
        }

        if (!name.match(/^[a-z]+:[a-z]+(\.[a-z]+)*$/i)) {
            throw new Error("Invalid hook name");
        } 

    }

}

export const declareHook = function (name) {
    return new Hook(name);
}

export const hookDecorator = function () {
    debugLib("Averdolaga")(arguments);
    return function decorator (cls, methodName, target) {
        debugLib("Averga")(target.value.bind());
        process.exit(0);
    }
}
