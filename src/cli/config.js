
import inquirer from "inquirer";
import debugLib from "debug";
import etc from "etc";
import {assignIn} from "lodash";
import {
    checkConfigDir,
    createDataDir,
    renderConfigFile,
    getBridgeConfig,
    saveConfig,
    saveBridgeConfig,
    deleteBridgeConfig,
    config} from "../config";

var Promise = require("bluebird");

// RFC1459
const IRC_NICK_RE = /^[a-z_\-\[\]\\^{}|`][a-z0-9_\-\[\]\\^{}|`]{2,15}$/i;
/*eslint no-control-regex: "off"*/
const IRC_CHAN_RE = /^([#&][^\x07\x2C\s]{0,200})$/i;

const debug = debugLib("cli-config");

const CancelSignal = function () {}

const options = [
    {
        key: "globals",
        text: "(re)Configure global settings",
    },
    {
        key: "editb",
        text: "Edit bridge config",
    }, {
        key: "createb",
        text: "Create new bridge config",
    }, {
        key: "deleteb",
        text: "Delete bridge(s)",
    },
    {
        key: "exit",
        text: "Exit"
    }
];

const generateConfigQuestions = function (defaults = {}, options = {}) {

    let defaultsOptions = assignIn({}, {
        "telegram:token": config.get("telegram:token") || undefined,
        "irc:server": config.get("irc:server") || undefined,
        "irc:port": config.get("irc:port") || 6697,
        "irc:nick": config.get("irc:nick") || undefined,
        "irc:secure": config.get("irc:secure") === false ?
                            false :
                            config.get("irc:secure"),
        "oneConnectionByUser": config.get("oneConnectionByUser") || false,
        "ircScapeCharacter": config.get("ircScapeCharacter") || "",
        "showJoinLeft": config.get("showJoinLeft") || true,
        "prefix": config.get("prefix") || "telegram_",
        "suffix": config.get("suffix") || "",
    }, defaults);

    return [
        {
            type: "input",
            name: "telegram:token",
            message: "Telegram token",
            default: defaultsOptions["telegram:token"],
        },
        {
            type: "input",
            name: "irc:server",
            message: "IRC server ip or nameserver?",
            default: defaultsOptions["irc:server"],
        },
        {
            type: "input",
            name: "irc:port",
            message: "IRC server port?",
            default: defaultsOptions["irc:port"],
            validate (value) {
                value = parseInt(value);
                return value > 0 && value < 65535;
            }
        },
        {
            type: "input",
            name: "irc:nick",
            message: "IRC nickname",
            default: defaultsOptions["irc:nick"],
            validate(value) {

                if (!options.ircNickNameRequired && value === "") {
                    return true;
                }

                if (value.match(IRC_NICK_RE)) {
                    return true;
                } else {
                    return "Invalid IRC nick";
                }
            }
        },
        {
            type: "confirm",
            name: "irc:secure",
            message: "IRC server uses SSL?",
            default: defaultsOptions["irc:secure"],
        },
        {
            type: "confirm",
            name: "oneConnectionByUser",
            message: "Do you use one new IRC connection by telgram user?",
            default: defaultsOptions["oneConnectionByUser"],
        },
        {
            type: "input",
            name: "ircScapeCharacter",
            message: "Do you use one especial character for IRC bots?",
            default: defaultsOptions["ircScapeCharacter"],
        },
        {
            type: "confirm",
            name: "showJoinLeft",
            message: "Do you want to show who join or left irc channel in Telegram?",
            default: defaultsOptions["showJoinLeft"],
        },
        {
            type: "input",
            name: "prefix",
            message: "Prefix for IRC users?",
            default: defaultsOptions["prefix"],
            validate(value) {
                return !!value.match(/^[a-z0-9_]{0,10}$/i);
            }
        },
        {
            type: "input",
            name: "suffix",
            message: "Suffix for IRC users?",
            default: defaultsOptions["suffix"],
            validate(value) {
                return !!value.match(/^[a-z0-9_]{0,10}$/i);
            }
        }
    ];

}

const generateBridgeConfigQuestions = function (defaults = {}) {

    let defaultsOptions = assignIn({}, {
        "enable": true,
    }, defaults);

    return [
        {
            type: "input",
            name: "name",
            message: "Bridge name",
            default: defaultsOptions["name"],
            validate(value) {
                let bridges = config.get("bridges").map(x => x.name);

                if (bridges.indexOf(value) !== -1 && value !== defaults.name) {
                    return "Bridge already exists";
                }

                if (value.match(/^[a-z0-9]{3,20}$/i)) {
                    return true;
                } else {
                    return "Bridge name can be letters, numbers and _ " +
                           "character, and a length from 3 to 20";
                }
            }
        },
        ...generateConfigQuestions(defaultsOptions, {
            ircNickNameRequired: true }),
        {
            type: "input",
            name: "irc:channel",
            message: "IRC channel",
            default: defaultsOptions["irc:channel"],
            validate(val) {
                if (val.match(IRC_CHAN_RE)) {
                    return true;
                } else {
                    return "Invalid IRC channel name";
                }
            }
        },
        {
            type: "input",
            name: "telegram:channel",
            message: "Telegram channel name or id",
            default: defaultsOptions["telegram:channel"],
            validate(val) {
                if (!val || val === "") {
                    return "You need to define a Telegram channel";
                }

                return true;
            }
        },
        {
            type: "confirm",
            name: "enable",
            message: "Bridge is enable?",
            default: defaultsOptions["enable"],
        }
    ];

}

const confirm = function(text) {

    return inquirer.prompt({
        type: "confirm",
        name: "res",
        message: text
    }).then((res) => {
        return res.res;
    });

}

const initConfig = function () {
    let direxists = checkConfigDir();

    if (direxists) {
        return Promise.resolve();
    }

    return confirm("App directory does not exists, you can to create it?")
        .then((res) => {
            if (res) {
                return createDataDir();
            } else {
                debug(`User cancel`);
                throw new CancelSignal();
            }
        });

}

const showMenu = function () {

    return inquirer.prompt({
        type: "list",
        name: "menu",
        message: "What do you want?",
        choices: options.map(o => o.text),
    }).then((res) => {
        return options.find(o => o.text === res.menu).key;
    });
    
}

const configGlobals = function() {

    return inquirer.prompt(generateConfigQuestions())
        .then((gconfig) => {
            for (let i in gconfig) {
                let v = gconfig[i];
                if (v === "") {
                    continue;
                }
                config.set(i, gconfig[i]);
            }

            debug("RR", config.toJSON());

            let configResult = renderConfigFile();

            process.stdout.write(configResult);
            process.stdout.write(`\n\n`);

            return confirm("Confirm save?")
        })
        .then((save) => {
            if (save) {
                return saveConfig();
            } else {
                throw new CancelSignal();
            }
        });

}

const addNewBridge = function () {
    let bconfig = etc();

    let questions = generateBridgeConfigQuestions();

    return inquirer.prompt(questions)
        .then((gconfig) => {
            for (let i in gconfig) {
                let v = gconfig[i];
                if (v === "") {
                    continue;
                }
                bconfig.set(i, v);
            }

            debug("RR", bconfig.toJSON());

            let configResult = renderConfigFile(bconfig.toJSON());

            process.stdout.write(configResult);
            process.stdout.write(`\n\n`);

            return confirm("Confirm save?");
        })
        .then((save) => {
            if (save) {
                return saveBridgeConfig(bconfig.toJSON());
            } else {
                throw new CancelSignal();
            }
        });
}

const editBridge = function () {
    let bridges = config.get("bridges")
        .map(x => x.name);
    let bconfig = etc();
    let originalName;

    return inquirer.prompt({
        type: "list",
        name: "bridge",
        choices: bridges,
        message: "Select bridge to edit",
    }).then((res) => {
        let bridgeConfig = getBridgeConfig(res.bridge);
        originalName = res.bridge;
        bconfig.add(bridgeConfig);

        let defaultsOptions = {
            "name": bconfig.get("name"),
            "enable": bconfig.get("enable"),
            "telegram:token": bconfig.get("telegram:token"),
            "telegram:channel": bconfig.get("telegram:channel"),
            "irc:server": bconfig.get("irc:server"),
            "irc:port": bconfig.get("irc:port"),
            "irc:nick": bconfig.get("irc:nick"),
            "irc:channel": bconfig.get("irc:channel"),
            "irc:secure": bconfig.get("irc:secure") === false ?
                                false :
                                bconfig.get("irc:secure"),
            "oneConnectionByUser": bconfig.get("oneConnectionByUser"),
            "ircScapeCharacter": bconfig.get("ircScapeCharacter"),
            "showJoinLeft": bconfig.get("showJoinLeft"),
            "prefix": bconfig.get("prefix"),
            "suffix": bconfig.get("suffix"),
        };

        return inquirer.prompt(generateBridgeConfigQuestions(defaultsOptions));
        
    }).then((gconfig) => {
        for (let i in gconfig) {
            let v = gconfig[i];
            if (v === "") {
                continue;
            }
            bconfig.set(i, v);
        }

        debug("RR", bconfig.toJSON());

        let configResult = renderConfigFile(bconfig.toJSON());

        process.stdout.write(configResult);
        process.stdout.write(`\n\n`);

        return confirm("Confirm save?");

    }).then((save) => {
        if (save) {
            deleteBridgeConfig(originalName);
            return saveBridgeConfig(bconfig.toJSON());
        } else {
            throw new CancelSignal();
        }
    });

}

const deleteBridges = function () {
    let bridges = config.get("bridges")
        .map(x => x.name);

    return inquirer.prompt({
        type: "checkbox",
        name: "bridges",
        choices: bridges,
        message: "Select bridges to delete",
        validate(val) {
            return !!val.length;
        }
    }).then((res) => {
        return inquirer.prompt({
            type: "confirm",
            name: "deleteall",
            default: false,
            message: "You are going to delete the next bridges " +
                     "configurations: " + res.bridges.join(", ") +
                     ". Are you sure?"
        }).then((cres) => {
            if (cres.deleteall) {
                res.bridges.map(b => deleteBridgeConfig(b));
            } else {
                throw new CancelSignal();
            }
        });
    })
}

export default function () {

    return initConfig()
        .then(() => {
            return showMenu();
        })
        .then((res) => {
            switch (res) {
                case "globals":
                    return configGlobals();
                case "createb":
                    return addNewBridge();
                case "editb":
                    return editBridge();
                case "deleteb":
                    return deleteBridges();
                case "exit":
                    return;
            }
        })
        .catch(CancelSignal, () => {
            process.exit(0);
        });

}
