const mongoose = require('mongoose');

const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  logo: { type: String }, // URL or local path
  brandColor: { type: String, default: '#003b1b' },
  googleMapsLink: { type: String },
  reviewLink: { type: String },
  package: { type: String, default: 'Starter' },
  isActive: { type: Boolean, default: true },
  
  // Plan & Subscription
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  plan: {
    name: { type: String, default: 'Starter' },
    maxTables: { type: Number, default: 10 },
    maxMenuItems: { type: Number, default: 50 },
    price: { type: Number, default: 0 },
    billingCycle: { type: String, default: 'monthly', enum: ['monthly', 'yearly'] },
    startDate: { type: Date },
    endDate: { type: Date }
  },
  
  featureOverrides: {
    tableOrdering: { type: Boolean },
    roomOrdering: { type: Boolean },
    selfCheckout: { type: Boolean },
    kitchenPanel: { type: Boolean },
    counterPanel: { type: Boolean },
    waiterPanel: { type: Boolean },
    customerLogin: { type: Boolean },
    qrGenerator: { type: Boolean },
    analytics: { type: Boolean }
  },

  orderFlowMode: { type: String, enum: ['menuOnly', 'checkoutView', 'fullDigital'], default: 'fullDigital' },
  
  pins: {
    kitchen: { type: String, default: '1111' },
    counter: { type: String, default: '2222' },
    waiter: { type: String, default: '3333' }
  },

  // Feature Toggles (Super Admin controls)
  features: {
    tableOrdering: { type: Boolean, default: true },
    roomOrdering: { type: Boolean, default: true },
    selfCheckout: { type: Boolean, default: true },
    kitchenPanel: { type: Boolean, default: true },
    counterPanel: { type: Boolean, default: true },
    waiterPanel: { type: Boolean, default: true },
    customerLogin: { type: Boolean, default: false },
    qrGenerator: { type: Boolean, default: true },
    customerDataCollection: { type: Boolean, default: false },
    crm: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    subscriptions: { type: Boolean, default: true }
  },

  customerDataSettings: {
    enabled: { type: Boolean, default: false },
    fields: {
      name: { enabled: { type: Boolean, default: true }, required: { type: Boolean, default: true } },
      mobile: { enabled: { type: Boolean, default: true }, required: { type: Boolean, default: false } },
      email: { enabled: { type: Boolean, default: false }, required: { type: Boolean, default: false } },
      dateOfBirth: { enabled: { type: Boolean, default: false }, required: { type: Boolean, default: false } },
      anniversaryDate: { enabled: { type: Boolean, default: false }, required: { type: Boolean, default: false } }
    }
  },

  // Branding & Display Settings (Restaurant Admin controls)
  brandingSettings: {
    tagline: { type: String },
    pwaName: { type: String },
    pageTitle: { type: String },
    footerText: { type: String },
    
    // Visibility flags for social & reviews
    showGoogleReview: { type: Boolean, default: true },
    showInstagram: { type: Boolean, default: true },
    showFacebook: { type: Boolean, default: true },
    showWhatsapp: { type: Boolean, default: true }
  },

  // Social Links
  socialLinks: {
    instagram: { type: String },
    facebook: { type: String },
    whatsapp: { type: String },
    website: { type: String },
    phone: { type: String }
  },

  actionButtons: [{
    type: {
      type: String,
      enum: ['googleReview', 'instagram', 'facebook', 'whatsapp', 'call', 'website', 'shareMenu', 'addToHomeScreen', 'feedback', 'loyalty']
    },
    label: { type: String },
    icon: { type: String },
    url: { type: String },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Restaurant', RestaurantSchema);
