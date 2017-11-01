

import npm from 'npm';
import config, {checkDir} from './config';
import debugLib from 'debug';

let Promise = require('bluebird');

const debug = debugLib('npmwrapper');
const npmDebug = debugLib('npmwrapper:npm');

const LIB_PATH = config.get('pluginspath');

const options = {
    global: false,
    prefix: LIB_PATH,
};

let loaded;

const load = function () {
    if (loaded) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        npm.load(options, (err) => {
            if (err) {
                return reject(err);
            }

            npm.on('log', (...args) => {
                npmDebug(...args);
            });

            loaded = true;
            return resolve();
        });
    });
}

export const installPackage = function(query) {
    return load()
        .then(() => {
            debug('Check or create lib directory');
            return checkDir(LIB_PATH, true);
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                debug('Installing package', query);
                npm.install(query, (err) => {
                    if (err) {
                        debug('Error installing package', err);
                        return reject(err);
                    }

                    debug('Package installed');
                    return resolve();
                });
            });
        });
}
