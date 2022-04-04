import { openDB, deleteDB/*, wrap, unwrap*/ } from "./idb7.js";
import utils from "./utils.js";
import d1BooksInfo from "./d1/D1BooksInfo.js";

var dbInstance;

async function bungieFetch(url) {
    try {
        return fetch("https://www.bungie.net" + url);
    } catch (ex) {
        throw new utils.BungieAPIError("Unable to reach Bungie API");
    }
}

async function getPageDataFromAPI(language) {
	var closestD1Language = language.split("-")[0];

	var manifest = await bungieFetch("/Platform/Destiny2/Manifest/").then(r => r.json());
    var loreDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinyLoreDefinition;
	var grimoireUrl = chrome.runtime.getURL(`d1/DestinyGrimoireDefinition.${closestD1Language}.json`);
    var cardsUrl = chrome.runtime.getURL(`d1/DestinyGrimoireCardDefinition.${closestD1Language}.json`);
    var presentationNodeDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinyPresentationNodeDefinition;
    var recordDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinyRecordDefinition;
    var seasonDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinySeasonDefinition;

    var promises = [
        bungieFetch(loreDefinitionUrl).then(r => r.json()),
        fetch(cardsUrl).then(r => r.json())
        	.catch(e => {
        		utils.debugLog(`Language ${language} not available for D1 grimoire cards`);
        		return [];
        	}),
        bungieFetch(presentationNodeDefinitionUrl).then(r => r.json()),
        bungieFetch(seasonDefinitionUrl + "?cb=" + Math.round(new Date().getTime() / 1000)).then(r => r.json()),
    	bungieFetch(recordDefinitionUrl).then(r => r.json()),
    	fetch(grimoireUrl).then(r => r.json())
    		.catch(e => {
        		utils.debugLog(`Language ${language} not available for D1 grimoire`);
        		var grimoireUrl = chrome.runtime.getURL(`d1/DestinyGrimoireDefinition.en.json`);
        		return fetch(grimoireUrl).then(r => r.json());
        	}),
        manifest.Response.version
    ];

    return await Promise.all(promises);

}

async function buildD1LoreTree(language, grimoireInfo, cardInfo) {
	var d1Tree = {name: "Destiny", children: []};
    for (let theme of grimoireInfo.themeCollection) {
    	let newTheme = {
    		name: theme.themeName,
    		children: []
    	};
    	for (let page of theme.pageCollection) {
    		let newPage = {
    			name: page.pageName,
    			children: []
    		};
    		for (let card of page.cardBriefs) {
    			var cardObject = cardInfo.find(c => c.type == "card" && c.hash == card.cardId);
    			newPage.children.push({name: cardObject.title[language], url: cardObject.url});
    		}
    		newTheme.children.push(newPage);
    	}
    	d1Tree.children.push(newTheme);
    }
    return d1Tree;
}

async function buildD2LoreTree(language, recordInfo, presentationNodesInfo, entriesInfo) {

    var d2Tree = {name: "Destiny 2", children: []};
    var bookHashes = [];
    var treeNode = d2Tree;

    // var mainLoreNode = Object.values(presentationNodesInfo).find(
    //     n => n?.displayProperties?.name == "Lore" && n?.children?.presentationNodes.length > 0 && !n.objectiveHash
    // );
    var mainLoreNode = presentationNodesInfo[4077680549];
    function findLoreBooks(rootNode, treeNode) {
    	if (rootNode?.children?.records.length > 0) {
            rootNode.childEntries = [];
            rootNode.children.records.forEach((record) => {
            	if (recordInfo[record.recordHash].loreHash) {
            		var entryObject = entriesInfo.find(e => e.type == "entry" && e.hash == recordInfo[record.recordHash].loreHash);
                    rootNode.childEntries.push(recordInfo[record.recordHash].loreHash);
                    treeNode.children.push({name: entryObject.title[language], url: entryObject.url});
				}
            });
            treeNode.url = utils.getURLFromPageInfo("book", treeNode.name);
            bookHashes.push(rootNode.hash);
        } else if (rootNode?.children?.presentationNodes.length > 0) {
            for (let childNode of rootNode.children.presentationNodes) {
            	let actualChildNode = presentationNodesInfo[childNode.presentationNodeHash];
            	let childTreeNode = {name: actualChildNode.displayProperties.name, children: []};
            	treeNode.children.push(childTreeNode);
                findLoreBooks(actualChildNode, childTreeNode);
            }
        }
    }
    findLoreBooks(mainLoreNode, treeNode);

    return {d2Tree, bookHashes};
}

async function prepareDataForDB() {

	var [enEntries, enCards, enPresentationNodes, enSeasons, enRecords, enGrimoire, manifestVersion] = await getPageDataFromAPI("en");

    var entryPages = Object.values(enEntries).filter((entry) => entry.displayProperties.name).map((entry) => ({
        hash: entry.hash,
        type: "entry",
        title: {en: entry.displayProperties.name},
        subtitle: {en: entry.subtitle},
        content: {en: entry.displayProperties.description || ""},
        url: utils.getURLFromPageInfo("entry", entry.displayProperties.name, entry)
    })).concat(enCards.map((card) => {
        var cardData = JSON.parse(card.json);
        return {
            hash: cardData.cardId,
            type: "card",
            title: {en: cardData.cardName},
            subtitle: {en: cardData.cardIntro},
            content: {en: cardData.cardDescription || ""},
            url: utils.getURLFromPageInfo("card", cardData.cardName)
        }
    }));

    var {d2Tree, bookHashes} = await buildD2LoreTree("en", enRecords, enPresentationNodes, entryPages);
    var bookPages = bookHashes.map((hash) => {
    	var pNode = enPresentationNodes[hash];
    	return {
    		hash: pNode.hash,
            type: "book",
            title: {en: pNode.displayProperties.name},
            //subtitle: {en: ""},
            //content: {en: ""},
            url: utils.getURLFromPageInfo("book", pNode.displayProperties.name),
            entries: pNode.childEntries
    	}
    });
    bookPages = [...bookPages, ...d1BooksInfo];

    var seasonPages = Object.values(enSeasons).map((season) => ({
        hash: season.hash,
        type: "season",
        title: {en: season.displayProperties.name},
        url: ""
    }));

    var allPages = [...entryPages, ...bookPages, ...seasonPages];

    var d1Tree = await buildD1LoreTree("en", enGrimoire, entryPages);

    var loreTree = [d1Tree, d2Tree];
    await Promise.all([
    	chrome.storage.local.set({loreTree: {en: loreTree}}),
    	chrome.storage.local.set({d2ManifestVersion: manifestVersion})
    ]);

    return allPages;

}

