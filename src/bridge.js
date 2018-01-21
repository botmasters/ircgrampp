/**
 * Bridge module
 * 
 * @TODO: Fix problem with final nick already exist on IRC channel
 */

import {EventEmitter} from "events";
import debugLib from "debug";
import {assignIn} from "lodash";
import escapeStringRegExp from "escape-string-regexp";
import {str as crc32} from 'crc-32';
import ircColors from 'irc-colors';
import {syncHookedMethod, asyncHookedMethod} from "./hooks";

import IRCConnection from "./irc";
import TelegramConnection from "./telegram";

const debug = debugLib("bridge");

const colors =[
    'navy',
    'green',
    'red',
    'maroom',
    'violet',
    'olive',
    'lime',
    'teal',
    'cyan',
    'blue',
    'pink',
];

export const messages = {
    join: "[IRC/{nick} * joined to the channel *]"
};

export const defaultConfig = {
    irc: null,
    telegram: null,
    lang: null,
    oneConnectionByUser: false,
    showJoinLeft: true,
    prefix: "telegram_",
    suffix: "",
    ircScapeCharacter: "",
};

let userInstances = [];

/**
 * Resolve nicks with the prefix and suffix options
 * @param {object} userData
 * @param {object} options
 * @return {string}
 */
export const resolveNick = function(userData, options) {
    "use strict";
    let name = (userData.username ||
        `${userData.first_name}-${userData.id}`) 
        .replace(/[^a-z_]+/ig, '');
    let {prefix, suffix} = options;
    return `${prefix}${name}${suffix}`; 
};

/**
 * User bridge, for oneConnectionByUser option
 */
export class UserBridge extends EventEmitter {

    /**
     * Create new UserBridge
     * @param {object} userData The telegram format user information
     * @param {object} options Bridge options
     */
    constructor(userData, options) {
        super();
        this._constructor(userData, options);
    }

    @syncHookedMethod('userbridge:create', 'userData', 'options')
    _constructor(userData, options) {
        this._options = assignIn({}, {
            prefix: "tele_",
            suffix: "",
        }, options);

        this._userData = userData;

        this._name = userData.username ||
            `${userData.first_name}-${userData.id}`; 

        let rnick = resolveNick(userData, this._options);

        let serveropts =  assignIn(
            {}, options.irc, {nick: rnick}
        );
        
        debug(`Search irc connection for ${rnick}@${serveropts.server}`);

        this._ircConnection = IRCConnection.getByServerOptions(serveropts);

        userInstances.push(this);

        return this;
    }

    /**
     * Get channel from the user bridge
     * @param {string} channelName IRC channel name
     * @return {IRCChannel}
     */
    @syncHookedMethod('userbridge:get.channel')
    getChannel(channelName) {
        let channel = this._ircConnection.getChannel(channelName); 
            
        if (!channel) {
            channel = this._ircConnection.addChannel(channelName);
        }

        return channel;
    }

    /**
     * Final nickname (applied prefix/suffix);
     * @property nick
     */
    get nick() {
        return resolveNick(this._userData, this._options);
    }

    /**
     * Original name (telegram username)
     * @property name
     */
    get name() {
        return this._name;
    }

    /**
     * Original telegram id
     * @property tid
     */
    get tid() {
        return this._userData.id;
    }

    /**
     * Unique identifier, generated with username and server options
     * @property identifier
     */
    get identifier() {
        let tid = this.tid;
        let ircIdent = this._ircConnection.identifier;
        return `${tid}@@${ircIdent}`;
    }

    /**
     * Get UserBridge by options
     * @param {object} userData Original information
     * @param {object} options Bridge options
     * @return {UserBridge}
     */
    @syncHookedMethod('userbridge:get.by.options', 'userData', 'options')
    static getByOptions(userData, options) {
        let rnick = resolveNick(userData, options);
        let ircOptions = assignIn({}, options.irc, {nick: rnick});
        let irc = IRCConnection.getByServerOptions(
            ircOptions);
        let ircIdent = irc.identifier;
        let userIdent = `${userData.id}@@${ircIdent}`;
        debug(`Find for UserBridge ${userIdent}`);
        let instance = userInstances.find(u => u.identifier === userIdent);

        if (!instance) {
            debug("Not foud, creating");
            instance = new UserBridge(userData, options);
        }

        return instance;
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
        this._constructor(name, ircChannel, telegramChannel, options);
    }

    @syncHookedMethod('bridge:create',
        'name', 'ircChannel', 'telegramChannel', 'options')
    _constructor(name, ircChannel, telegramChannel, options) {
        this._options = assignIn(
            {}, defaultConfig, options);

        this._ircUsers = [];

        debug(`Create bridge ${name}`);

        this._name = name;

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
            ircAction: this._handleIRCAction.bind(this),
            ircJoin: this._handleIRCJoin.bind(this),
            ircLeft: this._handleIRCLeft.bind(this),
            ircTopic: this._handleIRCTopic.bind(this),
            telegramMessage: this._handleTelegramMessage.bind(this),
            telegramJoin: this._handleTelegramJoin.bind(this),
            telegramLeft: this._handleTelegramLeft.bind(this),
        };

