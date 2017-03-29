
import path from "path";
import {userInfo} from "os"; 
// import glob from "glob";
import etc from "etc";
import yml from "etc-yaml";
import {values} from "lodash";

const user = userInfo();

const homedir = user.homedir;
const appdir = path.join(homedir, ".ircgrampp");
const confpath = path.join(appdir, "config.yml");
const bridgespath = path.join(appdir, "bridges");

export const bridges = etc()
    .use(yml)
    .folder(bridgespath);

export default etc()
    .use(yml)
    .file(confpath)
    .add({
        bridges: values(bridges.toJSON())
    })
    .add({
        db: path.join(appdir, "db.dat"),
        daemon: false,
    });
/*
const bridgesFiles = glob.sync(bridgespath);
    bridgesFiles.forEach((file) => {
    
    })
    */
