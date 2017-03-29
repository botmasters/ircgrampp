
import debugLib from "debug";
import {EventEmitter} from "events";
import {assignIn, noop} from "lodash";
import {Client as IRCClient} from "irc";
import config from "./config";

var Promise = require("bluebird");

const debug = {
    irc: debugLib("irc"),
};

export const defaultConfig = assignIn({
    server: null,
    masterNick: null,
    port: 6697,
    ssl: true,
    autoConnect: true,
    channels: null
}, config.get("ircDefaults") || {});

/**
 * An IRCChannel
 */
export class IRCChannel extends EventEmitter {

    /**
     * Create new channel handler
     * @param {string} channel The channel name
     * @param {IRCConnection} connection The connection father
     */
    constructor(channel, connection) {
        super();
        this._channel = channel;
        this._connection = connection;
        this._nicks = [connection.masterNick];

        this._connection.on(`${channel}:join`, (...args) => {
            this.emit("join", ...args);
        });

        this._connection.on(`${channel}:part`, (...args) => {
            this.emit("part", ...args);
        });

        this._connection.on(`${channel}:message`, (...args) => {
            this.emit("message", ...args);
        });

        this._connection.on("changeMasterNick", (oldNick, newNick) => {
            this._nicks = this._nicks.filter(n => n !== oldNick);
            this._nicks.push(newNick);
        });
    }

    /**
     * Return true if the channel has an own nickname
     * @param {string} nickName The nickname to find
     * @return {bool}
     */
    hasNick(nickName) {
        return this._nicks.indexOf(nickName) !== -1;
    }

    /**
     * The name of the channel
     * @property name
     */
    get name() {
        return `${this._channel}`;
    }

}

/**
 * IRC connection
 */
export default class IRCConnection extends EventEmitter {

    /**
     * Create new connection
     * @param {object} options  The options for connection
     * @param {string} options.server Server ip or name
     * @param {string} options.masterNick The master_nick in the server
     * @param {number} [options.port] Port number, by default 6697
     * @param {boolean} [options.ssl] Use SSL, by default true
     * @param {boolean} [options.autoConnect] Auto-connect to server, by
     *                                        default true
     * @param {Array:<string>} [options.channels] Channels to subscribe
     */
    constructor(options) {
        super();
        this._options = assignIn({}, defaultConfig, options);
        this._client = null;
        this._channels = [];
        this._registered = false;
        
        debug.irc("Config", this._options);

        if (!this._options.server || !this._options.port ||
            !this._options.masterNick) {
            throw new Error("You need to specify some server and nick");
        }

        if (options.channels) {
            options.channels.forEach((chan) => {
                this.addChannel(chan);
            });
        }

        delete this._options.channels;

        if (this._options.autoConnect) {
            noop(this.client);
        }

    }

    /**
     * Handle join events from the server
     * @param {string} channel
     * @param {string} nick
     */
    _handleJoin(channel, nick) {
        let ownChannel = this.getChannel(channel);

        if (ownChannel) {
            this.emit("join", channel, nick);
            this.emit(`${channel}:join`, nick);
        } else {
            debug.irc(`${nick} join to unhandled channel ${channel}`);
        }

    }

    /**
     * Handle incomming message from the server
     * @param {string} from
     * @param {string} to
     * @param {string} message
     */
    _handleIncommingMessage(from, to, message) {
        let ownChannel = this.getChannel(to);

        if (ownChannel && !ownChannel.hasNick(from)) {
            this.emit(`${ownChannel.name}:message`, from, to, message);
        }

    }

    /**
     * Handle part from the server
     * @param {string} channel
     * @param {string} nick
     * @param {string} message
     */
    _handlePart(channel, nick, message) {
        let ownChannel = this.getChannel(channel);

        if (ownChannel && !ownChannel.hasNick(nick)) {
            this.emit(`${ownChannel.name}:part`, nick, message);
        }
    }

    waitForRegistered() {
        if (this._registered) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.once("irc:registered", resolve);
        });

    }

    /**
     * Get a channel handler from name
     * @param {string} channelName Channel name
     * @return {null|IRCChannel}
     */
    getChannel(channelName) {
        return this._channels.find(c => c.name === channelName);
    }

    /**
     * Add channel handle
     * @param {string} name
     * @return {Promise<IRCChannel>}
     */
    addChannel(channelName) {

        if (this._channels.find(c => c.name === channelName)) {
            throw new Error("Channel already exists");
        } 

        let channel = new IRCChannel(channelName, this);
        this._channels.push(channel);

        this.waitForRegistered()
            .then(() => {
                this.client.join(channelName);
            });

        return channel;
    }

    /**
     * Client object
     * @property
     * @see https://github.com/martynsmith/node-irc
     */
    get client() {
        if (this._client) {
            return this._client;
        }

        let {
            server, port, ssl, masterNick, autoConnect, channels
        } = this._options;

        this._client = new IRCClient(server, masterNick, {
            port,
            autoConnect,
            channels,
            secure: ssl
        });

        this._client.addListener("message", (from, to, message) => {
            debug.irc(`${from} => ${to}: ${message}`);
            this.emit("irc:message", from, to, message);
            return this._handleIncommingMessage(from, to, message);
        });

        this._client.addListener("join", (channel, nick, message) => {
            debug.irc(`${nick} join in ${channel}`);
            this.emit("irc:join", channel, nick, message);
            return this._handleJoin(channel, nick, message);
        });

        this._client.addListener("part", (channel, nick, message) => {
            debug.irc(`${nick} part of ${channel}`);
            this.emit("irc:part", channel, nick, message);
            return this._handlePart(channel, nick, message);
        });

        this._client.addListener("registered", (data) => {
            let nick = data.args[0];
            debug.irc(`${nick} registered`);

            this._registered = true;

            this.emit("irc:registered", nick, data);
            let oldNick = this._options.masterNick;
            this._options.masterNick = nick;
            this.emit("changeMasterNick", oldNick, nick);
        });

        this._client.addListener("error", (message) => {
            debug.irc("error: ", message);
            this.emit("error", message);
        });

        this._ownUsernames = [this._options.masterNick];

        return this._client;

    }

    /**
     * Master nick
     * @property
     */
    get materNick() {
        return this._options.masterNick;
    }

}
