
import request from "request-promise";
import packageInfo from '../../package.json';
import {checkDir, savePluginConfig} from '../config';
import PackageDb from './db';
import PluginInterface from './interface';
import debugLib from "debug";

let Promise = require('bluebird');

const debug = debugLib("plugins.manager");

const PREFIX_REGX = new RegExp(`^${packageInfo.name}-plugin-`, 'i');
const PREFIX_SEARCH_REGX = new RegExp(`^${packageInfo.name}(:?-plugin-?)?`, 'i');

const parsePackage = function(packRecord) {
    let pack = packRecord['package'];

    return {
        name: pack.name.replace(/^ircgrampp-plugin-/i, ''),
        latest: pack.version,
        description: pack.description || "",
        web: pack.homepage || "",
        author: pack.author,
    };
};

const plainText = function(text) {
    return text
        .replace(PREFIX_SEARCH_REGX, '')
        .replace(/[\t\s\v]+/, ' ')
        .toLowerCase()
    ;
};

export const searchPlugin = function(pattern, max = 100)  {
    const db = PackageDb.getInstance();

    pattern = plainText(pattern); 

    return db
        .reduce((results, pack) => {
            let raiting = 0;
            let {name, description} = pack;

            name = plainText(name);
            description = plainText(description);

            if (name === pattern) {
                raiting = 100;
            } else if (name.indexOf(pattern) !== -1) {
                raiting = 50;
            }

            if (description.indexOf(pattern) !== -1) {
                raiting += 50;
            }

            let words = pattern.split(/[\s\t\n\-]+/g);

            raiting = words.reduce((total, word) => {
                if (name.indexOf(word) !== -1) {
                    total += parseInt(70/words.length);
                }

                if (description.indexOf(word) !== -1) {
                    total += parseInt(40/words.length);
                }

                return total;
            }, raiting);

            if (raiting) {
                results.push(Object.assign({}, pack, {
                    score: raiting,
                }));
            }

            return results;

        }, [])
        .sort((a, b) => a.score > b.score ? -1 : 1)
        .slice(0, max);
};

export const syncPlugins = function() {
    debug("Sync db");

    const db = PackageDb.getInstance();

    let lastOffset = 0;

    const reqOptions = {
        uri: 'https://api.npms.io/v2/search',
        qs: {
            q: `${packageInfo.name}-plugin-`,
            size: 250,
        },
        json: true,
    };

    debug("Making first request with ", reqOptions);
    
    return request(reqOptions)
        .then(({total, results}) => {

            if (total > 250) {
                debug(`A lot of results (${total}), get pages`);
                let promises = [];
                lastOffset = 250;

                while (lastOffset < total) {
                    debug(`Get packages with offset ${lastOffset}`);
                    let rops = Object.assign({}, reqOptions, {
                        qs: Object.assign({}, reqOptions.qs, {
                            from: lastOffset,
                        }),
                    });

                    debug(rops);

                    promises.push(
                        request(rops)
                            .then(({results}) => {
                                return results
                                    .filter((p) => p['package']
                                                    .name.match(PREFIX_REGX))
                                    .map(parsePackage);
                            })
                    );
                    lastOffset += 250;
                }

                promises.push(Promise.resolve(results.map(parsePackage)));
                return Promise.all(promises);
            } else {
                debug('Less tan 250 results');
                return [results
                    .filter((p) => {
                        return p['package'].name.match(PREFIX_REGX);
                    })
                    .map(parsePackage)];
            }
        })
        .then((results) => {
            if (results && results.length) {
                debug('Saving results');
                db.clear();

                results.forEach((res) => {
                    db.push(res, false);
                }); 

                debug(`Complete, there are ${db.length} plugins`)
                return db.length;
            } else {
                debug('No results');
                return 0;
            }
        })
        .catch((e) => {
            debug('error making search:', e);
            throw e;
        });
};

export const listPlugins = function() {
    let db = PackageDb.getInstance();
    return db._data;
}

export const installPlugin = function(query, enable = false) {
    let name, ver, finalQuery;
    debug('Go to install package', query);

    query = query
        .replace(PREFIX_SEARCH_REGX, '');

    let parts = query.match(/^([^@]+)(@[.]+)?$/g);

    debug("parts", parts);

    if (!parts) {
        return Promise.reject(new Error('Invalid query'));
    }

    name = parts[0];

    if (parts.length > 1) {
        ver = parts[1];
    }

    finalQuery = `${packageInfo.name}-plugin-${name}@${ver || "latest"}`;

    debug("Final query is", finalQuery);

    return installPackage(finalQuery)
        .then(() => {
            debug('Installed, getting defult config');
            let plugin = new PluginInterface(name);
            let options = plugin.getDefaultOptions();

            debug('Saving config');
            return savePluginConfig(Object.assign({}, options, {
                name,
                enable,
            }));
        })
        .then(() => {
            debug('Plugin installed and configured'); 
        });
}
