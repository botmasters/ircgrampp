
import Storage from './storage';
import debugLib from 'debug';

const debug = {
    info: debugLib('channels-info')
};

const DB_NAME = 'Channels';

let instance;

export default class ChannelsInfo extends Storage {

    constructor() {
        super(DB_NAME);
    }

    remove(channel, sync = true) {
        let channelId = typeof channel === "number" ? channel : channel.id;
        debug.info(`Remove channel info for ${channelId}`);

        return this.remove((x) => x.id === channelId, sync);
    }

    find(cond) {
        debug.info(`Find channel ${cond}`);

        if (typeof cond === "number") {
            return super.find(x => x.id === cond);
        } else {
            return super.find(x => x.title === cond);
        }
    }

    save(channel, sync = true) {
        debug.info(`Save channel info for ${channel.id}`);

        var actual = this.find(x => x.id === channel.id);

        if (actual) {
            debug.info(`This exists, remove old`);
            this.remove(channel, false);
        }

        this.push(channel);

        if (sync) {
            this.sync();
        }
    }

    static getInstance() {
        if (!instance) {
            instance = new ChannelsInfo();
        }

        return instance;
    }

}
