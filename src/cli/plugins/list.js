
import {listPlugins} from '../../plugins';
import createTable from '../table';

export default function() {
    let table = createTable([
        'Name', 'Author', 'Description'
    ], listPlugins().map(({name, author, description}) => {
        return [name, author ? author.name || "" : "", description];
    }));

    process.stdout.write(table.toString());
    process.stdout.write("\n");
    process.exit(0);
}
