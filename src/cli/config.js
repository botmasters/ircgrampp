
import inquirer from "inquirer";
import debugLib from "debug";
import {
    checkConfigDir,
    createDataDir,
    renderConfigFile,
    saveConfig,
    config} from "../config";

var Promise = require("bluebird");

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

    let questions = [
        {
            type: "input",
            name: "telegram:token",
            message: "Define global telegram token",
            default: config.get("telegram:token") || undefined,
        },
        {
            type: "input",
            name: "irc:server",
            message: "Default IRC server ip or nameserver?",
            default: config.get("irc:server") || undefined,
        },
        {
            type: "input",
            name: "irc:port",
            message: "Default IRC server port?",
            default: config.get("irc:port") || 6697,
            validate (value) {
                value = parseInt(value);
                return value > 0 && value < 65535;
            }
        },
        {
            type: "confirm",
            name: "irc:secure",
            message: "IRC server uses SSL?",
            default: true,
        },
        {
            type: "confirm",
            name: "oneConnectionByUser",
            message: "Do you use one new IRC connection by telgram user?",
            default: config.get("oneConnectionByUser") || false,
        },
        {
            type: "input",
            name: "prefix",
            message: "Default prefix for IRC users?",
            default: config.get("prefix") || "telegram_",
            validate(value) {
                return !!value.match(/^[a-z0-9_]{0,10}$/i);
            }
        },
        {
            type: "input",
            name: "suflix",
            message: "Default sufix for IRC users?",
            default: config.get("suflix") || "",
            validate(value) {
                return !!value.match(/^[a-z0-9_]{0,10}$/i);
            }
        }
    ];

    return inquirer.prompt(questions)
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

export default function () {

    return initConfig()
        .then(() => {
            return showMenu();
        })
        .then((res) => {
            switch (res) {
                case "globals":
                    return configGlobals();
                case "exit":
                    return;
            }
        })
        .catch(CancelSignal, () => {
            process.exit(0);
        });

}
