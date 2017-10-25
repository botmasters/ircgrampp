
import packageInfo from '../../package.json';
import debugLib from 'debug';

let Promise = require('bluebird');

export default class PluginInjector {
    
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

    get version() {
        return packageInfo.version;
    }

}
