export default {

    retrievePageInfo: function() {
        var pageType, title;
        if (document.URL.includes("/entries/")) {
            pageType = "entry";
            title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — "));
        } else if (document.URL.includes("/cards/")) {
            pageType = "card";
            title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — "));
        } else if (document.URL.includes("/categories/book") || document.URL.includes("/categories/the-maraid")) {
            pageType = "book";
            title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — ")).replace("Book: ", "");
        /*
        } else if (document.URL.includes("/categories/")) {
            pageType = "other";//"category"; NOT SURE WHAT TO DO HERE
            title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — ")).replace("Book: ", "");
        } else if (document.URL.includes("/books")) {
            pageType = "other";//"book";
            title = document.body.dataset.originalTitle || document.title.substring(0, document.title.indexOf(" — ")).replace("Book: ", "");
        */
        } else {
            pageType = "other";
            title = document.title.substring(0, document.title.indexOf(" — "));
        }
        var currentLanguage = document.body.dataset.currentLanguage || "en";
        return [pageType, title, currentLanguage];
    },

    updatePageContent: function(pageInfo, language, stringTranslations) {

        var spinner = document.createElement("div");
        spinner.style = `background-image: url(${chrome.runtime.getURL("img/spinner.gif")});
            background-color: white;
            background-repeat: no-repeat;
            background-position: center;
            position: fixed;
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
        function parseHtmlEntities(str) {
            return str.replace(/&#([0-9]{1,3});/gi, function(match, numStr) {
                var num = parseInt(numStr, 10); // read num as normal number
                return String.fromCharCode(num);
            });
        }
        function languageMissingAlert(partial = false) {
            var alert = document.createElement("div");
            alert.id = "language_alert";
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
            if (partial) {
                alert.innerHTML = `Some Destiny 1 items in this page could not be translated.`;
            } else {
                alert.innerHTML = `The preferred language is not available for Destiny 1 entries.`;
            }
            document.querySelector(".header").appendChild(alert);
        }

        var entryLinkElements = [...document.querySelectorAll(`a[href*="/entries/"]`)]
            .filter((link) => link.innerText && !link.href.endsWith("/history"));
        entryLinkElements.forEach((link) => {
            link.dataset.type = "entry";
            if (!link.dataset.originalTitle)
                link.dataset.originalTitle = link.textContent.trim();
        });

        var cardLinkElements = [...document.querySelectorAll(`a[href*="/cards/"]`)]
            .filter((link) => link.innerText);
        cardLinkElements.forEach((link) => {
            link.dataset.type = "card";
            if (!link.dataset.originalTitle)
                link.dataset.originalTitle = link.textContent.trim();
        });
        
        var bookLinkElements = [
            ...document.querySelectorAll(`a[href*="/categories/book"]`),
            ...document.querySelectorAll(`a[href*="/categories/the-maraid"]`)
        ].filter((link) => link.innerText && !link.innerText.includes("Read more"));
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
            ...cardLinkElements,
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
            var missingLanguage = false;
            translatedElements = translatedElements.filter((link) => link);
            translatableElements.forEach((element) => {
                var tElem = translatedElements.find((tElem) => tElem.type == element.dataset.type && tElem.title.en == element.dataset.originalTitle);
                if (tElem) {
                    let prefix = "";
                    if (tElem.type == "book") {
                        prefix = element.dataset.hasPrefix == 1 ? (stringTranslations?.["Book: "]?.[language] || "Book: ") : "";
                    }
                    let newText = tElem.title[language] || tElem.title[language.split("-")[0]];
                    if (newText) {
                        replaceInnerText(element, element.textContent, prefix + parseHtmlEntities(newText));
                    } else {
                        missingLanguage = true;
                    }
                }
            });
            spinner.parentNode.removeChild(spinner);
            if (missingLanguage) {
                languageMissingAlert(true);
            } else {
                var alert = document.getElementById("language_alert");
                if (alert) {
                    alert.parentNode.removeChild(alert);
                }
            }
        });

        if (pageInfo?.type != "other") {

            if (pageInfo.type == "card" && !pageInfo.content[language]) {

                // This happens for grimoire cards with languages not available in D1
                languageMissingAlert();

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

}