        this._nickColorCache = [];

        this.bind();

        return this;
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
     * Get a color from username
     * @param {string} nick
     * @return {string} Color name
     */
    @syncHookedMethod('bridge:get.irc.color', 'nick')
    _getIrcColor(nick) {
        let c = this._nickColorCache.find((x) => x.str === nick);

        if (c) {
            return c.color;
        }

        let colorIndex = Math.abs(crc32(nick) % colors.length);
        let color = colors[colorIndex];

        this._nickColorCache.push({
            str: nick,
            color,
        });

        if (this._nickColorCache.length > 30) {
            this._nickColorCache.shift();
        }

        return color;
    }

    /**
     * Get UserBridge from a telegram user
     * @param {object} userData Telegram user information
     * @return {UserBridge}
     */
    @syncHookedMethod("bridge:get.irc.user")
    _getIrcUser(userData) {
        let user = this._ircUsers.find(
            x => x.tid === userData.id);

        if (!user) {
            user = UserBridge.getByOptions(userData, this._options);
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
     * @param {object} userData Telegram user information
     * @return {IRCChannel}
     */
    @syncHookedMethod('bridge:get.irc.user.channel')
    _getIrcUserChan(userData) {
        let user = this._getIrcUser(userData);
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
    @asyncHookedMethod('bridge:irc.handle.message', 'user', 'message')
    _handleIRCMessage(user, message) {
        if (this._haveIrcUser(user)) {
            return;
        }
        debug("irc in message", user);

        if (this._options.oneConnectionByUser) {
            message = this._translateIrcNicks(message);
        }

        let msg = `*<${user}>* ${message}`;
        this._telegramChannel.sendMessage(msg, { "parse_mode": 'markdown' });
    }

    /**
     * Handle incomming IRC action 
     * @param {string} user IRC user
     * @param {string} message Message
     */
    _handleIRCAction(user, message) {
        if (this._haveIrcUser(user)) {
            return;
        }
        debug("irc in action", user);

        if (this._options.oneConnectionByUser) {
            message = this._translateIrcNicks(message);
        }

        let msg = `_*<${user}> ${message}*_`;
        this._telegramChannel.sendMessage(msg, { "parse_mode": 'markdown' });
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

        if (this._options.showJoinLeft) {
            let msg = `_*<${user}> has joined*_`;
            this._telegramChannel.sendMessage(msg, { "parse_mode": 'markdown' });
        }
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

        if (this._options.showJoinLeft) {
            let msg = `_*${user} left the channel*_`;
            this._telegramChannel.sendMessage(msg, { "parse_mode": 'markdown' });
        }   
    }

    /**
     * Handle IRC topic message
     * @param {string} user Irc user
     */
    _handleIRCTopic(channel, topic, nick) {
        if (this._haveIrcUser(nick)) {
            return;
        }
        debug("irc topic", topic, nick);
        let msg = `_*<${nick}> changed the topic to: ${topic}*_`;
        this._telegramChannel.sendMessage(msg);
    }

    /**
     * Handle Telegram incomming message
     * @param {object} user Telegram user data 
     * @param {string} message Text message
     */
    @asyncHookedMethod('bridge:telegram.handle.message', 'user', 'message')
    _handleTelegramMessage(user, message) {
        debug("telegram in message", user);

        let scapeChar = this._options.ircScapeCharacter;

        if (this._options.oneConnectionByUser) {
            let chan = this._getIrcUserChan(user);
            chan.sendMessage(message);
        } else if (scapeChar && message.startsWith(scapeChar)){
            this._ircChannel.sendMessage(message);

        } else {
            let msg;

            if (this._options.useIrcColors) {
                let color = this._getIrcColor(user.username);
                let nick = ircColors[color].bold(
                     `[Telegram/@${user.username}]`
                );
                let txt = ircColors.stripColorsAndStyle(message);
                msg = `${nick} ${txt}`;
            } else {
                msg = `[Telegram/@${user.username}] ${message}`;
            }
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
            this._getIrcUserChan(user);
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
                let chan = this._getIrcUserChan(user);
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

        this._ircChannel.on("action",
            this._handlers.ircAction);

        this._ircChannel.on("join",
            this._handlers.ircJoin);

        this._ircChannel.on("left",
            this._handlers.ircLeft);

        this._ircChannel.on("topic",
            this._handlers.ircTopic);

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

    /**
     * @property {String} name
     */
    get name() {
        return this._name;
    }

}
