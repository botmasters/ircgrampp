import program from "commander";
import packageInfo from "../../../package.json";
import syncProgram from "./sync";
import debugLib from "debug";

const debug = debugLib('cli.plugins')

process.on("uncaughtException", (err) => {
    debug("Unknow error", err);
    process.stderr.write(`${err}\n`);
    process.exit(12);
});

program
    .version(packageInfo.version)
    .description("Manage ircgrampp plugins")
    .option("--debug [modules]", "Debug mode");

program
    .command("sync")
    .alias("s")
    .description("Sync available plugins")
    .action(syncProgram);

program
    .command("serch")
    .description("Search plugins")
    .usage("[options] {keyword}")
    .option("--title-only [modules]", "Debug mode")
    .action(syncProgram);

program
    .command("install")
    .description("Install new plugin")
    .usage("[options] {name}[@version]")
    .option("--enable", "Enable plugin")
    .action(syncProgram);

program
    .command("enable")
    .description("Enable plugin")
    .usage("{name}")
    .action(syncProgram); 

program
    .command('*')
    .action((cmd) => {
        process.stderr.write(`The command ${cmd}, is not a valid` +
                             ` command, see ${program._name} --help\n`);
        process.exit(1);
    });
    
const mainCLI = function (args) {
    debug('Run');
    program.parse(args);

    if (program.debug) {
        process.env.DEBUG=program.debug;
    }

    if (!program.args.length) {
        program.help();
    }
};

export default mainCLI;
