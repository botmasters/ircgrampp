/**
 * Bridge module
 * 
 * @TODO: Fix problem with final nick already exist on IRC channel
 */

import {EventEmitter} from "events";
import debugLib from "debug";
import {assignIn} from "lodash";
import escapeStringRegExp from "escape-string-regexp";
import {declareHook} from "./hooks";

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
    suffix: "",
};

let userInstances = [];

/**
 * Resolve nicks with the prefix and suffix options
 * @param {string} name
 * @param {object} options
 * @return {string}
 */
export const resolveNick = function(name, options) {
    "use strict";
    name = name.replace(/[^\w_]/, '');
    let {prefix, suffix} = options;
    return `${prefix}${name}${suffix}`; 
};

const getUserBridgeByOptionsHook = declareHook("userbridge:get.by.options");

/**
 * User bridge, for oneConnectionByUser option
 */
export class UserBridge extends EventEmitter {

    /**
     * Create new UserBridge
     * @param {string} name The original name (Telegram username)
     * @param {object} options Bridge options
     */
    constructor(name, options) {
        super();

        this._options = assignIn({}, {
            prefix: "tele_",
            suffix: "",
        }, options);

        this._name = name;

        this._hooks = {
            create: declareHook("userbridge:create"),
            getChannel: declareHook("userbridge:get.channel"),
        };

        let rnick = resolveNick(this._name, this._options);

        let serveropts =  assignIn(
            {}, options.irc, {nick: rnick}
        );
        
        debug(`Search irc connection for ${rnick}@${serveropts.server}`);

        this._ircConnection = IRCConnection.getByServerOptions(serveropts);

        userInstances.push(this);
        this._hooks.create.after(this);

    }

    /**
     * Get channel from the user bridge
     * @param {string} channelName IRC channel name
     * @return {IRCChannel}
     */
    getChannel(channelName) {

        this._hooks.getChannel.before(channelName);

        let channel = this._ircConnection.getChannel(channelName); 
            
        if (!channel) {
            channel = this._ircConnection.addChannel(channelName);
        }

        this._hooks.getChannel.after(channel);

        return channel;
    }

    /**
     * Final nickname (applied prefix/suffix);
     * @property nick
     */
    get nick() {
        return resolveNick(this._name, this._options);
    }

    /**
     * Original name (telegram username)
     * @property name
     */
    get name() {
        return this._name;
    }

    /**
     * Unique identifier, generated with username and server options
     * @property identifier
     */
    get identifier() {
        let name = this._name;
        let ircIdent = this._ircConnection.identifier;
        return `${name}@@${ircIdent}`;
    }

    /**
     * Get UserBridge by options
     * @param {string} nick Original username
     * @param {object} options Bridge options
     * @return {UserBridge}
     */
    static getByOptions(unick, uoptions) {

        let params = getUserBridgeByOptionsHook.beforeSync({
            nick: unick,
            options: uoptions
        });

        let {nick, options} = params;

        let rnick = resolveNick(nick, options);
        let ircOptions = assignIn({}, options.irc, {nick: rnick});
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

        return getUserBridgeByOptionsHook.afterSync(instance);

    }
    
}

/**
 * Bridge class
 */
