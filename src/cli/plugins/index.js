import program from "commander";
import packageInfo from "../../../package.json";
import syncProgram from "./sync";
import listProgram from "./list";
import searchProgram from "./search";
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
    .description("Sync plugins database")
    .action(syncProgram);

program
    .command("list")
    .description("List available plugins")
    .action(listProgram);

program
    .command("search")
    .description("Search plugins")
    .usage("[options] {keyword}")
    .option('--max <number>', 'Max results [100]', 100)
    .action(searchProgram);

program
    .command("install")
    .description("Install new plugin")
    .usage("[options] {name}[@version]")
    .option("--enable", "Enable plugin")
    .action(searchProgram);

program
    .command("enable")
    .description("Enable plugin")
    .usage("{name}")
    .action(searchProgram); 

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
