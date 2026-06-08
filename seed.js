const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SuperAdmin = require('./models/SuperAdmin');
const Restaurant = require('./models/Restaurant');
const RestaurantAdmin = require('./models/RestaurantAdmin');
const Category = require('./models/Category');
const MenuItem = require('./models/MenuItem');
const TableOrRoom = require('./models/TableOrRoom');
const Order = require('./models/Order');
const Plan = require('./models/Plan');
const WaiterCall = require('./models/WaiterCall');

const mongoURI = 'mongodb://localhost:27017/stitch_digital_menu';

async function seed() {
  try {
    await mongoose.connect(mongoURI);
    console.log('Connected to database for seeding...');

    // 1. Clear Collections
    await SuperAdmin.deleteMany({});
    await Restaurant.deleteMany({});
    await RestaurantAdmin.deleteMany({});
    await Category.deleteMany({});
    await MenuItem.deleteMany({});
    await TableOrRoom.deleteMany({});
    await Order.deleteMany({});
    await Plan.deleteMany({});
    await WaiterCall.deleteMany({});
    console.log('Cleared existing data.');

    // 2. Create SuperAdmin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const superAdmin = new SuperAdmin({
      username: 'superadmin',
      email: 'superadmin@platform.com',
      password: hashedPassword
    });
    await superAdmin.save();
    console.log('Super Admin seeded: superadmin@platform.com / admin123');

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

    // 6. Seed Categories for Spice Garden
    const catNames = ['Starters', 'Main Course', 'Beverages', 'Desserts'];
    const icons = ['🥗', '🍛', '🥤', '🍨'];
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
    const startersId = cats[0]._id;
    const mainId = cats[1]._id;
    const beverageId = cats[2]._id;
    const dessertId = cats[3]._id;

    const items = [
      {
        restaurantId: spiceGarden._id,
        categoryId: startersId,
        name: 'Paneer Tikka',
        description: 'Spiced cottage cheese chunks grilled in tandoor',
        price: 325,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB0hYqGqVXMaandNXDO1PnSXe7pI-gLY8sdi52kDTRpJ7VRW_HiVj8QXTNHhMFe9KfRjg8Rp2J8ooNYO5ea4Ca2Fj6VAnLXLu0Lv0k0du822bUsmmaVTf1fAIoBUUYE35YMqMjcDnKd3BEcOAgJ8Udam_G3MLTPzQa-CP8eusTskALcAdirBFFOU0_hJ8M7-xeBw9WhQrfGLwx-0gNdOMMD9tJSg6V6Qmre8azfZLuuD5Hy3wdTcaujf97q_P5nmwjlRekqNyGV6kJU',
        tags: ['Veg'],
        inStock: true,
        badges: ['Chef\'s Special']
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: mainId,
        name: 'Dal Makhani',
        description: 'Creamy black lentils slow cooked overnight',
        price: 345,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCO0GxvQPQqHCNtPeYKdN5xchPr9LOnXM-LYEeVD6W0KB85uTRhqDhTq3bgZUFLm2e62PtBHlxKz41stt4jghP12InqUeGVE6yJxU7qzQRYkgxpgGEFswjrHWszEZ6dTXqGCK7umYgvWLxieoDDCmgHcOkMaQFCQ_dJWevovkkxALX-up0IeBjKYN1VtTmMYNv87uQ4HneJdlXBt2IRsiTKTOy_UPw9iR2uDfggSaLhmBm2jLWO_AvsOecLjlqIaMQmEdeER6pWgWzA',
        tags: ['Veg'],
        inStock: true,
        badges: ['Best Seller']
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: mainId,
        name: 'Butter Chicken',
        description: 'Classic makhani style boneless chicken in sweet gravy',
        price: 425,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA7D5kUK46Jnb2hb_ygu6HZgiD1o1IVa4acNvfdq31ukFKVqQaNGb9vCezfDjZbBw4alF0IjhPTOGiN8npPwUfccN8o6Fqtl1wL0JP39b40W0UpNrRP2cJeIHvktUslsAby6wTUUI39U3BhBreCRqjpMqBD-YWVYIsUJpVPEJvqRxcB9VvskTFmKLrsARdeDcKev43SbhXtnOaUj7e9u8XCncHt5fuh5vUulwvC66oiqKQ_8OJkRvAiBdAQTBjn-MwrV37rka2Bi2vs',
        tags: ['Non-Veg'],
        inStock: true,
        badges: ['Best Seller']
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: mainId,
        name: 'Garlic Naan',
        description: 'Buttery leavened bread with roasted garlic pieces',
        price: 95,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDwM7U14KGlzcFWVWwRrQCft9-EdOvgrM3SU1Zv3nu4vgApugBxsiRY-2m8aFJqukSNm-AdRN0UgCzvK96Jo_L5Zmhwwqj-VYKo6zBFIdV4O1AIOIlnLnrzZNOG-1E4VIOfnP52TFw0up3dhRNQwwXkuY6uxBsKzgGv5-bImgIp20743r360VY5jcE44bv3NDSYEKgJ6GNUeIWqCmRCW74_J6yxyGQ8YgYKLMu1lVym4I4dC8u_AdUV9ebUFTf-9sZJg9IwHqdhN_3-',
        tags: ['Veg'],
        inStock: true,
        badges: []
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: mainId,
        name: 'Mutton Biryani',
        description: 'Aromatic basmati rice cooked with tender mutton pieces',
        price: 595,
        image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCcUmnAIUHMRHUjJhq_mnpmsgcFSdbgLzVlHSK1C2gtU1le-EpZtCQppSCJPArXbsWSrf9niFc5A_wEeAsEGdorNH6G3TJ-MM90akwNNOl4ttfXMSiR1H5r-YzJkzMBjx5K4E7G9uPgMCH0OmVHRA6H7_cupZMet_HXoXiTAz5EuJlgFpGOAvrsDz4dlzUTLRrX4_2fSi1CHVZs7iOvtqG-axdbJdk92hOoN3QNkkZ2MWFWAeJ_jxYWtol-CQYQSkoG2Eaa3RH2eW1d',
        tags: ['Non-Veg'],
        inStock: true,
        badges: ['New']
      },
      {
        restaurantId: spiceGarden._id,
        categoryId: dessertId,
        name: 'Gulab Jamun',
        description: 'Warm milk dumplings in sweet saffron syrup',
        price: 125,
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
    const clientHost = 'http://localhost:5173';
    
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
