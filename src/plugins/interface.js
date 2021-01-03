
import path from 'path';
import {uniq} from 'lodash';
import packageInfo from '../../package.json';
import config, {getPluginConfig, getConfInterface} from '../config';
import {subscribeTo} from '../hooks';
import PluginInjector from './injector';
import debugLib from 'debug';

const debug = debugLib('plugins.interface');

const methodRegExp = '(before|after)([A-Z][a-z]+)((?:[A-Z][a-z]*)*)?$';

const LIB_PATH = config.get('pluginspath');

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

        let PluginClass = PluginInterface.getClass(this._name);

        this._plugin = new PluginClass(injector);

        if (!this._plugin.checkVersion()) {
            throw new Error(
                `Plugin ${this._name} is incompible with this version`);
        }

        this.subscribeHooks();
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

    static getClass(name) {
        let pluginClass;
        let project = packageInfo.name
            .toLowerCase()
            .replace(/[^a-z0-9]/ig, '');

        let packName = path.resolve(
            LIB_PATH,
            'node_modules',
            `${project}-plugin-${name}`
        );

        try {
            pluginClass = require(packName).default;
        } catch (e) {
            throw new Error(`Plugin ${name} is not installed`);
        }

        /* if (!(pluginClass instanceof PluginBase)) {
            debug('c', PluginBase);
            debug(pluginClass);
            throw new Error(`Plugin ${this._name} isn't a valid Plugin`);
        } */

        return pluginClass;
    }
}
