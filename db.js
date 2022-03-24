import { openDB, deleteDB/*, wrap, unwrap*/ } from "./idb7.js";
import utils from "./utils.js";

export default {
	async setupDB() {
	    await deleteDB("ishtar", {
	        blocked() {
	            utils.debugLog("Blocked delete");
	        }
	    });

	    await this.getDB();
	},

	async getPageDataFromAPI(language, withRecords = true) {
		var closestD1Language = language.split("-")[0];

		var manifest = await fetch("https://www.bungie.net/Platform/Destiny2/Manifest/").then(r => r.json());
	    var loreDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinyLoreDefinition;
	    var cardsUrl = chrome.runtime.getURL(`d1/DestinyGrimoireCardDefinition.${closestD1Language}.json`);
	    var presentationNodeDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinyPresentationNodeDefinition;
	    var recordDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinyRecordDefinition;
	    var seasonDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinySeasonDefinition;

	    var promises = [
	        fetch("https://www.bungie.net" + loreDefinitionUrl).then(r => r.json()),
	        fetch(cardsUrl).then(r => r.json()).catch(e => {utils.debugLog(`Language ${language} not available in D1`); return [];}),
	        fetch("https://www.bungie.net" + presentationNodeDefinitionUrl).then(r => r.json()),
	        fetch("https://www.bungie.net" + seasonDefinitionUrl).then(r => r.json())
	    ];
	    if (withRecords) {
	    	promises.push(fetch("https://www.bungie.net" + recordDefinitionUrl).then(r => r.json()));
	    } else {
	    	promises.push("not needed");
	    }

	    return await Promise.all(promises);

	},

	// Returns a Promise
	getDB() {
		var self = this;

	    return openDB("ishtar", 1, {

	        async upgrade(db, oldVersion, newVersion, transaction) {

	            const store = db.createObjectStore("pages", {
	                keyPath: "hash"
	            });
	            store.createIndex("title", "title.en");
	            store.createIndex("url", "url");
	            store.createIndex("type", "type");

	            //await transaction.done;

	            var [enEntries, enCards, enPresentationNodes, enSeasons, enRecords] = await self.getPageDataFromAPI("en");

	            var entryPages = Object.values(enEntries).map((entry) => ({
	                hash: entry.hash,
	                type: "entry",
	                title: {en: entry.displayProperties.name},
	                subtitle: {en: entry.subtitle},
	                content: {en: entry.displayProperties.description},
	                url: ""
	            })).concat(enCards.map((card) => {
	                var cardData = JSON.parse(card.json);
	                return {
	                    hash: cardData.cardId,
	                    type: "card",
	                    title: {en: cardData.cardName},
	                    subtitle: {en: cardData.cardIntro},
	                    content: {en: cardData.cardDescription},
	                    url: ""
	                }
	            }));
	            
	            var mainLoreNode = Object.values(enPresentationNodes).find(
	                n => n?.displayProperties?.name == "Lore" && n?.children?.presentationNodes.length > 0 && !n.objectiveHash
	            );
	            var bookPages = [];
	            function findLoreBooks(rootNode) {
	                if (rootNode?.children?.records.length > 0) {
	                    rootNode.childEntries = [];
	                    rootNode.children.records.forEach((record) => {
	                        rootNode.childEntries.push(enRecords[record.recordHash].loreHash);
	                    });
	                    bookPages.push({
	                        hash: rootNode.hash,
	                        type: "book",
	                        title: {en: rootNode.displayProperties.name},
	                        //subtitle: {en: ""},
	                        //content: {en: ""},
	                        url: "",
	                        entries: rootNode.childEntries
	                    });
	                } else if (rootNode?.children?.presentationNodes.length > 0) {
	                    for (let childNode of rootNode.children.presentationNodes) {
	                        findLoreBooks(enPresentationNodes[childNode.presentationNodeHash]);
	                    }
	                }
	            }
	            findLoreBooks(mainLoreNode);

	            var seasonPages = Object.values(enSeasons).map((season) => ({
	                hash: season.hash,
	                type: "season",
	                title: {en: season.displayProperties.name},
	                url: ""
	            }));

	            const tx = db.transaction("pages", "readwrite");
	            var addPromises = [...entryPages, ...bookPages, ...seasonPages].map((page) => tx.store.add(page));
	            await Promise.all([...addPromises, tx.done]);

	            var preferredLanguage = await chrome.storage.sync.get("language");
	            if (preferredLanguage.language && preferredLanguage.language != "en") {
	                await self.addLanguage(db, preferredLanguage.language);
	            }
	            utils.debugLog("DB ready");

	        },
	        blocked() {
	            utils.debugLog("Blocked");
	        },
	        blocking() {
	            db.close();
	            utils.debugLog("Blocking");
	        },
	        terminated() {
	            utils.debugLog("Terminated");
	        }

	    });
	},

	async addLanguage(db, language) {

	    var [entries, cards, presentationNodes, seasons] = await this.getPageDataFromAPI(language, false);

	    var oldPages = await db.getAll("pages");
	    var newPages = oldPages.map((oldPage) => {
	        var newPage = Object.assign({}, oldPage);
	        if (oldPage.type == "entry") {
	            var entry = entries[oldPage.hash];
	            newPage.title[language] = entry.displayProperties.name;
	            newPage.subtitle[language] = entry.subtitle;
	            newPage.content[language] = entry.displayProperties.description;
	        } else if (oldPage.type == "card") {
	            var card = cards.find((card) => card.id == oldPage.hash);
	            if (card) {
	                card = JSON.parse(card.json);
	                newPage.title[language] = card.cardName;
	                newPage.subtitle[language] = card.cardIntro;
	                newPage.content[language] = card.cardDescription;
	            }
	        } else if (oldPage.type == "book") {
	            var book = presentationNodes[oldPage.hash];
	            newPage.title[language] = book.displayProperties.name;
	        } else if (oldPage.type == "season") {
	            var season = seasons[oldPage.hash];
	            newPage.title[language] = season.displayProperties.name;
	        }
	        return newPage;
	    });

	    const tx = db.transaction("pages", "readwrite");
	    var putPromises = newPages.map((p) => tx.store.put(p));
	    await Promise.all([...putPromises, tx.done]);
	},

	async deleteLanguage(db, language) {
	    var oldPages = await db.getAll("pages");
	    var newPages = oldPages.map((oldPage) => {
	        var newPage = Object.assign({}, oldPage);
	        delete newPage.title?.[language];
	        delete newPage.subtitle?.[language];
	        delete newPage.content?.[language];
	        return newPage;
	    });
	    const tx = db.transaction("pages", "readwrite");
	    var putPromises = newPages.map((p) => tx.store.put(p));
	    await Promise.all([...putPromises, tx.done]);
	},

	async setStoredPage(page) {
	    var db = await this.getDB();
	    await db.put("pages", page);
	    return page;
	},

	async getStoredPage(queryObject) {
	    var idb = await this.getDB();
	    if (queryObject.hash) {
	        return (await idb.get("pages", queryObject.hash) || null);
	    } else if (queryObject.url) {
	        return (await idb.getFromIndex("pages", "url", queryObject.url) || null);
	    } else if (queryObject.title) {

	        var cursor = await idb.transaction("pages").store.index("title").openCursor(IDBKeyRange.only(queryObject.title));
	        while (cursor) {
	            if (!queryObject.type || cursor.value.type == queryObject.type) {
	                return cursor.value;
	            }
	            cursor = await cursor.continue();
	        }
	    }

	    return null;
	}
}