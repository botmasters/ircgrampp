
import Session from "../session";

export default function (args) {
    let session = new Session({
        only: args.only || null
    });
    session.start();
}
