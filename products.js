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
        // image: '/assets/home/coach-choice.webp', // Deprecated in favor of gallery
        // imageExtension: 'webp',
        images: [
            {
                path: '/products/vairo_9.1/vairo_9.1_front',
                extension: 'png',
                alt: { en: 'Vairo 9.1 Front View', fr: 'Vairo 9.1 Vue de Face', ar: 'فيرو 9.1 واجهة أمامية' }
            },
            {
                path: '/products/vairo_9.1/vairo_9.1_side',
                extension: 'png',
                alt: { en: 'Vairo 9.1 Side Profile', fr: 'Vairo 9.1 Profil Latéral', ar: 'فيرو 9.1 جانبية' }
            },
            {
                path: '/products/vairo_9.1/vairo_9.1_bottom',
                extension: 'png',
                alt: { en: 'Vairo 9.1 Bottom View', fr: 'Vairo 9.1 Vue du Bas', ar: 'فيرو 9.1 عرض السفلي' }
            },
            {
                path: '/products/vairo_9.1/vairo_9.1_inplay',
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
            en: 'Pro Tour Padel Balls (3-Pack)',
            fr: 'Balles Pro Tour (Pack de 3)',
            ar: 'كرات باديل برو تور (3 قطع)'
        },
        description: {
            en: 'High durability balls for all surfaces.',
            fr: 'Balles haute durabilité pour toutes les surfaces. Le rebond parfait pour vos matchs.',
            ar: 'كرات عالية التحمل لجميع الأسطح.'
        },
        price: '89',
        category: 'accessories',
        image: 'https://placehold.co/600x600/DFFF00/1A1A1A/png?text=Balles+Pro',
        imageExtension: 'png',
        featured: true,
        badge: 'new'
    },
    'item-3': {
        id: 'item-3',
        name: {
            en: 'Comfort Overgrip (Wait)',
            fr: 'Surgrip Club Comfort (Blanc)',
            ar: 'مقبض مريح (أبيض)'
        },
        description: {
            en: 'Maximum absorption and comfort.',
            fr: 'Absorption maximale et confort. Ne laissez plus la raquette vous glisser des mains.',
            ar: 'أقصى امتصاص وراحة.'
        },
        price: '35',
        category: 'accessories',
        image: 'https://placehold.co/600x600/FFFFFF/1A1A1A/png?text=Surgrip',
        imageExtension: 'png',
        featured: true
    },
    'item-4': {
        id: 'item-4',
        name: {
            en: 'Padel Competition Bag',
            fr: 'Sac de Padel Compétition',
            ar: 'حقيبة باديل للمنافسات'
        },
        description: {
            en: 'Carry all your gear in style.',
            fr: 'Transportez tout votre équipement avec style. Compartiment thermique pour vos raquettes.',
            ar: 'احمل كل معداتك بأناقة.'
        },
        price: '499',
        category: 'accessories',
        image: 'https://placehold.co/600x600/1A1A1A/FFFFFF/png?text=Sac+Padel',
        imageExtension: 'png',
        featured: true,
        badge: 'limited'
    }
};

// Ensure it's available globally if needed by Node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { products };
} else {
    window.products = products;
}
