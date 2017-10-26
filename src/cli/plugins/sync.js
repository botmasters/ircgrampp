//import config from "../../config"; 
import debugLib from "debug";

const debug = debugLib('cli.plugins.sync');

export default function (args) {
    debug(args);
    process.stdout.write(`Sync`);
    process.exit(0);
}
