"use strict";

/**
 * @TODO: Add expire time for channel info storage 
 */

import packageInfo from "../package.json";
import fs from "fs";
import path from "path";
import {userInfo} from "os"; 
import etc from "etc";
import yml from "etc-yaml";
import prettyjson from "prettyjson";
import {values, assignIn} from "lodash";
import debugLib from "debug";

const debug = debugLib("config");

const UID = process.getuid();

let etcDir;
let varLibDir;
let dataDir;
let configDir;
let homeDir;

if (process.platform === 'win32') {
    varLibDir =  process.env['ALLUSERSAPPDATA'];
    etcDir = varLibDir;
} else {
    // Asume unix
    etcDir = '/etc';
    varLibDir = '/var/lib';
}

if (UID === 0) {
    configDir = path.join(etcDir, packageInfo.name);
    dataDir = path.join(varLibDir, packageInfo.name);
} else {
    if (process.versions.node.match(/^6\./)) {
        if (process.platform === 'win32') {
            homeDir = process.env['USERPROFILE'] || process.env['HOMEPATH'];
        } else { 
            homeDir = process.env['HOME'];
        }
    } else if (process.versions.node.match(/^7\./)) {
        let user = userInfo();
        homeDir = user.homedir;
    } else {
        throw new Error('Incompatible node version');
    }

    configDir = path.join(homeDir,`.${packageInfo.name}`);
    dataDir = path.join(homeDir, `.${packageInfo.name}`);
}

if (process.env[`${packageInfo.name.toUpperCase()}_CONFIG_DIR`]) {
    configDir = process.env[`${packageInfo.name.toUpperCase()}_CONFIG_DIR`];
}

if (process.env[`${packageInfo.name.toUpperCase()}_DATA_DIR`]) {
    dataDir = process.env[`${packageInfo.name.toUpperCase()}_DATA_DIR`];
}

const confpath = path.join(configDir, "config.yml");
const bridgespath = path.join(configDir, "bridges");
const pluginspath  = path.join(configDir, "plugins");

export const createDir = function (dir) {
    debug(`creating directory ${dir}`);
    fs.mkdirSync(dir, 0o700);
}

export const checkDir = function(dir, create = false) {
    let stats;
    debug(`Checking if dir exists ${dir}`);

    try {
        stats = fs.lstatSync(dir);
    } catch (e) {
        debug(`Does not exist`);

        if (create) {
            return createDir(dir);
        }

        return false;
    }

    if (!stats.isDirectory(configDir)) {
        debug(`Exists but isn't a directory`);
        throw new Error(`${configDir} is not a directory`);
    }

    return true;

}

export const checkConfigDir = function (create = false) {
    let res = 0;
    debug(`Check config directory ${configDir}`);

    res |= !checkDir(configDir, create);
    res |= !checkDir(bridgespath, create);
    res |= !checkDir(pluginspath, create);

    return !res;
}

export const createConfigDir = function()  {
    return checkConfigDir(true);
}

export const checkDataDir = function (create = false) {
    let res = 0;
    debug(`Check data directory ${dataDir}`);

    res |= !checkDir(configDir, create);

    return !res;
}

export const renderConfigFile = function (configJson = null, final = false) {
    
    if (!configJson) {
        configJson = config.toJSON();
    }

    delete configJson.bridges;
    delete configJson.plugins;

    return prettyjson.render(configJson, {
        noColor: final,
        indent: 2,
    });
}

export const saveConfig = function() {
    let data = new Buffer(`${renderConfigFile(null, true)}\n`, 'utf8');
    return fs.writeFileSync(confpath, data);
}

export const saveSubConfigItem = function (subpath, bdata) {
    let data = new Buffer(`${renderConfigFile(bdata, true)}\n`, 'utf8');
    let file = path.join(subpath, `${bdata.name}.yml`);
    return fs.writeFileSync(file, data);
}

export const saveBridgeConfig = function(bdata) {
    return saveSubConfigItem(bridgespath, bdata);
}

export const savePluginConfig = function(bdata) {
    return saveSubConfigItem(pluginspath, bdata);
}

export const deleteBridgeConfig = function(name) {
    let file = path.join(bridgespath, `${name}.yml`);
    fs.unlinkSync(file);
}

export const bridges = etc()
    .use(yml)
    .folder(bridgespath);

export const plugins = etc()
    .use(yml)
    .folder(pluginspath);

export const config = etc()
    .use(yml)
    .file(confpath)
    .add({
        bridges: values(bridges.toJSON()),
        plugins: values(plugins.toJSON()),
    })
    .add({
        db: path.join(dataDir, "ircgrampp.dat"),
        pluginspath: path.join(dataDir, "lib"),
        user: 'nobody',
        group: 'nobody',
    });

export default config;

export const getSubConfig = function(
                                subPart, name, defaults = {}, strict = false) {
    let items = config.get(subPart) || [];
    let item = items.find(x => x.name === name);

    debug(`Preparing config for ${subPart} ${name}`);

    if (!item && strict) {
        throw new Error(`Item ${subPart} ${name} does not exists`);
    } else if (!item) {
        item = {};
    }

    item = assignIn({}, defaults, item);

    for (let i in item) {
        if (typeof item[i] === "undefined") {
            delete item[i];
        }
    }

    return item;
};

export const getBridgeConfig = function (name) {
    let bridge = getSubConfig('bridges', name, {
        enable: true,
        prefix: config.get("prefix"),
        suffix: config.get("suffix"), 
        oneConnectionByUser: config.get("oneConnectionByUser"),
        useIrcColors: true,
        showJoinLeft: config.get("showJoinLeft"),
        ircScapeCharacter: config.get("ircScapeCharacter"),
    }, true);

    let ircConfig = config.get("irc");
    let telegramConfig = config.get("telegram");

    bridge.irc = assignIn({}, ircConfig, bridge.irc || {});
    bridge.telegram = assignIn({}, telegramConfig, bridge.telegram || {});

    return bridge;
}; 

export const getPluginConfig = function (name) {
    return getSubConfig('plugins', name, {
        name: name,
        enable: false,
    });
};

export const getConfInterface = function (obj, defaults = {}) {
   return etc()
        .add(obj)
        .add(defaults);
};
