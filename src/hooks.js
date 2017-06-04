
import debugLib from "debug";

const debug = debugLib('hooks');

var Promise = require("bluebird");

let hooks = {};

export class Hook {

    constructor(name) {
        Hook.validateHookName(name);
        this._name = name;
        this._actions = {
            before: [],
            after: [],
        };
        hooks[name] = this;
        debug(`New hook defined: ${this._name}`);
    }

    subscribe(type, action) {
        if (typeof action !== 'function') {
            throw new Error('action must be a function');
        }

        this._actions[type].push(action);

        return this;
    }

    resolveAsync(type, data, context = {}) {
        let actions = this._actions[type];

        if (!actions.length) {
            return Promise.resolve(data);
        }

        debug(`[sync] ${this._name}:${type}`);
        return Promise.reduce(actions, (ndata, action) => {
            return action(context, ndata);
        }, data);
    }

    resolveSync(type, data, context = {}) {
        let actions = this._actions[type];

        if (!actions.length) {
            return data;
        }

        let ndata = data;

        debug(`[async] ${this._name}:${type}`);
        actions.forEach((action) => {
            let result = action(context, ndata);
            if (result instanceof Promise) {
                throw new Error(`${this._name}:${type} is a sync hook`);
            }

            if (typeof result !== 'undefined') {
                ndata = result;
            }
        });

        return ndata;
    }

    before(data, context = {}) {
        return this.resolveAsync('before', data, context);
    }

    after(data, context = {}) {
        return this.resolveAsync('after', data, context);
    }

    beforeSync(data, context = {}) {
        return this.resolveSync('before', data, context);
    }

    afterSync(data, context = {}) {
        return this.resolveSync('after', data, context);
    }

    get name() {
        return this._name; 
    }

    static validateHookName(name) {

        if (hooks.hasOwnProperty(name)) {
            throw new Error(`Hook ${name} already exists`);
        }

        if (!name.match(/^[a-z]+:[a-z]+(\.[a-z]+)*$/i)) {
            throw new Error(`Invalid hook name ${name}`);
        } 

    }

}

export const declareHook = function (name) {
    return new Hook(name);
}

export const subscribeTo = function (name, type, action) {
    if (!hooks.hasOwnProperty(name)) {
        throw new Error(`Hook ${name} does not exists`);
    }

    debug(`Subscribe callback to ${type}:${name}`);
    return hooks[name].subscribe(type, action);
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
            let pargs = hook.beforeSync(paramsObject, this)
            let result = of.apply(
                this, params ? plainParams(params, pargs) : [pargs]);
            return hook.afterSync(result, this);
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
             return hook.before(paramsObject, this)
                .then((args) => {
                    let pargs = params ? plainParams(params, args) : [args];
                    return of.apply(this, pargs);
                })
                .then((result) => {
                    return hook.after(result, this);
                });
        };
    }
}
