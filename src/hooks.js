
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
            throw new Error(`Invalid hook name ${name}`);
        } 

    }

}

export const declareHook = function (name) {
    return new Hook(name);
}

export const resolveParams = function (names, params) {
    let restParam = null, result = {};

    if (!names.length) {
        throw new Error('Name is empty');
    }

    if (names[names.length - 1].match(/^\.{3}/)) {
        restParam = names.pop().replace(/^\.{3}/,'');
    }

    for (let i = 0; i < names.length; i++) {
        result[names[i]] = params.length ? params.shift() : undefined; 
    }

    if (params.length && restParam) {
        result[restParam] = params;
    } else if (params.length && !restParam) {
        throw new Error('Invalid numer of params');
    } else if (restParam) {
        result[restParam] = [];
    }

    return result;
}

export const plainParams = function (names, params) {
    return names.map((name) => {
        return params[name];
    });
}

export const syncHookedMethod = function (name, ...params) {
    if (!params.length) {
        params = false;
    } else if (params.length === 1) {
        if (typeof params[0] !== 'string') {
            params = !!params[0];
        }
    }

    return function decorator (cls, methodName, target) {
        let of = target.value;
        let hook = declareHook(name);

        if (typeof target.value !== 'function') {
            throw new Error('Target method must to be a function');
        }

        target.value = function (...fargs) {
            let paramsObject = params ? resolveParams(params, fargs) : fargs[0];
            let pargs = hook.beforeSync(paramsObject)
            let result = of.apply(this, params ? pargs : [pargs]);
            return hook.afterSync(result);
        };
    }

}

export const asyncHookedMethod = function (name, ...params) {
    if (!params.length) {
        params = false;
    } else if (params.length === 1) {
        if (typeof params[0] !== 'string') {
            params = !!params[0];
        }
    }

    return function decorator (cls, methodName, target) {
        let of = target.value;
        let hook = declareHook(name);

        if (typeof target.value !== 'function') {
            throw new Error('Target method must to be a function');
        }

        target.value = function (...fargs) {
            let paramsObject = params ? resolveParams(params, fargs) : fargs[0];
             return hook.before(paramsObject)
                .then((args) => {
                    let pargs = params ? plainParams(params, args) : [args];
                    return of.apply(this, pargs);
                })
                .then((result) => {
                    return hook.after(result);
                });
        };
    }
}
