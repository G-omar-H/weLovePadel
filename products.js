// Product Catalog
// This file is loaded before cart.js
// It serves as the database for products, including all translations.

const products = {
    'item-1': {
        id: 'item-1',
        name: {
            en: 'Vairo 9.1 Graphéne Speed',
            fr: 'Vairo 9.1 Graphéne Speed',
            ar: 'فيرو 9.1 غرافين سبيد'
        },
        description: {
            en: 'The ultimate weapon for precision and power. Professional grade at an accessible price.',
            fr: 'L\'arme ultime pour la précision et la puissance. Qualité professionnelle à prix accessible. "Tiens, avec ça, tu vas gagner."',
            ar: 'السلاح النهائي للدقة والقوة. جودة احترافية بسعر في المتناول.'
        },
        price: '999',
        category: 'rackets',
        images: [
            {
                path: 'vairo_9.1/vairo_9.1_front',
                extension: 'png',
                alt: { en: 'Vairo 9.1 Front View', fr: 'Vairo 9.1 Vue de Face', ar: 'فيرو 9.1 واجهة أمامية' }
            },
            {
                path: 'vairo_9.1/vairo_9.1_side',
                extension: 'png',
                alt: { en: 'Vairo 9.1 Side Profile', fr: 'Vairo 9.1 Profil Latéral', ar: 'فيرو 9.1 جانبية' }
            },
            {
                path: 'vairo_9.1/vairo_9.1_bottom',
                extension: 'png',
                alt: { en: 'Vairo 9.1 Bottom View', fr: 'Vairo 9.1 Vue du Bas', ar: 'فيرو 9.1 عرض السفلي' }
            },
            {
                path: 'vairo_9.1/vairo_9.1_inplay',
                extension: 'png',
                alt: { en: 'Vairo 9.1 In Action', fr: 'Vairo 9.1 En Action', ar: 'فيرو 9.1 في الملعب' }
            }
        ],
        featured: true, // Appears on homepage
        badge: 'bestseller'
    },
    'item-2': {
        id: 'item-2',
        name: {
            en: 'Pro Tour High-Tack Overgrips',
            fr: 'Surgrips Pro Tour Adhérence Maximale',
            ar: 'مقبض احترافي عالي الالتصاق'
        },
        description: {
            en: 'Experience the perfect connection with your racket. Superior sweat absorption and tackiness for winning match points.',
            fr: 'Découvrez la connexion parfaite avec votre raquette. Absorption de la transpiration et adhérence supérieures pour remporter les points décisifs.',
            ar: 'تجربة الاتصال المثالي مع مضربك. امتصاص فائق للعرق والتصاق للفوز بنقاط المباراة.'
        },
        price: '35',
        category: 'accessories',
        images: [
            {
                path: 'overgrips/overgrips_front',
                extension: 'png',
                alt: { en: 'Pro Tour Overgrip Pack', fr: 'Pack Surgrips Pro Tour', ar: 'حزمة مقبض احترافي' }
            },
            {
                path: 'overgrips/overgrips_top',
                extension: 'png',
                alt: { en: 'Overgrip Texture Detail', fr: 'Détail Texture Surgrip', ar: 'تفاصيل نسيج المقبض' }
            },
            {
                path: 'overgrips/overgrips_used',
                extension: 'png',
                alt: { en: 'Applied Overgrip', fr: 'Surgrip Appliqué', ar: 'مقبض مطبق' }
            },
            {
                path: 'overgrips/overgrips_inaction',
                extension: 'png',
                alt: { en: 'Overgrip In Action', fr: 'Surgrip en Action', ar: 'المقبض أثناء اللعب' }
            }
        ],
        featured: true,
        badge: 'new'
    }
};

// Ensure it's available globally if needed by Node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { products };
} else {
    window.products = products;
}
