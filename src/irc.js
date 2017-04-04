
import debugLib from "debug";
import {EventEmitter} from "events";
import {assignIn, noop} from "lodash";
import {Client as IRCClient} from "irc";
import config from "./config";

var Promise = require("bluebird");

let instances = [];

const debug = {
    irc: debugLib("irc"),
};

export const defaultConfig = assignIn({
    server: null,
    nick: null,
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
        debug.irc(
            `Creating IRCChannel for ${channel} for ${connection.ident}`);
        this._channel = channel;
        this._connection = connection;
        this._nicks = [connection.nick];

        this._handlers = {
            message: this._handleMessage.bind(this),
            join: this._handleJoin.bind(this),
            left: this._handleLeft.bind(this),
            topic: this._handleTopic.bind(this),
            changeNick: this._handleChangeNick.bind(this),
        };

        this.bind();

    }

    _handleMessage(nick, message) {
        if (!message) {
            return;
        }

        this.emit("message", nick, message);
    }

    _handleJoin(nick) {
        this.emit("join", nick);
    }

    _handleLeft(nick) {
        this.emit("left", nick);
    }

    _handleTopic(channel, topic, nick, message) {
        this.emit("topic", channel, topic, nick, message);
    }

    _handleChangeNick(oldNick, newNick) {
        this._nicks = this._nicks.filter(n => n !== oldNick);
        this._nicks.push(newNick);
    }

    bind() {
        let channel = this._channel;

        this._connection.on(`${channel}:join`,
            this._handlers.join);

        this._connection.on(`${channel}:part`,
            this._handlers.left);
        
        this._connection.on(`${channel}:topic`,
            this._handlers.topic);

        this._connection.on(`${channel}:message`,
            this._handlers.message);

        this._connection.on("changeMasterNick",
            this._handlers.changeNick);
   
    }

    unbind() {
        let channel = this._channel;

        this._connection.removeListener(`${channel}:join`,
            this._handlers.join);

        this._connection.removeListener(`${channel}:part`,
            this._handlers.left);
        
        this._connection.removeListener(`${channel}:topic`,
            this._handlers.topic);

        this._connection.removeListener(`${channel}:message`,
            this._handlers.message);

        this._connection.removeListener("changeMasterNick",
            this._handlers.changeNick);       
    }

    sendMessage(msg) {
        return this._connection.sendMessage(this._channel, msg);
    }

    /**
     * Return true if the channel has an own nickname
     * @param {string} nickName The nickname to find
     * @return {bool}
     */
    hasNick(nickName) {
        return this._nicks.indexOf(nickName) !== -1;
    }

    destroy() {
        debug.irc(`Destroy channel ${this.name}`);
        this.unbind();
        this._connection.removeChannel(this.name);
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
     * @param {string} options.nick The nick in the server
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
        this._originalNick = this._options.nick;
        
        debug.irc(`Start irc connection ${this._options.server}`);

        if (!this._options.server || !this._options.port ||
            !this._options.nick) {
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

        instances.push(this);

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
            this.emit(`${ownChannel.name}:message`, from, message);
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

    /**
     * Handle topic from the server
     * @param {string} channel
     * @param {string} topic
     * @param {string} nick
     * @param {string} message
     */
    _handleTopic(channel, topic, nick, message) {
        let ownChannel = this.getChannel(channel);

        if (ownChannel && !ownChannel.hasNick(nick)) {
            this.emit(`${ownChannel.name}:topic`, channel, topic, nick, message);
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
        debug.irc(`Add channel to IRCConnection ${channelName}`);

        if (this._channels.find(c => c.name === channelName)) {
            throw new Error("Channel already exists");
        } 

        let channel = new IRCChannel(channelName, this);
        this._channels.push(channel);

        this.waitForRegistered()
            .then(() => {
                debug.irc("Send irc join");
                this.client.join(channelName);
            });

        return channel;
    }

    removeChannel(channelName) {
        let channel = this._channels.find(
            c => c.name === channelName);

        if (!channel) {
            throw new Error("Channel does not exists");
        }

        this.waitForRegistered()
            .then(() => {
                this.client.part(channelName);
            });

        this._channels = this._channels.filter(
            x => x.name !== channel.name);
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
            server, port, ssl, nick, autoConnect, channels
        } = this._options;

        this._client = new IRCClient(server, nick, {
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

        this._client.addListener("topic", (channel, topic, nick, message) => {
            debug.irc(`${nick} changed the topic of ${channel} to ${topic}`);
            this.emit("irc:topic", channel, topic, nick, message);
            return this._handleTopic(channel, topic, nick, message);
        });

        this._client.addListener("registered", (data) => {
            let nick = data.args[0];
            debug.irc(`${nick} registered`);

            this._registered = true;

            this.emit("irc:registered", nick, data);
            let oldNick = this._options.nick;
            this._options.nick = nick;
            this.emit("changeMasterNick", oldNick, nick);
        });

        this._client.addListener("error", (message) => {
            debug.irc("error: ", message);
            this.emit("error", message);
        });

        this._ownUsernames = [this._options.nick];

        return this._client;

    }

    sendMessage(channel, msg) {
        // hack ¿?
        noop(this.client);
        this.waitForRegistered()
            .then(() => {
                this.client.say(channel, msg);
            });
    }

    /**
     * Nick
     * @property
     */
    get nick() {
        return this._options.nick;
    }

    /**
     * identifier
     * @property
     */
    get identifier() {
        let {port, server, ssl} = this._options;
        let originalNick = this._originalNick;
        return `${originalNick}@${server}:${port}${ssl ? "+" : ""}`;
    }

    /**
     * Get connection by server options, if does not exists, create one
     * @param {object} options @see IRCConnection.contrusctor
     * @return {IRCConnection}
     */
    static getByServerOptions(uoptions) {
        let options = assignIn({}, defaultConfig, uoptions);
        let {nick, port, server, ssl} = options;
        let identifier = `${nick}@${server}:${port}${ssl ? "+" : ""}`;

        debug.irc(`Search server by identifier ${identifier}`);
        
        let instance = instances.find(i => i.identifier === identifier);

        if (!instance) {
            instance = new IRCConnection(options);
        }

        return instance;

    }

}
