
import program from "commander";
import packageInfo from "../../package.json";
import startProgram from "./start";

/*process.on("uncaughtException", (err) => {
    process.stderr.write(`${err}\n`);
    process.exit(12);
});*/

program
    .version(packageInfo.version)
    .description(packageInfo.description)
    .option("--debug [modules]", "Debug mode");

program
    .command("start")
    .alias("s")
    .description("Start bridges")
    .option("-d, --daemon", "Start in background")
    .option("--only <bridge>", "Start only the specific bridge")
    .action(startProgram);

program
    .command('*')
    .action(() => {
        process.stderr.write(`The command ${program.args[0]}, is not a valid` +
                             ` command, see ${program._name} --help\n`);
        process.exit(1);
    });

const mainCLI = function (args) {
    program.parse(args);

    if (program.debug) {
        process.env.DEBUG=program.debug;
    }

    if (!program.args.length) {
        program.help();
    }

};

export default mainCLI;
