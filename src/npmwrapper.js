

import npm from 'npm';
import config from '../config';
import debugLib from 'debug';

let Promise = require('bluebird');

const debug = debugLib('npmwrapper');

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

            loaded = true;
            return resolve();
        });
    });
}

export const installPackage = function(query) {
    load()
        .then(() => {
            debug('Check or create lib directory');
            return checkDir(LIB_PATH, true);
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                npm.install([query], (err) => {
                    if (err) {
                        return reject(err);
                    }

                    return resolve();
                });
            });
        });
}
