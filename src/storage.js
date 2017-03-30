"use strict";

import fs from "fs"
import path from "path";
import debugLib from "debug";
import Storage from "node-storage";
import config from "./config";

const CHANNELS_DB_PATH = path.normalize(config.get("channelsdb"));

const debug = {
    channelsInfo: debugLib("channels-info"),
};

var instance = null;

export class ChannelsInfo {

    constructor() {
        ChannelsInfo.checkDataDir();
        this._storage = new Storage(CHANNELS_DB_PATH);
        this._data = null;
        this._load();
    }

    _load() {
        debug.channelsInfo("Load channels stored information");
        var data = this._storage.get("channels");

        if (!data) {
            debug.channelsInfo("There are nothing, empty");
            data = [];
        }

        this._data = data;
    }

    sync() {
        this._storage.put("channels", this._data);
    }

    remove(channel, sync = true) {
        let channelId = typeof channel === "number" ? channel : channel.id;
        debug.channelsInfo(`Remove channel info for ${channelId}`);

        this._data = this._data.filter(x => x.id !== channelId);

        if (sync) {
            this.sync();
        }
    }

    save(channel, sync = true) {
        debug.channelsInfo(`Save channel info for ${channel.id}`);

        var actual = this._data.find(
            x => x.id === channel.id);

        if (actual) {
            debug.channelsInfo(`This exists, remove old`);
            this.remove(channel, false);
        }

        this._data.push(channel);

        if (sync) {
            this.sync();
        }
    
    }

    list() {
        return this._data;
    }

    clear(sync = true) {
        debug.channelsInfo(`Clear all data`);
        this._data = [];
        if (sync) {
            this.sync();
        }
    }

    each(cb) {
        return this._data.forEach(cb);
    }

    sort(cb) {
        return this._data.sort(cb);
    }

    map(cb) {
        return this._data.map(cb);
    }

    find(cond) {
        debug.channelsInfo(`Find info for ${cond}`);

        if (typeof cond === "number") {
            return this._data.find(x => x.id === cond);
        } else {
            return this._data.find(x => x.title === cond);
        }
    
    }

    static createDataDir(dirname) {
        debug.channelsInfo(`Creating data directory in ${dirname}`);
        fs.mkdirSync(dirname, 0o700);
    }

    static checkDataDir() {
        let stats, directory = path.dirname(CHANNELS_DB_PATH);
        debug.channelsInfo(`Check for data directory in ${directory}`);

        try {
            stats = fs.lstatSync(directory);
        } catch (e) {
            debug.channelsInfo(`Don't exists`);
            return ChannelsInfo.createDataDir(directory);
        }

        if (!stats.isDirectory(directory)) {
            throw new Error(`${directory} is not a directory`);
        }

    }

    static getInstance() {
        if (!instance) {
            instance = new ChannelsInfo();
        }

        return instance;
    }

}
