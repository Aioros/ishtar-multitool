import db from "./db.js";
import utils from "./utils.js";
import { getPageInfo, askPageForInfo } from "./pageInfo.js";
import { stringTranslations, translateString } from "./stringTranslations.js";

export default {

    async isDBReady() {
        await db.getDB();
    },

	async pageInfo(args) {
		var tab = args.tab;
        var pageInfo = await getPageInfo(tab);
        return pageInfo;
    },

    async translatePage(args) {
    	var tab = args.tab;

        var pageInfo = await getPageInfo(tab);

        if (args.update) {
            chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: injections.updatePageContent,
                args: [pageInfo, args.language, stringTranslations]
            });
        }

        return pageInfo;
    },

    async installedLanguages(args) {
    	let idb = await db.getDB();
        let cursor = await idb.transaction("pages").store.index("type").openCursor(IDBKeyRange.only("entry"));

        let installedLanguages = Object.keys(cursor.value.title);
        return installedLanguages;
    },

    async languageModification(args) {
    	let idb = await db.getDB();
        if (args.action == "add")
            await db.addLanguage(idb, args.language);
        else
            await db.deleteLanguage(idb, args.language);
    },

    async requestElementsTranslation(args) {
    	let language = args.language;
        let promises = [];
        args.elements.forEach((element) => {
            if (["entry", "card", "book", "season"].includes(element.type)) {
                // These are pages in our database, we find them and update the URL too
                promises.push(
                    db.getStoredPage({type: element.type, title: element.title, url: utils.normalizeURL(element.url)})
                        .then((dbPage) => {
                        	if (!dbPage) throw {error: "Error retrieving page", query: element};
                            if (dbPage.type != "season") {
                                // we don't store the url for seasons
                                return db.setStoredPage(Object.assign(dbPage, {url: utils.normalizeURL(element.url)}));
                            } else {
                                return dbPage;
                            }
                        })
                        .catch((ex) => {
                            // We didn't find the page, try translating as string
                            utils.debugLog(ex);
                            return {
                                type: element.type,
                                title: {
                                    en: element.title,
                                    [language]: translateString(element.title, language)
                                }
                            }
                        })
                );
            } else {
                // We try to find a string translation
                promises.push({
                    type: "string",
                    title: {
                        en: element.title,
                        [language]: translateString(element.title, language)
                    }
                });
            }
        });
        return await Promise.all(promises);
    }

}