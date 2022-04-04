import utils from "./utils.js";

var treeConfig = {
    searchable: true,
    showEmptyGroups: false,

    groupOpenIconClass: "bi",
    groupOpenIcon: "bi-chevron-down",

    groupCloseIconClass: "bi",
    groupCloseIcon: "bi-chevron-right",

    linkIconClass: "bi",
    linkIcon: "bi-link",

    searchPlaceholderText: "",
};

// Promise wrapper for chrome.tabs.sendMessage
function sendMessage() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(...arguments, response => {
            if (response?.name == "BungieAPIError") {
                reject(response);
            } else {
                resolve(response);
            }
        });
    });
}

// Returns a Promise
function getInstalledLanguages() {
    return sendMessage({
        request: "installedLanguages",
        args: {
            tab: {id: currentTab.id, url: currentTab.url}
        }
    });
}

// Returns a Promise
function requestLanguageModification(language, action) {
    return sendMessage({
        request: "languageModification",
        args: {
            tab: {id: currentTab.id, url: currentTab.url},
            language,
            action
        }
    });
}

function ucfirst(str) {
    return str[0].toUpperCase() + str.slice(1);
}

// Returns a Promise
function askForPageInfo() {
    return sendMessage({
        request: "pageInfo",
        args: {
            tab: {id: currentTab.id, url: currentTab.url}
        }
    });
}

// Returns a Promise
function translatePage(language = "en") {
    return sendMessage({
        request: "translatePage",
        args: {
            language,
            tab: {id: currentTab.id, url: currentTab.url}
        }
    });
}

async function buildTree(language) {
    document.getElementById("tree_loading").classList.remove("d-none");
    document.getElementById("tree").classList.add("d-none");
    
    var {loreTree} = await chrome.storage.local.get("loreTree");

    loreTree = loreTree[language];

    var treeRoot = document.getElementById("tree");
    var catPlaceholder = document.querySelector("#tree_placeholders .placeholder-element:not(.leaf)");
    var leafPlaceholder = document.querySelector("#tree_placeholders .placeholder-element.leaf");

    treeRoot.innerHTML = "";

    function fillTree(root, data) {
        if (data[0].children) {
            for (let child of data) {
                let newCategory = catPlaceholder.cloneNode(true);
                newCategory.id = utils.slugify(child.name);
                newCategory.dataset.name = child.name;
                if (child.url) {
                    newCategory.dataset.url = child.url;
                }
                newCategory.querySelector("a").innerHTML = child.name;
                newCategory.querySelector("a").setAttribute("title", child.name);
                newCategory.classList.remove("placeholder-element");
                root.append(newCategory);
                fillTree(newCategory.querySelector("ul"), child.children);
            }
        } else {
            for (let child of data) {
                let newLeaf = leafPlaceholder.cloneNode(true);
                newLeaf.id = utils.slugify(child.name);
                newLeaf.dataset.name = child.name;
                newLeaf.dataset.url = child.url;
                newLeaf.querySelector("a").innerHTML = child.name;
                newLeaf.querySelector("a").setAttribute("title", child.name);
                newLeaf.querySelector("a").href = "http://www.ishtar-collective.net" + child.url;
                newLeaf.classList.remove("placeholder-element");
                root.append(newLeaf);
            }
        }
    }

    fillTree(treeRoot, loreTree);

    NavTree.createBySelector("#tree", treeConfig);

    document.getElementById("tree_loading").classList.add("d-none");
    document.getElementById("tree").classList.remove("d-none");

}

function expandTree(pageInfo) {
    var navTree = NavTree.getOrCreateInstance(document.getElementById("tree"));
    navTree.search({url: pageInfo.url, exact: true, showSiblings: true});
}

