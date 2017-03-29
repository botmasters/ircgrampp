"use strict";

import path from "path";
import {userInfo} from "os"; 
import etc from "etc";
import yml from "etc-yaml";
import {values, assignIn} from "lodash";
import debugLib from "debug";

const debug = debugLib("config");

const user = userInfo();

const homedir = user.homedir;
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
        db: path.join(appdir, "db.dat")
    });

export default config;

export const getBridgeConfig = function (name) {
    let bridgeList = config.get("bridges") || [];
    let bridge = bridgeList.find(x => x.name === name);

    if (!bridge) {
        throw new Error("Bridge does not exists");
    }

    bridge = assignIn({}, {
        enable: true,
        prefix: config.get("prefix"),
        suflix: config.get("suflix"), 
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

    debug("b", bridge);

    return bridge;

};
