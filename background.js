import { openDB, deleteDB, wrap, unwrap } from "./idb7.js";
import { stringTranslations, translateString } from "./stringTranslations.js";

var languages = [/*"en", "it", "fr"*/];

var debug = true;

function debugLog() {
    if (debug) console.log(...arguments);
}

function normalizeURL(url) {
    try {
        return (new URL(url)).pathname;
    } catch(ex) {
        return "";
    }
}

// Returns a Promise
function getDB() {
    return openDB("ishtar", 1, {

        async upgrade(db, oldVersion, newVersion, transaction) {

            const store = db.createObjectStore("pages", {
                keyPath: "hash"
            });
            store.createIndex("title", "title.en");
            store.createIndex("url", "url");
            store.createIndex("type", "type");

            //await transaction.done;

            var manifest = await fetch("https://www.bungie.net/Platform/Destiny2/Manifest/").then(r => r.json());
            var enLoreDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths.en.DestinyLoreDefinition;
            var enCardsUrl = chrome.runtime.getURL("d1/DestinyGrimoireCardDefinition.en.json");
            var enPresentationNodeDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths.en.DestinyPresentationNodeDefinition;
            var enRecordDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths.en.DestinyRecordDefinition;
            var enSeasonDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths.en.DestinySeasonDefinition;

            var [enEntries, enCards, enPresentationNodes, enRecords, enSeasons] = await Promise.all([
                fetch("https://www.bungie.net" + enLoreDefinitionUrl).then(r => r.json()),
                fetch(enCardsUrl).then(r => r.json()),
                fetch("https://www.bungie.net" + enPresentationNodeDefinitionUrl).then(r => r.json()),
                fetch("https://www.bungie.net" + enRecordDefinitionUrl).then(r => r.json()),
                fetch("https://www.bungie.net" + enSeasonDefinitionUrl + "?cachebuster=" + Math.round(new Date().getTime())).then(r => r.json())
            ]);

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

            for (let additionalLanguage of languages.filter((l) => (l != "en"))) {
                await addLanguage(db, additionalLanguage);
            }
            debugLog("DB ready");

        },
        blocked() {
            debugLog("Blocked");
        },
        blocking() {
            db.close();
            debugLog("Blocking");
        },
        terminated() {
            debugLog("Terminated");
        }

    });
}

async function setStoredPage(page) {
    var db = await getDB();
    await db.put("pages", page);
    return page;
}

async function getStoredPage(queryObject) {
    var idb = await getDB();
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

async function askPageForInfo(tab) {
    
    var results = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: retrievePageInfo
    });
    
    var pageInfo = results[0].result;

    return pageInfo;

}

// Executed in page
function retrievePageInfo() {
    var pageType, title;
    if (document.URL.includes("/entries/")) {
        pageType = "entry";
        title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — "));
    } else if (document.URL.includes("/cards/")) {
        pageType = "card";
        title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — "));
    } else if (document.URL.includes("/categories/book")) {
        pageType = "book";
        title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — ")).replace("Book: ", "");
    } else if (document.URL.includes("/categories/")) {
        pageType = "other";//"category"; NOT SURE WHAT TO DO HERE
        title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — ")).replace("Book: ", "");
    } else if (document.URL.includes("/books")) {
        pageType = "other";//"book";
        title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — ")).replace("Book: ", "");
    } else {
        pageType = "other";
        title = document.title.substring(0, document.title.indexOf(" — "));
    }
    var currentLanguage = document.body.dataset.currentLanguage || "en";
    return [pageType, title, currentLanguage];
}

