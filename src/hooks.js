
import debugLib from "debug";

const debug = debugLib('hooks');

var Promise = require("bluebird");

let hooks = {};

export class HookFlow {
    
    constructor() {
        this._preventDefault = false;
        this._preventAfter = false;
        this._stopPropagation = false;
    }

    preventDefault() {
        this._preventDefault = true;
    }

    preventAfter() {
        this._preventAfter = true;
    }

    stopPropagation() {
        this._stopPropagation = true;
    }

    get isPreventDefault() {
        return this._preventDefault;
    }

    get isPreventAfter() {
        return this._preventAfter;
    }

    get isStopPropagation() {
        return this._stopPropagation;
    }

}

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
            return Promise.resolve({
                flow: {},
                data,
            });
        }

        let flow = new HookFlow();

        debug(`[sync] ${this._name}:${type}`);
        return Promise.reduce(actions, (ndata, action) => {
            if (flow.isStopPropagation) {
                return ndata;
            }

            let rdata = action(context, ndata, flow);
    
            if (typeof rdata === 'undefined') {
                return ndata;
            } else {
                return rdata;
            }
        }, data)
            .then((finalData) => {
                return {
                    flow,
                    data: finalData,
                }
            });
    }

    resolveSync(type, data, context = {}) {
        let actions = this._actions[type];

        if (!actions.length) {
            return {
                flow: {},
                data,
            };
        }

        let flow = new HookFlow();
        let ndata = data;

        debug(`[async] ${this._name}:${type}`);
        actions.forEach((action) => {

            if (flow.isStopPropagation) {
                return;
            }

            let result = action(context, ndata, flow);
            if (result instanceof Promise) {
                throw new Error(`${this._name}:${type} is a sync hook`);
            }

            if (typeof result !== 'undefined') {
                ndata = result;
            }
        });

        return {
            flow,
            data: ndata,
        };
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
            let result;
            let bresult = hook.beforeSync(paramsObject, this)

            if (bresult.flow.isPreventDefault) {
                result = bresult.data;
            } else {
                result = of.apply(
                    this, params ? plainParams(
                        params, bresult.data) : [bresult.data]);
            }

            if (bresult.flow.isPreventAfter) {
                return result;
            }

            return hook.afterSync(result, this).data;
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
            let flow;

             return hook.before(paramsObject, this)
                .then((result) => {
                    flow = result.flow;

                    let pargs = params ? plainParams(
                        params, result.data) : [result.data];

                    if (flow.isPreventDefault) {
                        return pargs;
                    }
                    return of.apply(this, pargs);
                })
                .then((result) => {
                    if (flow.isPreventAfter) {
                        return result;
                    }
                    return hook.after(result, this);
                });
        };
    }
}
