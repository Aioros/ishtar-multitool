import config from "./config.js";

 class BungieAPIError extends Error {
    constructor(message) {
        super(message);
        this.name = "BungieAPIError";
    }
}

export default {

    BungieAPIError,

    debugLog() {
        if (config.debug) console.log(...arguments);
    },

    normalizeURL(url) {
        try {
            return (new URL(url)).pathname;
        } catch(ex) {
            return "";
        }
    },

    slugify(text) {
        return text
            .toString()
            .normalize('NFKD')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-');
    },

    getURLFromPageInfo(...info) {
        var type, title;
        if (typeof info[0] === "object") {
            // We received a pageInfo object
            ({type, title: {en: title}} = info);
        } else {
            // We received type and title
            [type, title] = info;
        }

        var path = "";
        if (type == "entry") {
            path = "/entries/";
        } else if (type == "card") {
            path = "/cards/";
        } else if (type == "book") {
            path = "/categories/" + (!["The Maraid", "Books of Sorrow"].includes(title) ? "book-" : "");
        } else {
            return "";
        }
        var slug = this.slugify(title);
        var url = path + slug;
        return url;
    }

}