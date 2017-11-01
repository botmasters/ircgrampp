
import Storage from '../storage';
import debugLib from 'debug';

const debug = debugLib('plugins.db');

const DB_NAME = "Plugins";
let instance;
 
export default class PackageDb extends Storage {
    constructor() {
        super(DB_NAME);
    }

    push(item, sync = true) {
        if (Array.isArray(item)) {
            debug('Push an array of items of ', item.length);
            item.forEach((i) => this.push(i, false));
        } else {
            super.push(item, false); 
        }

        if (sync) {
            this.sync();
        }
    }

    static getInstance() {
        if (!instance) {
            debug('Creating instance');
            instance = new PackageDb();
        }

        return instance;
    }
}
