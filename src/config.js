"use strict";

/**
 * @TODO: Add expire time for channel info storage 
 */

import path from "path";
import {userInfo} from "os"; 
import etc from "etc";
import yml from "etc-yaml";
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

export const bridges = etc()
    .use(yml)
    .folder(bridgespath);

const config = etc()
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
