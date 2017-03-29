import {EventEmitter} from "events";
import debugLib from "debug";
import {assignIn} from "lodash";

import IRCConnection from "./irc";
import TelegramConnection from "./telegram";

const debug = debugLib("bridge");

export const messages = {
    join: "[IRC/{nick} * joined to the channel *]"
};

export const defaultConfig = {
    irc: null,
    telegram: null,
    lang: null,
    oneConnectionByUser: false,
    prefix: "telegram_",
    suflix: "",
};

let userInstances = [];

export const resolveNick = function(name, options) {
    "use strict";
    let {prefix, suflix} = options;
    return `${prefix}${name}${suflix}`; 
};

export class UserBridge extends EventEmitter {

    constructor(name, options) {
        super();

        this._options = assignIn({}, {
            prefix: "tele_",
            suflix: "",
        }, options);

        this._name = name;

        let rnick = resolveNick(this._name, this._options);

        let serveropts =  assignIn(
            {}, options.irc, {nick: rnick}
        );
        
        debug(`Search irc connection for `);
        debug(serveropts);

        this._ircConnection = IRCConnection.getByServerOptions(serveropts);

        userInstances.push(this);

    }

    getChannel(channelName) {
        let channel = this._ircConnection.getChannel(channelName); 
            
        if (!channel) {
            channel = this._ircConnection.addChannel(channelName);
        }

        return channel;
    }

    get nick() {
        resolveNick(this._name, this._options);
    }

    get identifier() {
        let name = this._name;
        let ircIdent = this._ircConnection.identifier;
        return `${name}@@${ircIdent}`;
    }

    static getByOptions(nick, options) {
        let rnick = resolveNick(nick, options);
        let ircOptions = assignIn({}, options.irc, {nick: rnick});
        debug("ircoptions", ircOptions);
        let irc = IRCConnection.getByServerOptions(
            ircOptions);
        let ircIdent = irc.identifier;
        let userIdent = `${nick}@@${ircIdent}`;
        debug(`Find for UserBridge ${userIdent}`);
        let instance = userInstances.find(u => u.identifier === userIdent);

        if (!instance) {
            debug("Not foud, creating");
            instance = new UserBridge(nick, options);
        }

        return instance;
    }
    
}

/**
 * Bridge class
 */
export default class Bridge {

    /**
     * Create new bridge
     * @param {string} name The name of the bridge
     * @param {object} options Options
     * @param {object} irc IRC options
     * @param {object} telegram Telegram options
     * @param {string} [lang] Language of bridge messages
     * @param {bool} [oneConnectionByUser] Create one new connection to IRC by
     *                                     each new user in telegram. By    
     *                                     default is false
     * @param {string} [prefix] User nickname prefix
     * @param {string} [suflix] User nickname suflix
     */
    constructor(name, ircChannel, telegramChannel, options) {
        this._options = assignIn(
            {}, defaultConfig, options);

        this._ircUsers = [];

        debug(`Create bridge ${name}`);

        this._ircConnector = IRCConnection.getByServerOptions(
            this._options.irc);

        this._ircChannel = this._ircConnector.addChannel(
            ircChannel);

        this._telegramConnector = TelegramConnection.getByToken(
            this._options.telegram.token, this._options.telegram);

        this._telegramChannel = this._telegramConnector.followChannel(
            telegramChannel);

        this._handlers = {
            ircMessage: this._handleIRCMessage.bind(this),
            ircJoin: this._handleIRCJoin.bind(this),
            ircLeft: this._handleIRCLeft.bind(this),
            telegramMessage: this._handleTelegramMessage.bind(this),
            telegramJoin: this._handleTelegramJoin.bind(this),
            telegramLeft: this._handleTelegramLeft.bind(this),
        };

        this.bind();

    }

    _handleIRCMessage(user, message) {
        debug("irc in message", user, message);
        let msg = `[IRC/${user}] ${message}`;
        this._telegramChannel.sendMessage(msg);
    }

    _handleIRCJoin(user) {
        debug("irc join", user);
        let msg = `[IRC] ** ${user} join`;
        this._telegramChannel.sendMessage(msg);
    }

    _handleIRCLeft(user) {
        debug("irc left", user);
        let msg = `[IRC] ** ${user} left the channel`;
        this._telegramChannel.sendMessage(msg);
    }

    _handleTelegramMessage(user, message) {
        debug("telegram in message", user, message);
        if (this._options.oneConnectionByUser) {
            let userConnection = UserBridge.getByOptions(
                user.username, this._options);
            let chan = userConnection.getChannel(this._ircChannel.name);
            chan.sendMessage(message);
        } else {
            let msg = `[Telegram/@${user.username}] ${message}`;
            this._ircChannel.sendMessage(msg);
        }
    }

    _handleTelegramJoin(...args) {
        debug("telegram in join", ...args);
    }

    _handleTelegramLeft(...args) {
        debug("telegram in left", ...args);
    }

    bind() {

        // IRC
        this._ircChannel.on("message",
            this._handlers.ircMessage);

        this._ircChannel.on("join",
            this._handlers.ircJoin);

        this._ircChannel.on("left",
            this._handlers.ircLeft);

        // Telegram
        
        this._telegramChannel.on("message",
            this._handlers.telegramMessage);

        this._telegramChannel.on("join",
            this._handlers.telegramJoin);

        this._telegramChannel.on("left",
            this._handlers.telegramLeft); 
        

    }

}
