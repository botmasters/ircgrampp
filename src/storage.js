"use strict";

import fs from "fs"
import path from "path";
import debugLib from "debug";
import NodeStorage from "node-storage";
import config from "./config";

const DB_PATH = path.normalize(config.get("db"));

const debug = {
    info: debugLib("storage"),
};

const getStorge = (function () {
    let storage = null;

    return function() {
        if (!storage) {
            storage = new NodeStorage(DB_PATH); 
        }

        return storage;
    };
    
})();

export default class Storage {

    constructor(db = null) {

        if (!db) {
            throw new Error('DB name can\'t be undefined');
        }

        Storage.checkDataDir();
        this._storage = getStorge();
        this._db = db;
        this._data = null;
        this._load();
    }

    _load() {
        debug.info("Load stored information");
        var data = this._storage.get(this._db);

        if (!data) {
            debug.info("There are nothing, empty");
            data = [];
        }

        this._data = data;
    }

    sync() {
        this._storage.put(this._db, this._data);
    }

    push(obj, sync = true) {
        this._data.push(obj);

        if (sync) {
            this.sync();
        }
    }

    remove(func, sync = true) {
        this._data = this._data.filter((x) => !func(x));

        if (sync) {
            this.sync();
        }
    }

    list() {
        return this._data;
    }

    clear(sync = true) {
        debug.info(`Clear all data`);
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

    find(func) {
        debug.info(`Find`);
        return this._data.find(func);  
    }

    static createDataDir(dirname) {
        debug.info(`Creating data directory in ${dirname}`);
        fs.mkdirSync(dirname, 0o700);
    }

    static checkDataDir() {
        let stats, directory = path.dirname(DB_PATH);
        debug.info(`Check for data directory in ${directory}`);

        try {
            stats = fs.lstatSync(directory);
        } catch (e) {
            debug.info(`Don't exists`);
            return Storage.createDataDir(directory);
        }

        if (!stats.isDirectory(directory)) {
            throw new Error(`${directory} is not a directory`);
        }

    }
}
