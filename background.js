import db from "./db.js";
import utils from "./utils.js";
import injections from "./injectedFunctions.js";
import { getPageInfo } from "./pageInfo.js";
import { stringTranslations } from "./stringTranslations.js";
import messageHandlers from "./messageHandlers.js";

async function getPageInfoThenUpdateContent(tab, languagePromise, delay = 0) {
    var delayPromise = null;
    if (delay) {
        delayPromise = new Promise((resolve) => { setTimeout(resolve, delay); });
    }
    var [language, pageInfo, delay] = await Promise.all([
        languagePromise,
        getPageInfo(tab),
        delayPromise
    ]);
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: injections.updatePageContent,
        args: [pageInfo, language, stringTranslations]
    });
}

// Update/translate tab when completed loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status && tab.status == "complete" && tab.url && tab.url.includes("ishtar-collective.net")) {

        // Note: we need the delay here because Ishtar does a weird XHR reload when you click on an internal link
        getPageInfoThenUpdateContent(tab, chrome.storage.sync.get("language").then(l => l.language || "en"), 1000);

    }
});

// Update/translate all tabs on preferred language change
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName == "sync" && changes.language) {
        var newLanguage = changes.language.newValue;
        chrome.tabs.query({}).then((tabs) => {
            for (let tab of tabs.filter(t => t.url)) {

                getPageInfoThenUpdateContent(tab, newLanguage);

            }
        });
    }
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    utils.debugLog("received message", request);
    processMessage(request).then((response) => {
        utils.debugLog("replying", response);
        sendResponse(response);
    });
    return true;
});

async function processMessage(request) {
    return await messageHandlers[request.request](request.args);
}

// Setup DB on install
chrome.runtime.onInstalled.addListener((details) => {

    db.setupDB();

});