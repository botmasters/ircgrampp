
import {EventEmitter} from "events";
import debugLib from "debug";
import {assignIn, noop} from "lodash";
import TelegramBot from 'node-telegram-bot-api';
import {ChannelsInfo} from "./storage";

var Promise = require("bluebird");

const debug = debugLib("telegram");

const NEW_CHAT_PARTICIPANT = "new_chat_participant";
const LEFT_CHAT_PARTICIPANT = "left_chat_participant";

const defaultConfig = {
    token: null,
    autoConnect: true,
};

let instances = [];

/**
 * Telegram channel wrapper
 */
export class TelegramChannel extends EventEmitter {

    /**
     * Create channel wrapper for telegram
     * @param {int|string} channel The channel title, or ID
     * @param {TelegramConnection} connector The connector instance
     */
    constructor(channel, connector) {
        super();
        debug("Start channel");
        this._channel = channel;
        this._connector = connector;

        this._hasInfo = false;
        this._chatId = null;
        this._chatType = null;
        this._chatTitle = null;
        this._chatLastUpdated = null;

        let channelsInfo = ChannelsInfo.getInstance();
        let chatInfo = channelsInfo.find(this._channel);

        this._handlers = {
            message: this._handleMessage.bind(this),
            join: this._handleNewParticipant.bind(this),
            left: this._handleLeftParticipant.bind(this),
        };

        if (chatInfo) {
            debug("Heve info about channel, setting");
            this.setData(chatInfo, false);
        } else {
            this.bind();
        }

    }

    _handleMessage(user, message) {
        if (!message) {
            return;
        }
        this.emit("message", user, message);
    }

    _handleNewParticipant(...args) {
        this.emit("join", ...args);
    }

    _handleLeftParticipant(...args) {
        this.emit("left", ...args);
    }

    _handleInfoUpdate(data) {
        if (data.id === this._channel || data.title === this._channel) {
            this.setData(data);
        }
    }

    unbind() {
        let prefix = this.channelPrefix;

        debug(`unbind channel ${prefix}`);

        this._connector.removeListener(`${prefix}:message`,
            this._handlers.message);

        this._connector.removeListener(`${prefix}:newparticipant`,
            this._handleNewParticipant);

        this._connector.removeListener(`${prefix}:leftparticipant`,
            this._handleLeftParticipant);

        this._connector.removeListener("chatinformationupdate",
            this._handleInfoUpdate);
    }

    bind() {

        let prefix = this.channelPrefix;

        debug(`bind channel ${prefix}`);

        this._connector.on(`${prefix}:message`,
            this._handlers.message);

        this._connector.on(`${prefix}:newparticipant`,
            this._handleNewParticipant.bind(this));

        this._connector.on(`${prefix}:leftparticipant`,
            this._handleLeftParticipant.bind(this));

        this._connector.on("chatinformationupdate",
            this._handleInfoUpdate.bind(this));
   
    }

    /**
     * Set channel information
     * @param {object} data
     */
    setData(data, sync = true) {

        if (typeof this._channel === "string") {
            this.unbind();
        }
        
        if (sync && 
            (this._chatTitle !== data.title || this._chatType !== data.type)) {
            ChannelsInfo.getInstance()
                .save(data);
        }

        this._hasInfo = true;
        this._chatId = data.id;
        this._chatType = data.type;
        this._chatTitle = data.title;
        this._chatLastUpdated = data.updated;

        if (typeof this._channel === "string") {
            this.bind();
        }

        this.emit("updateinformation");
    }

    /**
     * Wait to get channel information, this is necesary for exampleto
     * send a message
     * @return {Promise}
     */
    waitInformation() {
        if (this._hasInfo) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.once("updateinformation", () => {
                return resolve();
            });
        });
    }

    /**
     * Send a message to the channel
     * @param {string} message
     */
    sendMessage(message) {
        this.waitInformation()
            .then(() => {
                return this._connector.send(this._chatId, message);
            });
    }

    /**
     * Get the channel prefix
     * @return {string} The channel prefix
     */
    get channelPrefix() {

        if (this._hasInfo) {
            return `#${this._chatId}`;
        } else if (typeof this._channel === "string") {
            return `@@${this._channel}`;
        } else if (typeof this._channel === "number") {
            return `#${this._channel}`;
        } else {
            throw new Error("Unknow channel type");
        }
    }

    /**
     * Name of channel
     * @property name
     */
    get name() {
        return this.channelPrefix; 
    }

}

/**
 * Telegram connection helper
 */
export default class TelegramConnection extends EventEmitter {

    /**
     * Create new connection with telegram
     * @param {object} options  Options
     * @param {string} options.token Telegram API token
     */
    constructor(options) {
        super();

        this._tgBot = null;
        this._options = assignIn({}, defaultConfig, options);
        this._channels = [];

        if (this._options.autoConnect) {
            noop(this.tgBot);
        }
        
        instances.push(this);

    }

