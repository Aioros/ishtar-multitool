import db from "./db.js";
import utils from "./utils.js";
import injections from "./injectedFunctions.js";

export async function askPageForInfo(tab) {

    var results = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: injections.retrievePageInfo
    });
    
    var pageInfo = results[0].result;

    return pageInfo;

}

export async function getPageInfo(tab) {

    var pageInfo = null;

    var normalizedUrl = utils.normalizeURL(tab.url);

    let [type, title, currentLanguage] = await askPageForInfo(tab);
    utils.debugLog(type, title, currentLanguage);

    // check if we have the page info in storage (find by url)
    pageInfo = await db.getStoredPage({url: normalizedUrl});

    if (!pageInfo) {
        if (type != "other") {
            // try to find it by title
            pageInfo = await db.getStoredPage({title});
            pageInfo.url = normalizedUrl;
            await db.setStoredPage(pageInfo);
        }
    }

    if (!pageInfo) {
        pageInfo = {type, title: {[currentLanguage]: title}, currentLanguage};
    }

    return pageInfo;
}
