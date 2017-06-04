
import {EventEmitter} from "events";
import debugLib from "debug";
import Bridge from "./bridge";
import config, {getBridgeConfig} from "./config"; 
import {asyncHookedMethod, syncHookedMethod} from "./hooks";

var Promise = require("bluebird");

const debug = debugLib("session");

/**
 * Bridges up session
 */
export default class Session extends EventEmitter {

    /**
     * Create session
     * @param {object} [options] Options
     */
    constructor(options = {}) {
        super();
        this._constructor(options);
    }

    @syncHookedMethod('session:create')
    _constructor(options = {}) {
        this._options = options;
        this._bridgesConfig = this._makeBridgesTree();
        this._started = false;
        this._bridges = [];

        return this;
    }

    @syncHookedMethod('session:make.bridges.tree')
    _makeBridgesTree() {

        if (this._options.only) {
            debug(`only option for ${this._options.only}`);
        }

        return (config.get("bridges") || [])
            .map(x => x.name)
            .filter((b) => {
                if (this._options.only) {
                    return b === this._options.only;
                } else {
                    return true;
                }
            })
            .map(n => getBridgeConfig(n))
            .filter(n => n.enable);
    }

    @syncHookedMethod('session:start.bridge', 'ircChannel', 'telegramChannel', 'config')
    startBridge(ircChannel, telegramChannel, bridgeConfig) {

        let bridge = new Bridge(
            bridgeConfig.name,
            ircChannel,
            telegramChannel,
            bridgeConfig
        );

        return Promise.all([
            new Promise((resolve) => {
                bridge.once("irc:registered", () => {
                    debug(
                        `Bridge ${bridgeConfig.name} registered with IRC`);
                    return resolve();
                });
            }),
            new Promise((resolve) => {
                bridge.once("telegram:me", () => {
                    debug(
                        `Bridge ${bridgeConfig.name} success with Telegram`);
                    return resolve();
                });
            })
        ]).then(() => {
            debug(`Bridge ${bridgeConfig.name} stablished`);
            this.emit("bridgestablished", bridgeConfig.name);
            return bridge;
        });
    }

    @asyncHookedMethod('session:start')
    start() {

        if (this._started) {
            throw new Error("Already started");
        }

        if (!this._bridgesConfig.length) {
            throw new Error("Nothing to start");
        }

        debug("Starting bridges");
        this._started = true;

        let config = this._bridgesConfig;

        return Promise.map(config, (bridgeConfig) => { 
            let ircChannel = bridgeConfig.irc.channel;
            let telegramChannel = bridgeConfig.telegram.channel;

            if (!ircChannel || !telegramChannel) {
                throw new Error(`Bridge ${bridgeConfig.name} has a ` +
                    `error in IRC or telegram channel definition`);
            }

            debug(`Starting ${bridgeConfig.name} ${ircChannel} <-> ` + 
                ` ${telegramChannel}`);

            return this.startBridge(
                ircChannel,
                telegramChannel,
                bridgeConfig); 

        })
            .then((bridges) => {
                this._bridges = bridges;
                return bridges;
            });
    }

}