    /**
     * Send a message
     * @param {string|number} chatId The chat ID
     * @param {string} msg Message
     */
    send(chatId, msg) {
        return this.tgBot.sendMessage(chatId, msg);
    }

    /**
     * Get the chat info from a incomming message
     * @param {object} msg
     * @return {object}
     */
    getChatInfo(msg) {
        let {chat} = msg;
        return {
            chatId: chat.id,
            chatType: chat.type,
            chatTitle: chat.title,
        };
    }

    /**
     * Generate a chat event prefix
     * @param {object} msg
     * @return {object}
     */
    getChatEvPrefix(msg) {
        let {chatId, chatTitle} = this.getChatInfo(msg);
        return {
            idPrefix: `#${chatId}`,
            titlePrefix: `@@${chatTitle}`
        };
    }

    /**
     * Refresh the chat information when it's received a new message
     * @param {object} chatData
     */
    refreshChatInformation(chatData) {
        let {id, title, type} = chatData;
        let now = (new Date()).getTime();
        let channelsInfo = ChannelsInfo.getInstance();

        let current = channelsInfo.find(id);

        if (current && current.type === type && current.id === id &&
                current.title === title) {
                return;
        }

        let data = {
            id,
            title,
            type,
            updated: now
        };

        channelsInfo.save(data);
        debug("channel info update", data.id, data.title);
        this.emit("chatinformationupdate", data);
    }

    /**
     * Follow a channel
     * @param {string|number} channelId The channel to follow
     * @return {TelegramChannel} The channel wrapper
     */
    followChannel(channelId) {
        let channel = new TelegramChannel(channelId, this);
        this._channels.push(channel);
        return channel;
    }

    /**
     * TelegramBot connection
     * @see https://github.com/yagop/node-telegram-bot-api
     * @property tgBot
     */
    get tgBot() {
        if (this._tgBot) {
            return this._tgBot;
        }

        debug("Token", this._options.token);
        this._tgBot = new TelegramBot(this._options.token, {
            polling: true
        });

        this._tgBot.on("message", (msg) => {
            let {from, text, chat}  = msg;
            let {idPrefix, titlePrefix} = this.getChatEvPrefix(msg);
            this.refreshChatInformation(chat);
            debug(`${titlePrefix} (${idPrefix}): ${from.id} -> ${text}`);
            this.emit("telegram:message", chat, from, text);
            this.emit(`${idPrefix}:message`, from, text, chat);
            this.emit(`${titlePrefix}:message`, from, text, chat);
        });

        this._tgBot.on("new_chat_participant", (msg) => {
            let newParticipant = msg[NEW_CHAT_PARTICIPANT];
            let {idPrefix, titlePrefix} = this.getChatEvPrefix(msg);
            this.refreshChatInformation(msg.chat);
            debug(`${titlePrefix} (${idPrefix}): ` +
                  `new participant ${newParticipant}`);
            this.emit("telegram:newparticipant", msg.chat, newParticipant);
            this.emit(`${idPrefix}:newparticipant`, newParticipant);
            this.emit(`${titlePrefix}:newparticipant`, newParticipant);
        });

        this._tgBot.on("left_chat_participant", (msg) => {
            let {idPrefix, titlePrefix} = this.getChatEvPrefix(msg);
            let leftParticipant = msg[LEFT_CHAT_PARTICIPANT];
            this.refreshChatInformation(msg.chat);
            debug(`${titlePrefix} (${idPrefix}): ` +
                  `left participant ${leftParticipant}`);
            this.emit("telegram:leftparticipant", msg.chat, leftParticipant);
            this.emit(`${idPrefix}:leftparticipant`, leftParticipant);
            this.emit(`${titlePrefix}:leftparticipant`, leftParticipant);
        });

        this._tgBot.getMe()
            .then((me) => {
                this._me = me;
                this.emit("getme");
            });

        return this._tgBot;

    }

    /**
     * Information about the connected bot
     * @property
     */
    get me() {
        if (this._me) {
            return Promise.resolve(this._me);
        }

        return new Promise((resolve) => {
            this.once("getme", () => {
                return resolve(this._me);
            });
        });
        
    }

    /**
     * The token that is connected the bot
     * @property
     */
    get token() {
        return this._options.token;
    }

    /**
     * Get an instance of TelegramConnector by token, if the instance
     * does not exists, it's created, like getInstance, but by token
     * @param {string} token The token
     * @param {object} options Options for new instance creation
     * @return {TelegramConnection}
     */
    static getByToken(token, options = {}) {

        let instance = instances.find(i => i.token === token);

        if (!instance) {
            instance = new TelegramConnection(
                assignIn(options, {token}));
        }

        return instance;
    
    }

}
