
import Session from "../session";
import {loadPlugins} from "../plugins";
import config from "../config"; 
import debugLib from "debug";

const debug = debugLib('cli-start');

export default function (args) {

    if (process.getuid() === 0) {
        debug("Running as uid 0");
        if (process.getuid && process.setgid) {
            try {
                debug("Setting uid and gid");
                process.setgid(config.get('group'));
                process.setuid(config.get('user'));
            } catch (e) {
                debug("Error setting uid or gid:", e);
                throw new Error(`Failed to asssign uid or gid: ${e}`);
            }
        } else {
            debug("WARNING: setuid or setgid does not exists, running as 0");
        }
    }

    loadPlugins();

    let session = new Session({
        only: args.only || null
    });
    debug("Start session");
    session.start();
}
