
import config from '../config';
import PluginInterface from './interface';
import debugLib from 'debug';

const debug = debugLib('plugins');

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
