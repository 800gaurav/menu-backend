const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SuperAdmin = require('./models/SuperAdmin');
const Plan = require('./models/Plan');

const mongoURI = process.env.MONGODB_URI;
const username = process.env.SUPERADMIN_USERNAME || 'superadmin';
const email = process.env.SUPERADMIN_EMAIL || 'superadmin@platform.com';
const password = process.env.SUPERADMIN_PASSWORD || 'admin123';

async function initSuperAdmin() {
  try {
    if (!mongoURI) {
      console.error('❌ Error: MONGODB_URI is not set in backend/.env');
      process.exit(1);
    }

    console.log(`\nConnecting to database: ${mongoURI}...`);
    await mongoose.connect(mongoURI);
    console.log(' Connected to MongoDB.');

    // 1. Check or Create SuperAdmin
    const existingAdmin = await SuperAdmin.findOne({
      $or: [{ username }, { email }]
    });

    const hashedPassword = await bcrypt.hash(password, 10);

    if (existingAdmin) {
      existingAdmin.password = hashedPassword;
      existingAdmin.username = username;
      existingAdmin.email = email;
      await existingAdmin.save();
      console.log('✅ SuperAdmin account updated successfully with credentials from .env');
    } else {
      const newAdmin = new SuperAdmin({
        username,
        email,
        password: hashedPassword
      });
      await newAdmin.save();
      console.log('✅ SuperAdmin created successfully!');
    }

    // 2. Check and Seed Default Plans if empty
    const planCount = await Plan.countDocuments();
    if (planCount === 0) {
      console.log('Seeding initial subscription plans...');
      const defaultPlans = [
        {
          name: 'Free Trial',
          price: 0,
          billingCycle: 'trial',
          trialDays: 7,
          description: '7-day full access trial for new restaurants',
          features: {
            tableOrdering: true,
            roomOrdering: true,
            selfCheckout: true,
            kitchenPanel: true,
            counterPanel: true,
            waiterPanel: true,
            customerLogin: false,
            qrGenerator: true,
            analytics: true,
            maxTables: 15,
            maxMenuItems: 50,
            maxCategories: 10
          }
        },
        {
          name: 'Starter',
          price: 999,
          billingCycle: 'monthly',
          description: 'Essential POS and QR menu for small restaurants',
          features: {
            tableOrdering: true,
            roomOrdering: false,
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
          billingCycle: 'monthly',
          description: 'Full multi-panel system with waiter and kitchen KDS',
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
            maxCategories: 25
          }
        },
        {
          name: 'Enterprise',
          price: 4999,
          billingCycle: 'yearly',
          description: 'High-volume dining for large banquet & multi-room venues',
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

      for (const p of defaultPlans) {
        await new Plan(p).save();
      }
      console.log('✅ Default Subscription Plans created (Free Trial, Starter, Pro, Enterprise).');
    }

    console.log('\n==========================================');
    console.log('🎉 SuperAdmin Credentials:');
    console.log(`   Username: ${username}`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Login URL: http://localhost:5176/superadmin/login`);
    console.log('==========================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during SuperAdmin setup:', err.message);
    process.exit(1);
  }
}

initSuperAdmin();
