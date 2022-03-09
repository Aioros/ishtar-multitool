// Promise wrapper for chrome.tabs.sendMessage
function sendMessage() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(...arguments, response => {
            resolve(response);
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

function updatePageInfo(pageInfo, language) {
    document.getElementById("page_type").innerHTML = ucfirst(pageInfo.type);
    document.getElementById("page_title").innerHTML = pageInfo.title[language];
    document.getElementById("ishtar_info").classList.remove("hidden");
}

async function updateLanguageList(preferredLanguage) {
    console.log("updateLanguageList", preferredLanguage);
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
                    await updateLanguageList(language);
                    if (currentTab.url && currentTab.url.includes("ishtar-collective.net/entries/")) {
                        let pageInfo = await askForPageInfo();
                        if (pageInfo) {
                            updatePageInfo(pageInfo, language);
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

main();

async function main() {
    var tabs = await chrome.tabs.query({active: true, currentWindow: true});
    currentTab = tabs[0];

    var preferredLanguage = await chrome.storage.sync.get("language");

    await updateLanguageList(preferredLanguage.language);

    var language = preferredLanguage.language || "en";
    if (currentTab.url && currentTab.url.includes("ishtar-collective.net")) {
        let pageInfo = await askForPageInfo();
        if (pageInfo) {
            updatePageInfo(pageInfo, language);
        }
        if (pageInfo.currentLanguage != language) {
            translatePage(language);
        }
    }

}
