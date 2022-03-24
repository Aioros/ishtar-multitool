import config from "./config.js";

export default {

    debugLog() {
        if (config.debug) console.log(...arguments);
    },

    normalizeURL(url) {
        try {
            return (new URL(url)).pathname;
        } catch(ex) {
            return "";
        }
    }

}