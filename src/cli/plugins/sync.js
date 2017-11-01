//import config from "../../config"; 
import debugLib from "debug";
import {syncPlugins} from '../../plugins';

const debug = debugLib('cli.plugins.sync');

export default function () {
    debug('Sync');
    process.stdout.write(`Sync plugins...\n`);

    syncPlugins()
        .then((cant) => {
            process.stdout.write(`${cant} synchorinized`);
        })
        .catch((e) => {
            throw e;
        });
}
