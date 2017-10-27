
import createTable from '../table';
import {searchPlugin} from '../../plugins';
import debugLib from 'debug';

const debug = debugLib('cli.plugins.search');

export default function(pattern, args) {
    debug("Search");
    let max = args.max;

    if (typeof pattern !== "string") {
        process.stderr.write(`Invalid pattern\n`);
        process.exit(1);
    }

    let plugs = searchPlugin(pattern, max);
    
    if (!plugs.length) {
        process.stdout.write(`No results\n`);
        process.exit(0);
    }

    const columns = process.stdout.columns;
    let maxDescriptionLen = 0;

    let maxnamelength = plugs.reduce((max, {name}) => {
        if (name.length > max) {
            return name.length;
        } else {
            return max;
        }
    }, 0);

    let maxauthorlength = plugs.reduce((max, {author}) => {
        author = author || {name: ""};
        let {name} = author;

        if (name.length > max) {
            return name.length;
        } else {
            return max;
        }
    }, 0);

    if (columns) {
        maxDescriptionLen = columns - maxnamelength - maxauthorlength - 6;
    }

    let table = createTable([
        'Name', 'Author', 'Description',
    ]);

    table.push(...plugs.map(({name, author, description}) => {
        if (maxDescriptionLen && description.length > maxDescriptionLen) {
            description = description.substr(0, maxDescriptionLen - 3) + '...';
        }

        author = author || {name: 'Unknow'};

        return [name, author.name, description];
    }));

    process.stdout.write(table.toString());
    process.stdout.write("\n");
    process.exit(0);

}