// Executed in page
function updatePageContent(pageInfo, language, stringTranslations) {

    var spinner = document.createElement("div");
    spinner.style = `background-image: url(${chrome.runtime.getURL("img/spinner.gif")});
        background-color: white;
        background-repeat: no-repeat;
        background-position: center;
        position: absolute;
        top: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        opacity: 70%;`;
    document.body.appendChild(spinner);

    function replaceInnerText(rootNode, oldText, newText) {
        if (rootNode.nodeName == "#text") {
            rootNode.nodeValue = rootNode.nodeValue.trim().replace(oldText.trim(), newText);
            return;
        }
        for (let child of rootNode.childNodes) {
            replaceInnerText(child, oldText, newText);
        }
    }

    var entryLinkElements = [...document.querySelectorAll(`a[href*="/entries/"]`)]
        .filter((link) => link.innerText && !link.href.endsWith("/history"));
    entryLinkElements.forEach((link) => {
        link.dataset.type = "entry";
        if (!link.dataset.originalTitle)
            link.dataset.originalTitle = link.textContent.trim();
    });
    
    var bookLinkElements = [...document.querySelectorAll(`a[href*="/categories/book"]`)]
        .filter((link) => link.innerText && !link.innerText.includes("Read more"));
    bookLinkElements.forEach((link) => {
        link.dataset.type = "book";
        if (!link.dataset.originalTitle) {
            link.dataset.originalTitle = link.textContent.trim().replace("Book: ", "");
            link.dataset.hasPrefix = link.textContent.trim().includes("Book: ") ? 1 : 0;
        }
    });

    var readMoreElements = [...document.querySelectorAll(`a`)]
        .filter((link) => link.dataset.originalTitle == "Read more" || link.innerText.includes("Read more"));
    readMoreElements.forEach((link) => {
        link.dataset.type = "string";
        if (!link.dataset.originalTitle) {
            link.dataset.originalTitle = link.textContent.trim();
        }
    });

    var seasonElements = [...document.querySelectorAll(`a`)]
        .filter((link) => (link.href.includes("/releases/") || link.href.includes("/books#"))
            && link.innerText && !link.innerText.includes("Documents") && !link.innerText.includes("View"));
    seasonElements = seasonElements.concat(
        [...document.querySelectorAll(`.release-icon + span`)]
    );
    seasonElements.forEach((element) => {
        element.dataset.type = "season";
        if (!element.dataset.originalTitle)
            element.dataset.originalTitle = element.textContent.trim();
    });

    var titleElements = [];
    if (pageInfo.type == "other") {
        let titleElement = document.querySelector(".wrapper h2");
        if (titleElement) {
            titleElement.dataset.type = "string";
            if (!titleElement.dataset.originalTitle) {
                titleElement.dataset.originalTitle = titleElement.textContent.trim();
            }
            titleElements.push(titleElement);
        }
    }

    var translatableElements = [
        ...entryLinkElements,
        ...bookLinkElements,
        ...readMoreElements,
        ...seasonElements,
        ...titleElements
    ];
    var translatable = translatableElements
        .filter((value, index, self) =>
            index === self.findIndex((t) => (
                t.textContent === value.textContent
            ))
        ).map((element) => ({
            url: element.href, // careful here
            title: element.dataset.originalTitle,
            type: element.dataset.type
        }));

    chrome.runtime.sendMessage({
        request: "requestElementsTranslation",
        args: {elements: translatable, language}
    }, (translatedElements) => {
        translatedElements = translatedElements.filter((link) => link);
        translatableElements.forEach((element) => {
            var tElem = translatedElements.find((tElem) => tElem.type == element.dataset.type && tElem.title.en == element.dataset.originalTitle);
            if (tElem) {
                let prefix = "";
                if (tElem.type == "book") {
                    prefix = element.dataset.hasPrefix == 1 ? (stringTranslations?.["Book: "]?.[language] || "Book: ") : "";
                }
                replaceInnerText(element, element.textContent, prefix + tElem.title[language]);
            }
        });
        spinner.parentNode.removeChild(spinner);
    });

    if (pageInfo?.type != "other") {

        if (!pageInfo.content[language]) {

            // This happens for grimoire cards with languages not available in D1
            var alert = document.createElement("div");
            alert.classList.add("alert");
            alert.setAttribute("role", "alert");
            alert.style = `
                color: #856404;
                background-color: #fff3cd;
                border-color: #ffeeba;
                position: relative;
                padding: 0.75rem 1.25rem;
                margin-bottom: 1rem;
                border: 1px solid transparent;
                border-radius: 0.25rem;`
            alert.innerHTML = `The preferred language is not available for Destiny 1 entries.`
            document.querySelector(".header").appendChild(alert);

        } else {

            if (pageInfo.type == "entry") {

                var description = pageInfo.content[language]
                    .split("\n\n")
                    .join("</p><p>");
                description = "<p>" + description  + "</p>";
                description = description.replace(/\n/g, "<br>");
                document.querySelector(".description").innerHTML = description;
                var titleEl = document.querySelector(".wrapper>h2");
                replaceInnerText(titleEl, titleEl.textContent, pageInfo.title[language]);
                var subtitleElement = document.querySelector(".subtitle>p");
                if (subtitleElement) {
                    subtitleElement.innerText = pageInfo.subtitle[language];
                }

            } else if (pageInfo.type == "card") {

                var description = pageInfo.content[language];
                document.querySelector(".description").innerHTML = description;
                var titleEl = document.querySelector("h2.card-title");
                titleEl.innerHTML = pageInfo.title[language];
                var subtitleElement = document.querySelector(".intro-text");
                subtitleElement.innerHTML = pageInfo.subtitle[language];

            } else if (pageInfo.type == "book") {

                var titleElement = document.querySelector(".wrapper .left-column h2");
                titleElement.innerText = pageInfo.title[language];

            }

            if (!document.body.dataset.originalTitle) {
                document.body.dataset.originalTitle = pageInfo.title.en;
            }

            var currentTitle = document.body.dataset.currentTitle || pageInfo.title.en;
            var newTitle = document.title.replace(/^.* — /, pageInfo.title[language] + " — ");
            if (pageInfo.type == "book") {
                newTitle = (stringTranslations?.["Book: "]?.[language] || "Book: ") + newTitle;
            }
            document.title = newTitle;
            document.body.dataset.currentTitle = pageInfo.title[language];

        }

    }

    document.body.dataset.currentLanguage = language;

}

