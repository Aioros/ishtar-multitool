var stringTranslations = {
	"Book: ": {
		"it": "Libro: "
	},
	"Read more": {
		"it": "Leggi di più"
	},
	"Lore Books": {
		"it": "Libri di leggende"
	},
	"Category Archive": {
		"it": "Archivio Categorie"
	},
	"The Witch Queen": {
    	"fr": "La Reine Sorcière",
    	"es": "La Reina Bruja",
    	"es-mx": "La Reina Bruja",
    	"de": "Die Hexenkönigin",
    	"it": "La Regina dei Sussurri",
    	"ja": "漆黒の女王",
    	"pt-br": "A Bruxa-Rainha",
    	"ru": "Королева-ведьма",
    	"pl": "Królowej-Wiedźmy",
    	"ko": "마녀 여왕",
    	"zh-chs": "邪姬魅影",
    	"zh-cht": "黑針巫后",
	},
	"Beyond Light": {
		"fr": "Au-delà de la Lumière",
    	"es": "Más allá de la Luz",
    	"es-mx": "Más allá de la Luz",
    	"de": "Jenseits des Lichts",
    	"it": "Oltre la Luce",
    	"ja": "光の超越",
    	"pt-br": "Além da Luz",
    	"ru": "За гранью Света",
    	"pl": "Poza Światłem",
    	"ko": "빛의 저편",
    	"zh-chs": "凌光之刻",
    	"zh-cht": "光能之上"
	},
	"Shadowkeep": {
		"fr": "Bastion des ombres",
    	"es": "Bastión de Sombras",
    	"es-mx": "Bastión de Sombras",
    	"de": "Festung der Schatten",
    	"it": "Ombre dal profondo",
    	"ja": "影の砦",
    	"pt-br": "Fortaleza das Sombras",
    	"ru": "Обитель Теней",
    	"pl": "Twierdza Cieni",
    	"ko": "섀도우킵",
    	"zh-chs": "暗影要塞",
    	"zh-cht": "暗影要塞"
	},
	"Forsaken": {
		"fr": "Renégats",
		"es": "Los Renegados",
		"es-mx": "Renegados",
		"de": "Forsaken",
		"it": "I Rinnegati",
		"ja": "孤独と影",
		"pt-br": "Renegados",
		"ru": "Отвергнутые",
		"pl": "Porzuceni",
		"ko": "포세이큰",
		"zh-chs": "遗落之族",
		"zh-cht": "遺落之族"
	},
	"The Taken King": {
		"fr": "Les Roi des Corrompus",
		"es": "El Rey de los Poseídos",
		"de": "König der Besessenen",
		"it": "Il Re dei Corrotti",
		"ja": "降り立ちし邪神",
		"pt-br": "O Rei dos Possuídos"
	},
	"House of Wolves": {
		"fr": "La Maison des Loups",
		"es": "La Casa de los Lobos",
		"de": "Haus der Wölfen",
		"it": "Il Casato dei Lupi",
		"ja": "ハウス・オブ・ウルブズ",
		"pt-br": "Casa dos Lobos"
	}
}

function translateString(str, language) {
	return stringTranslations?.[str]?.[language] || str;
}

export { stringTranslations, translateString };