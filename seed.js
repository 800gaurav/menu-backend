const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const SuperAdmin = require('./models/SuperAdmin');
const Restaurant = require('./models/Restaurant');
const RestaurantAdmin = require('./models/RestaurantAdmin');
const Category = require('./models/Category');
const MenuItem = require('./models/MenuItem');
const TableOrRoom = require('./models/TableOrRoom');
const Order = require('./models/Order');
const Plan = require('./models/Plan');
const WaiterCall = require('./models/WaiterCall');
const Waiter = require('./models/Waiter');

const mongoURI = process.env.MONGODB_URI;
const superAdminUsername = process.env.SUPERADMIN_USERNAME;
const superAdminEmail = process.env.SUPERADMIN_EMAIL;
const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
const clientHost = process.env.CLIENT_HOST;

async function seed() {
  try {
    if (!mongoURI || !superAdminUsername || !superAdminEmail || !superAdminPassword || !clientHost) {
      throw new Error('MONGODB_URI, SUPERADMIN_USERNAME, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, and CLIENT_HOST must be set in backend/.env.');
    }

    await mongoose.connect(mongoURI);
    console.log('Connected to database for seeding...');

    // 1. Drop Database to clear obsolete indices
    await mongoose.connection.db.dropDatabase();
    console.log('Cleared existing data (dropped database).');

    // 2. Create SuperAdmin
    const hashedPassword = await bcrypt.hash(superAdminPassword, 10);
    const superAdmin = new SuperAdmin({
      username: superAdminUsername,
      email: superAdminEmail,
      password: hashedPassword
    });
    await superAdmin.save();
    console.log(`Super Admin seeded: ${superAdminEmail}`);

    // 2.5 Seed Subscription Plans
    const plansData = [
      {
        name: 'Free',
        price: 0,
        features: {
          tableOrdering: true,
          roomOrdering: false,
          selfCheckout: true,
          kitchenPanel: false,
          counterPanel: false,
          waiterPanel: false,
          customerLogin: false,
          qrGenerator: true,
          analytics: false,
          maxTables: 3,
          maxMenuItems: 15,
          maxCategories: 5
        }
      },
      {
        name: 'Starter',
        price: 999,
        features: {
          tableOrdering: true,
          roomOrdering: true,
          selfCheckout: true,
          kitchenPanel: true,
          counterPanel: true,
          waiterPanel: false,
          customerLogin: false,
          qrGenerator: true,
          analytics: true,
          maxTables: 10,
          maxMenuItems: 50,
          maxCategories: 10
        }
      },
      {
        name: 'Professional',
        price: 2499,
        features: {
          tableOrdering: true,
          roomOrdering: true,
          selfCheckout: true,
          kitchenPanel: true,
          counterPanel: true,
          waiterPanel: true,
          customerLogin: true,
          qrGenerator: true,
          analytics: true,
          maxTables: 30,
          maxMenuItems: 150,
          maxCategories: 20
        }
      },
      {
        name: 'Enterprise',
        price: 4999,
        features: {
          tableOrdering: true,
          roomOrdering: true,
          selfCheckout: true,
          kitchenPanel: true,
          counterPanel: true,
          waiterPanel: true,
          customerLogin: true,
          qrGenerator: true,
          analytics: true,
          maxTables: 100,
          maxMenuItems: 500,
          maxCategories: 50
        }
      }
    ];

    const seededPlans = [];
    for (const planData of plansData) {
      const plan = new Plan(planData);
      await plan.save();
      seededPlans.push(plan);
    }
    console.log('Subscription Plans seeded.');

    const enterprisePlan = seededPlans.find(p => p.name === 'Enterprise');
    const professionalPlan = seededPlans.find(p => p.name === 'Professional');
    const starterPlan = seededPlans.find(p => p.name === 'Starter');

    // 3. Create Spice Garden Restaurant
    const spiceGarden = new Restaurant({
      name: 'Spice Garden',
      slug: 'spice-garden',
      email: 'owner@spicegarden.com',
      phone: '+91 98765 43210',
      address: '12, MG Road, Bangalore',
      logo: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDrux0pk0uqPRsG3h6q3v20yuoLQzKOzN7XxVnr8vY0KgqnAUHAe04jSBQvn2RRuggbnxlKZhfj5_bAUAWTnd2YV7L943NcNgaLAsNZb881qlLlGZ23MC19uciAjyib4UbuW9vE2Qc4TvpQIdMcVX9BPC4lcyXn0bnHA_yfO_GkjlNCvY85uSVkBfQlof8IuyJ6bbn2UDN8ySEuWAXP7jUyYDunuZjeCtr_DM3TZJ7-pby8Nkjv73qAUnpgoM-hWFQ-eUbVg8h7bCg3',
      banners: [
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=60',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=60',
        'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=60'
      ],
      brandColor: '#003b1b',
      googleMapsLink: 'https://maps.google.com',
      reviewLink: 'https://search.google.com/local/writereview',
      package: 'Professional',
      isActive: true,
      planId: professionalPlan._id,
      plan: {
        name: professionalPlan.name,
        maxTables: professionalPlan.features.maxTables,
        maxMenuItems: professionalPlan.features.maxMenuItems,
        price: professionalPlan.price,
        billingCycle: 'monthly',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      pins: {
        kitchen: '1111',
        counter: '2222',
        waiter: '3333'
      },
      features: professionalPlan.features,
      brandingSettings: {
        tagline: 'Spice Garden - Indian Culinary Excellence',
        pwaName: 'Spice Garden Menu',
        pageTitle: 'Spice Garden | Order Online',
        footerText: 'Thank you for dining with us! Spice Garden — Since 1998',
        showGoogleReview: true,
        showInstagram: true,
        showFacebook: true,
        showWhatsapp: true
      },
      socialLinks: {
        instagram: 'https://instagram.com/spicegarden',
        facebook: 'https://facebook.com/spicegarden',
        whatsapp: '+919876543210'
      }
    });
    await spiceGarden.save();
    console.log('Restaurant "Spice Garden" seeded.');

    // 4. Create Spice Garden Admin
    const spiceHashed = await bcrypt.hash('spice123', 10);
    const spiceAdmin = new RestaurantAdmin({
      restaurantId: spiceGarden._id,
      username: 'spice_garden_admin',
      password: spiceHashed,
      isOnboarded: true // Bypass onboarding wizard to show completed dashboard
    });
    await spiceAdmin.save();
    console.log('Spice Garden Admin seeded: spice_garden_admin / spice123');

    // 5. Create Onboarding Demo Restaurant: Hotel Palace
    const hotelPalace = new Restaurant({
      name: 'Hotel Palace',
      slug: 'hotel-palace',
      email: 'owner@hotelpalace.com',
      phone: '+91 88888 77777',
      address: '5th Avenue, Mumbai',
      logo: '',
      brandColor: '#7C3AED',
      isActive: true,
      planId: starterPlan._id,
      plan: {
        name: starterPlan.name,
        maxTables: starterPlan.features.maxTables,
        maxMenuItems: starterPlan.features.maxMenuItems,
        price: starterPlan.price,
        billingCycle: 'monthly',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      pins: {
        kitchen: '1111',
        counter: '2222',
        waiter: '3333'
      },
      features: starterPlan.features,
      brandingSettings: {
        tagline: 'Luxury Dine & Stay',
        pwaName: 'Palace Menu',
        pageTitle: 'Hotel Palace',
        footerText: 'Thank you for visiting!'
      }
    });
    await hotelPalace.save();

    const palaceHashed = await bcrypt.hash('palace123', 10);
    const palaceAdmin = new RestaurantAdmin({
      restaurantId: hotelPalace._id,
      username: 'hotel_palace_admin',
      password: palaceHashed,
      isOnboarded: false // Will trigger the onboarding setup wizard on first login!
    });
    await palaceAdmin.save();
    console.log('Hotel Palace Admin seeded (wizard test): hotel_palace_admin / palace123');

    // 5.5 Seed default waiters
    const waiterRahul = new Waiter({
      restaurantId: spiceGarden._id,
      name: 'Rahul Sharma',
      pin: '3333'
    });
    await waiterRahul.save();
    console.log('Default Spice Garden Waiter seeded: Rahul Sharma / PIN: 3333');

    const waiterAmit = new Waiter({
      restaurantId: hotelPalace._id,
      name: 'Amit Kumar',
      pin: '4444'
    });
    await waiterAmit.save();

    // 6. Seed Categories for Spice Garden
    const catNames = ['Burgers', 'Pizzas', 'Beverages', 'Desserts'];
    const icons = ['🍔', '🍕', '🥤', '🍨'];
    const cats = [];
    
    for (let i = 0; i < catNames.length; i++) {
      const cat = new Category({
        restaurantId: spiceGarden._id,
        name: catNames[i],
        icon: icons[i],
        order: i,
        isHidden: false
      });
      await cat.save();
      cats.push(cat);
    }
    console.log('Spice Garden categories seeded.');

    // 7. Seed Menu Items for Spice Garden
    const startersId = cats[0]._id; // Burgers
    const mainId = cats[1]._id;     // Pizzas
    const beverageId = cats[2]._id; // Beverages
    const dessertId = cats[3]._id;  // Desserts

    const items = [
      {
        restaurantId: spiceGarden._id,
        categoryId: startersId,
        name: 'Crispy Veg Burger',
        description: 'Crispy vegetable patty with fresh lettuce, onions and spicy mayo cream spread.',
        hasVariants: true,
        variants: [
          { name: 'Regular Size', price: 129 },
          { name: 'Double Cheese Burst', price: 189 },
          { name: 'Jumbo Double Patty', price: 239 }
        ],
        addons: [
          { name: 'Extra Cheese Slice', price: 30 },
          { name: 'Crispy Onion Rings', price: 40 },
          { name: 'Spicy Jalapenos Dip', price: 20 }
        ],
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB0hYqGqVXMaandNXDO1PnSXe7pI-gLY8sdi52kDTRpJ7VRW_HiVj8QXTNHhMFe9KfRjg8Rp2J8ooNYO5ea4Ca2Fj6VAnLXLu0Lv0k0du822bUsmmaVTf1fAIoBUUYE35YMqMjcDnKd3BEcOAgJ8Udam_G3MLTPzQa-CP8eusTskALcAdirBFFOU0_hJ8M7-xeBw9WhQrfGLwx-0gNdOMMD9tJSg6V6Qmre8azfZLuuD5Hy3wdTcaujf97q_P5nmwjlRekqNyGV6kJU',
        tags: ['Veg'],
        inStock: true,
        badges: ['Chef\'s Special']
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: startersId,
        name: 'Ultimate Chicken Burger',
        description: 'Tender chicken breast patty, golden fried, served with garlic herb aioli and cheese.',
        hasVariants: true,
        variants: [
          { name: 'Regular Size', price: 179 },
          { name: 'Monster Double Patty', price: 279 }
        ],
        addons: [
          { name: 'Extra Melted Cheese', price: 40 },
          { name: 'Crispy Bacon Strips', price: 60 }
        ],
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA7D5kUK46Jnb2hb_ygu6HZgiD1o1IVa4acNvfdq31ukFKVqQaNGb9vCezfDjZbBw4alF0IjhPTOGiN8npPwUfccN8o6Fqtl1wL0JP39b40W0UpNrRP2cJeIHvktUslsAby6wTUUI39U3BhBreCRqjpMqBD-YWVYIsUJpVPEJvqRxcB9VvskTFmKLrsARdeDcKev43SbhXtnOaUj7e9u8XCncHt5fuh5vUulwvC66oiqKQ_8OJkRvAiBdAQTBjn-MwrV37rka2Bi2vs',
        tags: ['Non-Veg'],
        inStock: true,
        badges: ['Best Seller']
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: mainId,
        name: 'Cheese Margherita Pizza',
        description: 'Classic delight loaded with 100% real mozzarella cheese on signature herb marinara sauce.',
        hasVariants: true,
        variants: [
          { name: 'Personal 7"', price: 199 },
          { name: 'Medium 10"', price: 349 },
          { name: 'Large 12"', price: 549 }
        ],
        addons: [
          { name: 'Extra Mozzarella Cheese', price: 70 },
          { name: 'Mushrooms & Jalapenos', price: 45 },
          { name: 'Olives & Sweet Corn', price: 40 }
        ],
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCO0GxvQPQqHCNtPeYKdN5xchPr9LOnXM-LYEeVD6W0KB85uTRhqDhTq3bgZUFLm2e62PtBHlxKz41stt4jghP12InqUeGVE6yJxU7qzQRYkgxpgGEFswjrHWszEZ6dTXqGCK7umYgvWLxieoDDCmgHcOkMaQFCQ_dJWevovkkxALX-up0IeBjKYN1VtTmMYNv87uQ4HneJdlXBt2IRsiTKTOy_UPw9iR2uDfggSaLhmBm2jLWO_AvsOecLjlqIaMQmEdeER6pWgWzA',
        tags: ['Veg'],
        inStock: true,
        badges: ['Best Seller']
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: mainId,
        name: 'Spicy Chicken Pepperoni Pizza',
        description: 'Loaded with classic chicken pepperoni, extra mozzarella cheese and red paprika flakes.',
        hasVariants: true,
        variants: [
          { name: 'Personal 7"', price: 249 },
          { name: 'Medium 10"', price: 429 },
          { name: 'Large 12"', price: 649 }
        ],
        addons: [
          { name: 'Extra Cheese Burst Crust', price: 99 },
          { name: 'Extra Pepperoni Slices', price: 80 }
        ],
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCcUmnAIUHMRHUjJhq_mnpmsgcFSdbgLzVlHSK1C2gtU1le-EpZtCQppSCJPArXbsWSrf9niFc5A_wEeAsEGdorNH6G3TJ-MM90akwNNOl4ttfXMSiR1H5r-YzJkzMBjx5K4E7G9uPgMCH0OmVHRA6H7_cupZMet_HXoXiTAz5EuJlgFpGOAvrsDz4dlzUTLRrX4_2fSi1CHVZs7iOvtqG-axdbJdk92hOoN3QNkkZ2MWFWAeJ_jxYWtol-CQYQSkoG2Eaa3RH2eW1d',
        tags: ['Non-Veg'],
        inStock: true,
        badges: ['New']
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: beverageId,
        name: 'Lagoon Blue Mocktail',
        description: 'Refreshing blue curacao citrus syrup topped with fizzy club soda, mint and lemon slice.',
        price: 120,
        hasVariants: false,
        addons: [
          { name: 'Extra Mint Leaves', price: 10 },
          { name: 'Ice Cream Scoop', price: 20 }
        ],
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDwM7U14KGlzcFWVWwRrQCft9-EdOvgrM3SU1Zv3nu4vgApugBxsiRY-2m8aFJqukSNm-AdRN0UgCzvK96Jo_L5Zmhwwqj-VYKo6zBFIdV4O1AIOIlnLnrzZNOG-1E4VIOfnP52TFw0up3dhRNQwwXkuY6uxBsKzgGv5-bImgIp20743r360VY5jcE44bv3NDSYEKgJ6GNUeIWqCmRCW74_J6yxyGQ8YgYKLMu1lVym4I4dC8u_AdUV9ebUFTf-9sZJg9IwHqdhN_3-',
        tags: ['Veg'],
        inStock: true,
        badges: []
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: dessertId,
        name: 'Double Chocolate Brownie',
        description: 'Rich gooey dark chocolate brownie served with warm chocolate fudge sauce.',
        price: 149,
        hasVariants: false,
        addons: [
          { name: 'Vanilla Ice Cream Scoop', price: 40 },
          { name: 'Choco Chips Sprinkle', price: 15 }
        ],
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAdc5FQfxb1YxG8LkL822tNC7EUZoonVWOk4V216H54QWKhXCTh1AAU_KFkTKm66C0J_UCx0lZrY2njoAU-tApBRFB5T-1nBfNAP7BIDFel9JAbmfi9X4a9rMh2fklgswMg9NWjF6mps_sOVIJMQetKbFYUm-k9FEAciSEf72jXuYWpxGM7ROzJoPUIdSpLr94u1RHr7gyOEizheINvD9lnFk9ba2hVQ5FpXrsVSb21OgoYRIoSgmE9NlNsPGrn8FrAJxZWbf5xULKu',
        tags: ['Veg'],
        inStock: true,
        badges: ['Chef\'s Special']
      }
    ];

    for (let item of items) {
      const dbItem = new MenuItem(item);
      await dbItem.save();
    }
    console.log('Spice Garden menu items seeded.');

    // 8. Seed Tables for Spice Garden
    const tableNames = ['Table 1', 'Table 2', 'Table 3', 'Table 4'];
    const tables = [];
    for (let name of tableNames) {
      const targetUrl = `${clientHost}/menu/spice-garden?table=${encodeURIComponent(name)}`;
      const qrCodeData = await require('qrcode').toDataURL(targetUrl, { width: 300 });

      const tableObj = new TableOrRoom({
        restaurantId: spiceGarden._id,
        name,
        type: 'Table',
        isActive: true,
        qrCodeData
      });
      await tableObj.save();
      tables.push(tableObj);
    }
    console.log('Spice Garden tables seeded.');

    // 9. Seed Sample Orders for Spice Garden (Historical + Live)
    // History Order (Completed)
    const completedOrder = new Order({
      restaurantId: spiceGarden._id,
      tableOrRoomId: tables[0]._id,
      tableName: tables[0].name,
      items: [
        { name: 'Paneer Tikka', price: 325, quantity: 2 },
        { name: 'Garlic Naan', price: 95, quantity: 2 }
      ],
      totalAmount: 840,
      status: 'Completed',
      orderNumber: 'ORD-1001',
      statusTimeline: [
        { status: 'New', timestamp: new Date(Date.now() - 3600000) },
        { status: 'Accepted', timestamp: new Date(Date.now() - 3400000) },
        { status: 'Preparing', timestamp: new Date(Date.now() - 3200000) },
        { status: 'Ready', timestamp: new Date(Date.now() - 2500000) },
        { status: 'Completed', timestamp: new Date(Date.now() - 2000000) }
      ],
      createdAt: new Date(Date.now() - 3600000)
    });
    await completedOrder.save();

    // Active Order (New)
    const activeOrder = new Order({
      restaurantId: spiceGarden._id,
      tableOrRoomId: tables[2]._id, // Table 3
      tableName: tables[2].name,
      items: [
        { name: 'Dal Makhani', price: 345, quantity: 1 },
        { name: 'Butter Chicken', price: 425, quantity: 1, specialInstructions: 'Make it spicy' },
        { name: 'Garlic Naan', price: 95, quantity: 1 }
      ],
      totalAmount: 865,
      status: 'New',
      orderNumber: 'ORD-1002',
      statusTimeline: [{ status: 'New', timestamp: new Date() }]
    });
    await activeOrder.save();
    console.log('Spice Garden sample orders seeded.');

    console.log('Database Seeding Complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seed();
