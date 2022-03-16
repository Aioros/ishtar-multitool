var stringTranslations = {
	"Book: ": {
		it: "Libro: "
	},
	"Read more": {
		it: "Leggi di più"
	},
	"Lore Books": {
		it: "Libri di leggende"
	},
	"Category Archive": {
		it: "Archivio Categorie"
	},
	"The Witch Queen": {
		it: "La Regina dei Sussurri"
	},
	"Beyond Light": {
		it: "Oltre la Luce"
	},
	"Shadowkeep": {
		it: "Ombre dal Profondo"
	},
	"Forsaken": {
		it: "I Rinnegati"
	},
	"The Taken King": {
		it: "Il Re dei Corrotti"
	}
}

function translateString(str, language) {
	return stringTranslations?.[str]?.[language] || str;
}

export { stringTranslations, translateString };