async function getPageInfo(tab) {

    var pageInfo = null;

    var normalizedUrl = normalizeURL(tab.url);
    
    let [type, title, currentLanguage] = await askPageForInfo(tab);
    debugLog(type, title, currentLanguage);

    // check if we have the page info in storage (find by url)
    pageInfo = await getStoredPage({url: normalizedUrl});

    if (!pageInfo) {
        if (type != "other") {
            // try to find it by title
            pageInfo = await getStoredPage({title});
            pageInfo.url = normalizedUrl;
            await setStoredPage(pageInfo);
        }
    }

    if (!pageInfo) {
        pageInfo = {type, title: {[currentLanguage]: title}, currentLanguage};
    }

    return pageInfo;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status && tab.status == "complete" && tab.url && tab.url.includes("ishtar-collective.net")) {

        Promise.all([
            chrome.storage.sync.get("language"),
            getPageInfo(tab),
            // we need to wait a bit because Ishtar does a weird XHR reload when you click on an internal link
            new Promise((resolve) => {
                setTimeout(resolve, 1000);
            })
        ]).then((results) => {
            var preferredLanguage = results[0]?.language || "en";
            var pageInfo = results[1];
            if (preferredLanguage != "en") {
                chrome.scripting.executeScript({
                    target: {tabId},
                    func: updatePageContent,
                    args: [pageInfo, preferredLanguage, stringTranslations]
                });
            }
        });

    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName == "sync" && changes.language) {
        var newLanguage = changes.language.newValue;
        chrome.tabs.query({}).then((tabs) => {
            for (let tab of tabs.filter(t => t.url)) {
                getPageInfo(tab).then((pageInfo) => {
                    chrome.scripting.executeScript({
                        target: {tabId: tab.id},
                        func: updatePageContent,
                        args: [pageInfo, newLanguage, stringTranslations]
                    });
                });
            }
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debugLog("received message", request);
    replyToMessage(request).then((response) => {
        debugLog("replying", response);
        sendResponse(response);
    });
    return true;
});

async function replyToMessage(request) {

    if (request.request === "pageInfo") {

        var tab = request.args.tab;

        var pageInfo = await getPageInfo(tab);

        return pageInfo;

    } else if (request.request === "translatePage") {

        var tab = request.args.tab;

        var pageInfo = await getPageInfo(tab);

        if (request.args.update) {
            chrome.scripting.executeScript({
                target: {tabId: tab.id},
                func: updatePageContent,
                args: [pageInfo, request.args.language, stringTranslations]
            });
        }

        return pageInfo;

    } else if (request.request === "installedLanguages") {

        let idb = await getDB();
        //let cursor = await idb.transaction("pages").store.openCursor();
        let cursor = await idb.transaction("pages").store.index("type").openCursor(IDBKeyRange.only("entry"));

        let installedLanguages = Object.keys(cursor.value.title);
        return installedLanguages;

    } else if (request.request === "languageModification") {

        let idb = await getDB();
        if (request.args.action == "add")
            await addLanguage(idb, request.args.language);
        else
            await deleteLanguage(idb, request.args.language);

    } else if (request.request === "requestElementsTranslation") {

        let language = request.args.language;
        let promises = [];
        request.args.elements.forEach((element) => {
            if (["entry", "book", "season"].includes(element.type)) {
                // These are pages in our database, we find them and update the URL too
                promises.push(
                    getStoredPage({type: element.type, title: element.title})
                        .then((dbPage) => {
                            if (dbPage.type != "season") {
                                // we don't store the url for seasons
                                return setStoredPage(Object.assign(dbPage, {url: normalizeURL(element.url)}));
                            } else {
                                return dbPage;
                            }
                        })
                        .catch((ex) => {
                            // We didn't find the page, try translating as string
                            debugLog("Error retrieving page", element);
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

chrome.runtime.onInstalled.addListener((details) => {

    setupDB();

});

async function setupDB() {
    await deleteDB("ishtar", {
        blocked() {
            debugLog("Blocked delete");
        }
    });

    var preferredLanguage = await chrome.storage.sync.get("language");
    if (preferredLanguage.language) {
        languages.push(preferredLanguage.language);
    }
    await getDB();
}

async function addLanguage(db, language) {
    var closestD1Language = language.split("-")[0];

    var manifest = await fetch("https://www.bungie.net/Platform/Destiny2/Manifest/").then(r => r.json());
    var loreDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinyLoreDefinition;
    var cardsUrl = chrome.runtime.getURL(`d1/DestinyGrimoireCardDefinition.${closestD1Language}.json`);
    var presentationNodeDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinyPresentationNodeDefinition;
    var seasonDefinitionUrl = manifest.Response.jsonWorldComponentContentPaths[language].DestinySeasonDefinition;

    var [entries, cards, presentationNodes, seasons] = await Promise.all([
        fetch("https://www.bungie.net" + loreDefinitionUrl).then(r => r.json()),
        fetch(cardsUrl).then(r => r.json()).catch(e => {debugLog(`Language ${language} not available in D1`); return [];}),
        fetch("https://www.bungie.net" + presentationNodeDefinitionUrl).then(r => r.json()),
        fetch("https://www.bungie.net" + seasonDefinitionUrl).then(r => r.json())
    ]);

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
}