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
    oneConnectionByUser: false
};

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
     */
    constructor(name, ircChannel, telegramChannel, options) {
        this._options = assignIn(
            {}, defaultConfig, options);

        debug(`Create bridge ${name}`);

        this._ircConnector = IRCConnection.getByServerOptions(
            this._options.irc);

        this._ircChannel = this._ircConnector.addChannel(
            ircChannel);

        this._telegramConnector = TelegramConnection.getByToken(
            this._options.telegram.token, this._options.telegram);

        this._telegramChannel = this._telegramConnector.followChannel(
            telegramChannel);

        this.bind();

    }

    _handleIRCMessage(user, message) {
        debug("irc in message", user, message);
        let msg = `[IRC/@${user}] ${message}`;
        this._telegramChannel.sendMessage(msg);
    }

    _handleIRCJoin(user) {
        debug("irc join", user);
        let msg = `[IRC] ${user} join`;
        this._telegramChannel.sendMessage(msg);
    }

    _handleIRCLeft(user) {
        debug("irc left", user);
        let msg = `[IRC] ${user} left the channel`;
        this._telegramChannel.sendMessage(msg);
    }

    _handleTelegramMessage(user, message) {
        debug("telegram in message", user, message);
        let msg = `[Telegram/@${user.username}] ${message}`;
        this._ircChannel.sendMessage(msg);
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
            this._handleIRCMessage.bind(this));
        this._ircChannel.on("join",
            this._handleIRCJoin.bind(this));
        this._ircChannel.on("left",
            this._handleIRCLeft.bind(this));

        // Telegram
        this._telegramChannel.on("message",
            this._handleTelegramMessage.bind(this));
        this._telegramChannel.on("join",
            this._handleTelegramJoin.bind(this));
        this._telegramChannel.on("left",
            this._handleTelegramLeft.bind(this));
    }

}