async function getNewDB() {
	const db = await openDB("ishtar", 1, {

        upgrade(db, oldVersion, newVersion, transaction) {

            const store = db.createObjectStore("pages", {
                keyPath: "hash"
            });
            store.createIndex("title", "title.en");
            store.createIndex("url", "url");
            store.createIndex("type", "type");

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

	var allPages = await prepareDataForDB();
    const tx = db.transaction("pages", "readwrite");
    var addPromises = allPages.map((page) => tx.store.add(page));

    var preferredLanguage = await chrome.storage.sync.get("language");
    if (preferredLanguage.language && preferredLanguage.language != "en") {
        await addLanguage(db, preferredLanguage.language);
    }

    await Promise.all([...addPromises, tx.done]);

	utils.debugLog("DB ready");
	return db;
}

async function addLanguage(db, language) {

    var [entries, cards, presentationNodes, seasons, records, grimoireInfo] = await getPageDataFromAPI(language);

    var oldPages = await db.getAll("pages");
    var newPages = oldPages.map((oldPage) => {
        var newPage = Object.assign({}, oldPage);
        if (oldPage.type == "entry") {
            var entry = entries[oldPage.hash];
            newPage.title[language] = entry.displayProperties.name;
            newPage.subtitle[language] = entry.subtitle;
            newPage.content[language] = entry.displayProperties.description || "";
        } else if (oldPage.type == "card") {
            var card = cards.find((card) => card.id == oldPage.hash);
            if (card) {
                card = JSON.parse(card.json);
                newPage.title[language] = card.cardName;
                newPage.subtitle[language] = card.cardIntro;
                newPage.content[language] = card.cardDescription || "";
            }
        } else if (oldPage.type == "book") {
            var book = presentationNodes[oldPage.hash];
            if (book) {
            	// The two D1 books don't need this anyway
            	newPage.title[language] = book.displayProperties.name;
            }
        } else if (oldPage.type == "season") {
            var season = seasons[oldPage.hash];
            newPage.title[language] = season.displayProperties.name;
        }
        return newPage;
    });

    const tx = db.transaction("pages", "readwrite");
    var putPromises = newPages.map((p) => tx.store.put(p));
    await Promise.all([...putPromises, tx.done]);

    var d1Tree = await buildD1LoreTree(language, grimoireInfo, newPages);
    var {d2Tree} = await buildD2LoreTree(language, records, presentationNodes, newPages);
    var loreTree = [d1Tree, d2Tree];
    var storedTree = await chrome.storage.local.get("loreTree");
    storedTree.loreTree[language] = loreTree;
    await chrome.storage.local.set({loreTree: storedTree.loreTree});
}

async function deleteLanguage(db, language) {
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
    var storedTree = await chrome.storage.local.get("loreTree");
    delete storedTree.loreTree[language];
    await chrome.storage.local.set({loreTree: storedTree.loreTree});
}

export default {
	async setupDB() {
	    await deleteDB("ishtar", {
	        blocked() {
	            utils.debugLog("Blocked delete");
	        }
	    });

	    await this.getDB();
	},

	async getDB() {

        var lastDBAccess = (await chrome.storage.local.get("lastDBAccess"))?.lastDBAccess;
        if (lastDBAccess && (Date.now() - lastDBAccess > 3600000)) { // 1 hour
            try {
                var installedManifestVersion = await chrome.storage.local.get("d2ManifestVersion");
                var currentD2Manifest = await bungieFetch("/Platform/Destiny2/Manifest/").then(r => r.json());
                if (installedManifestVersion.d2ManifestVersion != currentD2Manifest.Response.version) {
                    utils.debugLog(`Rebuilding DB (${installedManifestVersion.d2ManifestVersion} to ${currentD2Manifest.Response.version})`);
                    dbInstance = null; // Invalidate the current instance
                }
            } catch (ex) {
                if (ex instanceof utils.BungieAPIError) {
                    utils.debugLog("Unable to check manifest version");
                }
            }
        }
        await chrome.storage.local.set({lastDBAccess: Date.now()});

        var validDB = !!dbInstance;
        try {
            await dbInstance;
        } catch (ex) {
            validDB = false;
        }
        
		if (validDB) {
			return dbInstance;
		}

        dbInstance = getNewDB();

		return dbInstance;
	},

	addLanguage,

	deleteLanguage,

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
	},

    async searchPageContent(query, language) {
        var results = [];
        var idb = await this.getDB();
        var cursor = await idb.transaction("pages").store.openCursor();
        while (cursor) {
            if (cursor.value.content?.[language]?.toLowerCase().includes(query.toLowerCase())) {
                results.push(cursor.value);
            }
            cursor = await cursor.continue();
        }
        return results;
    }

}