export default class Bridge extends EventEmitter {

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
     * @param {string} [suffix] User nickname suffix
     */
    constructor(name, ircChannel, telegramChannel, options) {
        super();

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

        this._telegramSuccessMe = false;
        this._ircSuccessRegistered = false;

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

    /**
     * Translate IRC nicks to Telegram nicks
     * @param {string} message Message to translate nicks
     * @return {string} Final message
     */
    _translateIrcNicks(message) {
        return this._ircUsers
            .map((x) => {
                let {name, nick} = x;
                return {name, nick};
            })
            .reduce((message, replaces) => {
                let {name, nick} = replaces;
                let snick = escapeStringRegExp(nick);
                let regexptxt = `\\b${snick}\\b`;
                let regexp = new RegExp(regexptxt, "g");
                return message.replace(regexp, `@${name}`);
            }, message);
    }

    /**
     * Get UserBridge from a telegram user
     * @param {string} username Telegram username
     * @return {UserBridge}
     */
    _getIrcUser(username) {
        let user = this._ircUsers.find(
            x => x.name === username);

        if (!user) {
            user = UserBridge.getByOptions(username, this._options);
            this._ircUsers.push(user);
        }

        return user;
    }

    /**
     * Return true if there are a UserBridge with the passed irc nick
     * @param {string} nick IRC nick
     * @return {bool}
     */
    _haveIrcUser(nick) {
        debug(`Check if have user ${nick}`);
        
        if (nick === this._ircConnector.nick) {
            return true;
        }

        return !!this._ircUsers.find(
            x => x.nick === nick);
    }

    /**
     * Return the final IRCChannel from an UserBridge
     * @param {string} username Telegram username
     * @return {IRCChannel}
     */
    _getIrcUserChan(username) {
        let user = this._getIrcUser(username);
        let chan = user.getChannel(this._ircChannel.name);
        return chan;
    }

    /**
     * Remove an user from IRC users list
     * @param {UserBridge} user UserBridge insntance
     * @return {UserBridge}
     */
    _removeIrcUser(user) {
        this._ircUsers = this._ircUsers.filter(
            x => x.identifier !== user.identifier);
        return user;
    }

    /**
     * Handle incomming IRC message
     * @param {string} user IRC user
     * @param {string} message Message
     */
    _handleIRCMessage(user, message) {
        if (this._haveIrcUser(user)) {
            return;
        }
        debug("irc in message", user);

        if (this._options.oneConnectionByUser) {
            message = this._translateIrcNicks(message);
        }

        let msg = `[IRC/${user}] ${message}`;
        this._telegramChannel.sendMessage(msg);
    }

    /**
     * Handle incomming IRC join message
     * @param {string} user IRC user
     */
    _handleIRCJoin(user) {
        if (this._haveIrcUser(user)) {
            return;
        }
        debug("irc join", user);
        let msg = `[IRC] ** ${user} join`;
        this._telegramChannel.sendMessage(msg);
    }

    /**
     * Handle IRC part message
     * @param {string} user Irc user
     */
    _handleIRCLeft(user) {
        if (this._haveIrcUser(user)) {
            return;
        }
        debug("irc left", user);
        let msg = `[IRC] ** ${user} left the channel`;
        this._telegramChannel.sendMessage(msg);
    }

    /**
     * Handle Telegram incomming message
     * @param {object} user Telegram user data 
     * @param {string} message Text message
     */
    _handleTelegramMessage(user, message) {
        debug("telegram in message", user);
        if (this._options.oneConnectionByUser) {
            let chan = this._getIrcUserChan(user.username);
            chan.sendMessage(message);
        } else {
            let msg = `[Telegram/@${user.username}] ${message}`;
            this._ircChannel.sendMessage(msg);
        }
    }

    /**
     * Handle Telegram join message
     * @param {object} user Telegram user data
     */
    _handleTelegramJoin(user) {
        debug("telegram in join", user);
        if (this._options.oneConnectionByUser) {
            this._getIrcUserChan(user.username);
        } else {
            let msg = `[Telegram] ${user.username} join`;
            this._ircChannel.sendMessage(msg);
        }
    }

    /**
     * Handle telegram user left message
     * @param {object} user Telegram user data
     */
    _handleTelegramLeft(user) {
        debug("telegram left", user);
        if (this._options.oneConnectionByUser) {
            if (this._haveIrcUser(user)) {
                let chan = this._getIrcUserChan(user.username);
                chan.destroy();
            }
        } else {
            let msg = `[Telegram] ${user.username} left`;
            this._ircChannel.sendMessage(msg);
        }
    }

    /**
     * Bind all events
     * @private
     */
    bind() {

        // IRC
        
        this._ircConnector.waitForRegistered()
            .then(() => {
                this._ircSuccessRegistered = true;
                this.emit("irc:registered");
            });
        
        this._ircChannel.on("message",
            this._handlers.ircMessage);

        this._ircChannel.on("join",
            this._handlers.ircJoin);

        this._ircChannel.on("left",
            this._handlers.ircLeft);

        // Telegram
        
        this._telegramConnector.me 
            .then((me) => {
                this._telegramSuccessMe = true;
                this.emit("telegram:me", me);
            });
        
        this._telegramChannel.on("message",
            this._handlers.telegramMessage);

        this._telegramChannel.on("join",
            this._handlers.telegramJoin);

        this._telegramChannel.on("left",
            this._handlers.telegramLeft); 
        

    }

}