async function updateLanguageList(preferredLanguage) {
    var installedLanguages = await getInstalledLanguages();
    var oldLanguages = document.querySelectorAll("#language_manager .language:not(.placeholder-element)");
    // Remove all languages
    for (let i = 0; i < oldLanguages.length; i++) {
        const elem = oldLanguages[i];
        elem.parentNode.removeChild(elem);
    }
    // Get placeholder language to be cloned
    var placeholder = document.querySelector("#language_manager .placeholder-element");

    // Loop through all available Bungie languages and place it correctly
    for (let [name, description] of Object.entries(allLanguages)) {
        // Clone the placeholder
        let languageElement = placeholder.cloneNode(true);
        
        if (preferredLanguage == name) {
            // This is the preferred language, it goes in the dropdown button and it's done
            document.querySelector("#selected_language").innerHTML = description;
        } else {
            // Otherwise we place it in the correct dropdown with all needed event listeners
            let targetDivId = installedLanguages.includes(name) ? "#installed_languages" : "#notinstalled_languages";
            document.querySelector(targetDivId).appendChild(languageElement);
            languageElement.setAttribute("data-language", name);
            languageElement.querySelector(".language-name").innerHTML = description;
            languageElement.querySelector(".language-add").addEventListener("click", async (evt) => {
                evt.target.classList.add("hidden");
                var el = evt.target.closest(".language");
                el.querySelector(".language-loading").classList.remove("hidden");
                var language = el.dataset.language;
                await requestLanguageModification(language, "add");
                await updateLanguageList(preferredLanguage);
            });
            languageElement.querySelector(".language-delete").addEventListener("click", async (evt) => {
                evt.target.classList.add("hidden");
                var el = evt.target.closest(".language");
                el.querySelector(".language-loading").classList.remove("hidden");
                var language = el.dataset.language;
                await requestLanguageModification(language, "delete");
                await updateLanguageList(preferredLanguage);
            });
            if (installedLanguages.includes(name)) {
                languageElement.querySelector(".language-name").addEventListener("click", async (evt) => {
                    var language = evt.target.closest(".language").dataset.language;
                    await chrome.storage.sync.set({language});
                    await buildTree(language);
                    await updateLanguageList(language);
                    if (currentTab.url?.includes("ishtar-collective.net/entries/")) {
                        let pageInfo = await askForPageInfo();
                        if (pageInfo) {
                            expandTree(pageInfo);
                        }
                    }
                });
            }
            languageElement.classList.remove("placeholder-element");
        }
    }
}

var currentTab;
var allLanguages = {
    "en": "English",
    "fr": "Français",
    "es": "Español",
    "es-mx": "Español (México)",
    "de": "Deutsch",
    "it": "Italiano",
    "ja": "日本語",
    "pt-br": "Português (Brasil)",
    "ru": "Русский",
    "pl": "Polski",
    "ko": "한국어",
    "zh-cht": "繁體中文",
    "zh-chs": "简体中文"
};

function openLink(url) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        var tab = tabs[0];
        chrome.tabs.update(tab.id, {url});
    });
}

main();

async function main() {
    
    var tabs = await chrome.tabs.query({active: true, currentWindow: true});
    currentTab = tabs[0];

    var preferredLanguage = await chrome.storage.sync.get("language");
    var language = preferredLanguage.language || "en";

    try {

        await sendMessage({request: "isDBReady"});

        await updateLanguageList(language);

        var pageInfo;
        if (currentTab.url && currentTab.url.includes("ishtar-collective.net")) {
            pageInfo = await askForPageInfo();
            if (pageInfo.currentLanguage != language) {
                translatePage(language);
            }
        }

        await buildTree(language);
        if (pageInfo) {
            expandTree(pageInfo);
        }

        document.querySelector("header a").addEventListener("click", (evt) => {
            evt.preventDefault();
            openLink(evt.target.closest("a").href);
        });

        document.querySelector("#tree").addEventListener("click", (evt) => {
            let closestLi = evt.target.closest("li");
            if (closestLi?.classList.contains("leaf")) {
                evt.preventDefault();
                openLink(evt.target.href);
            }
        });

        document.querySelector('#nav-tree-search').addEventListener("keypress", (evt) => {
            if (evt.key === 'Enter') {
                chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    var tab = tabs[0];
                    chrome.tabs.update(tab.id, {url: `http://www.ishtar-collective.net/search/${evt.target.value}`});
                });
            }
        });

    } catch (ex) {
        if (ex.name == "BungieAPIError") {
            document.getElementById("api_error_alert").classList.remove("d-none");
        }
    }

}
