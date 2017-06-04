
import {uniq} from 'lodash';
// import PluginBase from 'ircgrampp-plugin';
import packageInfo from '../package.json';
import config, {getPluginConfig, getConfInterface} from './config';
import {subscribeTo} from './hooks';
import debugLib from 'debug';

var Promise = require('bluebird');

const debug = debugLib('plugins');

const methodRegExp = '(before|after)([A-Z][a-z]+)((?:[A-Z][a-z]*)*)?$';

const getMethods = function(oinstance) {
    var props = [];
    let instance = oinstance; 

    do {
        props = props.concat(Object.getOwnPropertyNames(instance));
        instance = Object.getPrototypeOf(instance)
    } while (instance);

    return uniq(props)
        .filter((x) => {
            return typeof oinstance[x] === 'function';
        });
}

const translateHookMethod = function (mName) {
    let reg = new RegExp(methodRegExp);
    let parts = reg.exec(mName); 

    if (!parts) {
        throw new Error(`${mName} don't match as hook method`);
    }

    let type = parts[1];
    let nameSpace = parts[2];
    let rest = parts[3] || "";

    if (rest !== "") {
        rest = rest
            .replace(/([A-Z])/g, '.$1')
            .replace(/^\./, '');
    }

    return {
        type: type,
        name: (`${nameSpace}:${rest}`).toLowerCase()
    };
}

export class PluginInjector {
    
    constructor(pluginInterface) {
        this._interface = pluginInterface;
        this._debug = debugLib(`plugin-${this._interface.name}`);
    }

    getConfig() {
        return this._interface.getConfig();
    }

    get Promise() {
        return Promise;
    }

    get debug() {
        return this._debug;
    }

}

export default class PluginInterface {

    constructor(pluginName) {
        debug(`Loading plugin ${pluginName}`);
        if (!pluginName.match(/^[a-z0-9]+$/i)) {
            throw new Error(`Invalid plugin name ${pluginName}`);
        }

        pluginName = pluginName.toLowerCase();

        this._name = pluginName;
        this._config = getConfInterface(getPluginConfig(this._name));

        if (!this._config.get('enable')) {
            throw new Error(`Plugin ${this._name} isn't enabled`);
        }

        let injector = new PluginInjector(this);

        let PluginClass = this.getClass();

        this._plugin = new PluginClass(injector);

        this._config.add(this._plugin.getDefaultOptions());

        this.subscribeHooks();
    }

    getClass() {
        let pluginClass;
        let project = packageInfo.name
            .toLowerCase()
            .replace(/[^a-z0-9]/ig, '');

        let packName = `${project}-plugin-${this._name}`;

        try {
            pluginClass = require(packName).default;
        } catch (e) {
            throw new Error(`Plugin ${this._name} is not installed`);
        }

        /* if (!(pluginClass instanceof PluginBase)) {
            debug('c', PluginBase);
            debug(pluginClass);
            throw new Error(`Plugin ${this._name} isn't a valid Plugin`);
        } */

        return pluginClass;

    }

    subscribeHooks() {
        let methods = getMethods(this._plugin); 

        methods.forEach((prop) => {
                if (prop.match(/^(after|before)/)) {
                    let hookInfo = translateHookMethod(prop);
                    subscribeTo(
                        hookInfo.name, 
                        hookInfo.type, 
                        this._plugin[prop].bind(this._plugin));
                }
            });
    }

    getConfig() {
        return this._config;
    }

    get name() {
        return this._name;
    }

    static load(name) {
        return new PluginInterface(name);
    }
}

export const loadPlugins = function(all = false) {
    debug('Load plugins');
    let plugins = config.get('plugins');

    if (!all) {
        plugins = plugins.filter(x => x.enable);
    }

    plugins.forEach((plugOps) => {
        PluginInterface.load(plugOps.name);
    });
}
