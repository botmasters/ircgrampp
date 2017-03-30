"use strict";

/**
 * @TODO: Add expire time for channel info storage 
 */

import fs from "fs";
import path from "path";
import {userInfo} from "os"; 
import etc from "etc";
import yml from "etc-yaml";
import prettyjson from "prettyjson";
import {values, assignIn} from "lodash";
import debugLib from "debug";

const debug = debugLib("config");

let homedir;

if (process.versions.node.match(/^[56]\./)) {
    homedir = process.env[(
        process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
} else if (process.versions.node.match(/^7\./)) {
    let user = userInfo();
    homedir = user.homedir;
}

const appdir = path.join(homedir, ".ircgrampp");
const confpath = path.join(appdir, "config.yml");
const bridgespath = path.join(appdir, "bridges");
const pluginspath  = path.join(appdir, "plugins");

export const createDataDir = function () {
    debug(`Creating app directory in ${appdir}`);
    fs.mkdirSync(appdir, 0o700);
    fs.mkdirSync(bridgespath, 0o700);
    fs.mkdirSync(pluginspath, 0o700);
}

export const checkConfigDir = function (created = false) {
    let stats;
    debug(`Check for app directory in ${appdir}`);

    try {
        stats = fs.lstatSync(appdir);
    } catch (e) {
        debug(`Does not exist`);
        if (created) {
            return createDataDir();
        }

        return false;
    }

    if (!stats.isDirectory(appdir)) {
        throw new Error(`${appdir} is not a directory`);
    }

    return true;

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

export const saveBridgeConfig = function (bdata) {
    let data = new Buffer(`${renderConfigFile(bdata, true)}\n`, 'utf8');
    let file = path.join(bridgespath, `${bdata.name}.yml`);
    return fs.writeFileSync(file, data);
}

export const bridges = etc()
    .use(yml)
    .folder(bridgespath);

export const config = etc()
    .use(yml)
    .file(confpath)
    .add({
        bridges: values(bridges.toJSON())
    })
    .add({
        channelsdb: path.join(appdir, "channels.dat")
    });

export default config;

export const getBridgeConfig = function (name) {
    let bridgeList = config.get("bridges") || [];
    let bridge = bridgeList.find(x => x.name === name);

    debug(`Preparing config for bridge ${name}`);

    if (!bridge) {
        throw new Error("Bridge does not exists");
    }

    bridge = assignIn({}, {
        enable: true,
        prefix: config.get("prefix"),
        suflix: config.get("suflix"), 
        oneConnectionByUser: config.get("oneConnectionByUser"),
    }, bridge);

    for (let i in bridge) {
        if (typeof bridge[i] === "undefined") {
            delete bridge[i];
        }
    }

    let ircConfig = config.get("irc");
    let telegramConfig = config.get("telegram");

    bridge.irc = assignIn({}, ircConfig, bridge.irc || {});
    bridge.telegram = assignIn({}, telegramConfig, bridge.telegram || {});

    return bridge;

}; 
