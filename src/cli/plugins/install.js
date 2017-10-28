
import {installPlugin} from '../../plugins';
import debugLib from 'debug';

const debug = debugLib('cli.plugins.install');

export default function(query, args) {

    if (typeof query !== "string") {
        process.stderr.write(`Inválid name`);
        process.exit(1);
    }

    debug('Installing', query);
    installPlugin(query, args.enable || false)
        .then(() => {
            process.stdout.write(`Success\n`);
            process.exit(0);
        })
        .catch((err) => {
            process.stderr.write(`${err.message}\n`);
            process.exit(2);
        });
}
