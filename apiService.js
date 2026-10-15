/**
 * SmartStay Backend API & Database Service Layer
 * Central source of truth for Properties, Verification Workflow, and Role-Based Access Control.
 */

import { MOCK_PROPERTIES } from './mockData.js';

const STORAGE_KEY = 'smartstay_master_properties';
const AUDIT_STORAGE_KEY = 'smartstay_audit_logs';

/**
 * Initialize Master Properties Database safely without dropping existing data
 */
function initDatabase() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Error parsing master properties, reinitializing safely:', e);
    }
  }

  // Check if there are legacy owner properties from previous session
  let legacyOwnerProps = [];
  try {
    const legacy = localStorage.getItem('smartstay_properties');
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (Array.isArray(parsedLegacy)) {
        legacyOwnerProps = parsedLegacy.map((p, idx) => ({
          id: `owner-legacy-${idx + 1}`,
          name: p.name,
          propertyType: p.icon === '🏢' ? 'PG' : (p.icon === '🏠' ? 'Apartment' : 'Room'),
          rent: Number(p.rent) || 10000,
          city: p.city || 'Noida',
          locality: p.locality || 'Sector 62',
          address: p.address || 'Sector 62, Noida, UP',
          latitude: Number(p.latitude) || 28.6139,
          longitude: Number(p.longitude) || 77.3910,
          distance: 1.0,
          rating: 4.5,
          available: true,
          sharing: 'Double',
          gender: 'Any',
          amenities: ['Wi-Fi', 'Food', 'Power Backup'],
          image: p.image || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop',
          ownerName: 'Rahul Sharma',
          ownerPhone: '+91 98765 11111',
          ownerId: 'owner-201',
          verification_status: 'PENDING',
          verified_at: null,
          verified_by: null,
          rejection_reason: null,
          submitted_date: new Date().toISOString().split('T')[0]
        }));
      }
    }
  } catch (e) {
    console.warn('No legacy owner properties to migrate');
  }

  // Seed with standard mock properties with verification_status
  const seeded = [
    ...MOCK_PROPERTIES.map(p => ({
      ...p,
      ownerName: p.id % 3 === 0 ? 'Amit Kumar' : (p.id % 2 === 0 ? 'Rahul Sharma' : 'Vikram Malhotra'),
      ownerPhone: '+91 98765 ' + (10000 + p.id * 111),
      ownerId: p.id % 3 === 0 ? 'owner-202' : (p.id % 2 === 0 ? 'owner-201' : 'owner-203'),
      verification_status: p.verified ? 'VERIFIED' : 'PENDING',
      verified_at: p.verified ? '2026-09-20T10:00:00.000Z' : null,
      verified_by: p.verified ? 'admin-001' : null,
      rejection_reason: null,
      submitted_date: '2026-09-20'
    })),
    // Explicit sample Pending and Rejected properties for verification review
    {
      id: 10,
      name: "Royal Residency PG",
      propertyType: "PG",
      rent: 9000,
      city: "Ghaziabad",
      locality: "Crossing Republik",
      address: "Tower 4, Crossing Republik, Ghaziabad",
      latitude: 28.63,
      longitude: 77.43,
      distance: 2.1,
      rating: 4.0,
      available: true,
      sharing: "Double",
      gender: "Boys",
      amenities: ["Wi-Fi", "Food", "Power Backup"],
      image: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?q=80&w=800&auto=format&fit=crop",
      ownerName: "Arjun Verma",
      ownerPhone: "+91 98111 22334",
      ownerId: "owner-204",
      verification_status: "PENDING",
      verified_at: null,
      verified_by: null,
      rejection_reason: null,
      submitted_date: "2026-09-24"
    },
    {
      id: 11,
      name: "Green Valley Boys Hostel",
      propertyType: "Hostel",
      rent: 7500,
      city: "Noida",
      locality: "Knowledge Park 2",
      address: "Plot 12, Knowledge Park 2, Greater Noida",
      latitude: 28.47,
      longitude: 77.49,
      distance: 3.5,
      rating: 3.9,
      available: true,
      sharing: "Triple",
      gender: "Boys",
      amenities: ["Wi-Fi", "Food"],
      image: "https://images.unsplash.com/photo-1595526114035-0d455f697873?q=80&w=800&auto=format&fit=crop",
      ownerName: "Sunil Rajput",
      ownerPhone: "+91 99222 33445",
      ownerId: "owner-205",
      verification_status: "REJECTED",
      verified_at: "2026-09-23T14:30:00.000Z",
      verified_by: "admin-001",
      rejection_reason: "Property photos do not match physical room; incomplete electricity bill.",
      submitted_date: "2026-09-22"
    },
    ...legacyOwnerProps
  ];

  saveMasterProperties(seeded);
  return seeded;
}

function getMasterProperties() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading master properties:', e);
  }
  return initDatabase();
}

function saveMasterProperties(props) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(props));
  // Dispatch custom storage event for live multi-tab & cross-component sync
  window.dispatchEvent(new Event('smartstay_properties_updated'));
}

/**
 * Auth & Role Helper
 */
export function getCurrentAuth() {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return {
      id: user.id || 'usr-101',
      name: user.name || 'User',
      role: user.role || 'tenant' // 'admin', 'owner', 'tenant'
    };
  } catch (e) {
    return { id: 'usr-guest', name: 'Guest', role: 'tenant' };
  }
}

export function setMockAuthRole(role, name = 'Admin User', id = 'admin-001') {
  localStorage.setItem('currentUser', JSON.stringify({ role, name, id }));
}

/**
 * Backend API Client & Controller
 */
export const SmartStayAPI = {
  /**
   * GET /api/properties
   * Public / Tenant Endpoint:
   * Returns properties filtered by verification status and search criteria.
   * Public listings ONLY include VERIFIED properties unless explicit admin filter is permitted.
   */
  async getProperties(query = {}) {
    await delay(120); // Network simulation
    const all = getMasterProperties();
    
    // By default, public tenant listings only see VERIFIED properties
    let results = all.filter(p => p.verification_status === 'VERIFIED');

    // If explicit verificationStatus filter is supplied (e.g. from backend query)
    if (query.verificationStatus) {
      results = all.filter(p => p.verification_status === query.verificationStatus);
    }

    // Text search filter
    if (query.searchText) {
      const q = query.searchText.toLowerCase().trim();
      results = results.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.locality.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.propertyType.toLowerCase().includes(q)
      );
    }

    // City filter
    if (query.city && query.city !== 'All' && query.city !== 'all') {
      results = results.filter(p => p.city.toLowerCase() === query.city.toLowerCase());
    }

    // Property Type filter
    if (query.propertyType && query.propertyType !== 'All') {
      results = results.filter(p => p.propertyType === query.propertyType);
    }

    // Budget filters
    if (query.minRent) {
      results = results.filter(p => p.rent >= query.minRent);
    }
    if (query.maxRent) {
      results = results.filter(p => p.rent <= query.maxRent);
    }

    // Distance filter
    if (query.maxDistance && query.maxDistance !== 'Any') {
      const dist = parseFloat(query.maxDistance);
      results = results.filter(p => (p.distance || 0) <= dist);
    }

    // Gender filter
    if (query.gender && query.gender !== 'Any') {
      results = results.filter(p => p.gender === query.gender || p.gender === 'Any');
    }

    // Sharing filter
    if (query.sharing && query.sharing !== 'Any') {
      results = results.filter(p => p.sharing === query.sharing);
    }

    // Amenities filter
    if (query.amenities && Array.isArray(query.amenities) && query.amenities.length > 0) {
      results = results.filter(p =>
        query.amenities.every(amenity => (p.amenities || []).includes(amenity))
      );
    }

    // Available now filter
    if (query.availableNow) {
      results = results.filter(p => p.available);
    }

    // Sort
    if (query.sortBy) {
      results.sort((a, b) => {
        switch (query.sortBy) {
          case 'Rent: Low to High': return a.rent - b.rent;
          case 'Rent: High to Low': return b.rent - a.rent;
          case 'Distance': return (a.distance || 0) - (b.distance || 0);
          case 'Rating': return (b.rating || 0) - (a.rating || 0);
          default: return 0;
        }
      });
    }

    return {
      success: true,
      count: results.length,
      data: results
    };
  },

  /**
   * GET /api/properties/:id
   * Single Property Details:
   * Protects unverified properties from unauthorized public access.
   */
  async getPropertyById(id, auth = getCurrentAuth()) {
    await delay(100);
    const all = getMasterProperties();
    const prop = all.find(p => String(p.id) === String(id));
    if (!prop) {
      const err = new Error('Property not found.');
      err.status = 404;
      throw err;
    }

    // Public / tenant security check:
    if (prop.verification_status !== 'VERIFIED' && auth.role !== 'admin' && auth.id !== prop.ownerId) {
      const err = new Error('Property is awaiting admin verification or has been restricted.');
      err.status = 403;
      throw err;
    }

    return { success: true, data: prop };
  },

  /**
   * GET /api/owner/properties
   * Owner Endpoint:
   * Returns listings owned by current owner with true backend verification_status.
   */
  async getOwnerProperties(ownerName = 'Rahul Sharma') {
    await delay(100);
    const all = getMasterProperties();
    const ownerProps = all.filter(p => p.ownerName.toLowerCase() === ownerName.toLowerCase());
    return {
      success: true,
      count: ownerProps.length,
      data: ownerProps
    };
  },

  /**
   * POST /api/properties
   * Owner Submits a New Property:
   * Backend strictly enforces `verification_status = 'PENDING'`.
   * Owner cannot set VERIFIED status, verified_at, or verified_by.
   */
  async createProperty(propertyData, auth = getCurrentAuth()) {
    await delay(250);

    if (!propertyData.name || !propertyData.rent || Number(propertyData.rent) <= 0) {
      const err = new Error('Invalid property data. Name and rent are required.');
      err.status = 400;
      throw err;
    }

    const all = getMasterProperties();
    const newId = Date.now();

    // Security: Backend strictly assigns PENDING status
    const newProperty = {
      id: newId,
      name: propertyData.name.trim(),
      propertyType: propertyData.propertyType || 'PG',
      rent: Number(propertyData.rent),
      city: propertyData.city || 'Ghaziabad',
      locality: propertyData.locality || 'Near ABES Engineering College',
      address: propertyData.address || `${propertyData.locality || 'Crossing Republik'}, ${propertyData.city || 'Ghaziabad'}`,
      latitude: Number(propertyData.latitude) || 28.6480,
      longitude: Number(propertyData.longitude) || 77.4420,
      distance: 0.8,
      rating: 4.5,
      available: true,
      sharing: propertyData.sharing || 'Double',
      gender: propertyData.gender || 'Boys',
      amenities: Array.isArray(propertyData.amenities) ? propertyData.amenities : ['Wi-Fi', 'Food', 'Power Backup'],
      image: propertyData.image || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop',
      ownerName: auth.name || propertyData.ownerName || 'Rahul Sharma',
      ownerPhone: propertyData.ownerPhone || '+91 98765 11111',
      ownerId: auth.id || 'owner-201',
      
      // Verification State controlled by backend only:
      verification_status: 'PENDING',
      verified_at: null,
      verified_by: null,
      rejection_reason: null,
      submitted_date: new Date().toISOString().split('T')[0]
    };

    all.unshift(newProperty);
    saveMasterProperties(all);

    // Record audit log
    recordAuditLog({
      action: 'Submit',
      title: `Owner submitted '${newProperty.name}'`,
      desc: `Property submitted for admin verification. Initial status: PENDING.`,
      type: 'resolve'
    });

    return {
      success: true,
      message: 'Property submitted successfully and is awaiting verification.',
      data: newProperty
    };
  },

  /**
   * GET /api/admin/properties
   * Admin Endpoint:
   * Returns all properties with full verification telemetry.
   * Authorization: Admin only.
   */
  async getAdminProperties(query = {}, auth = getCurrentAuth()) {
    await delay(120);

    // Role check: Tenant -> 403, Owner -> 403, Admin -> Allowed
    if (auth.role !== 'admin') {
      const err = new Error('You are not authorized to perform this action.');
      err.status = 403;
      throw err;
    }

    const all = getMasterProperties();
    let results = [...all];

    if (query.status && query.status !== 'all') {
      results = results.filter(p => p.verification_status.toLowerCase() === query.status.toLowerCase());
    }

    if (query.search) {
      const s = query.search.toLowerCase().trim();
      results = results.filter(p =>
        p.name.toLowerCase().includes(s) ||
        p.ownerName.toLowerCase().includes(s) ||
        p.city.toLowerCase().includes(s) ||
        p.locality.toLowerCase().includes(s)
      );
    }

    return {
      success: true,
      total: all.length,
      pendingCount: all.filter(p => p.verification_status === 'PENDING').length,
      verifiedCount: all.filter(p => p.verification_status === 'VERIFIED').length,
      rejectedCount: all.filter(p => p.verification_status === 'REJECTED').length,
      data: results
    };
  },

  /**
   * PATCH /api/admin/properties/:id/verification
   * Admin Verification Endpoint:
   * Approves or Rejects a property.
   * Authorization: Admin only.
   */
  async updateVerificationStatus(propertyId, payload, auth = getCurrentAuth()) {
    await delay(200);

    // 1. Role verification:
    if (auth.role !== 'admin') {
      const err = new Error('You are not authorized to perform this action.');
      err.status = 403;
      throw err;
    }

    const all = getMasterProperties();
    const index = all.findIndex(p => String(p.id) === String(propertyId));
    if (index === -1) {
      const err = new Error('Property not found.');
      err.status = 404;
      throw err;
    }

    const status = payload.status; // 'VERIFIED' | 'REJECTED'
    if (status !== 'VERIFIED' && status !== 'REJECTED') {
      const err = new Error('Invalid verification status.');
      err.status = 400;
      throw err;
    }

    const prop = all[index];

    if (status === 'VERIFIED') {
      prop.verification_status = 'VERIFIED';
      prop.verified_at = new Date().toISOString();
      prop.verified_by = auth.id || 'admin-001';
      prop.rejection_reason = null;
      prop.verified = true; // backward compatibility

      recordAuditLog({
        action: 'Approve',
        title: `Admin approved '${prop.name}'`,
        desc: `Verified property listing #${prop.id}. Verification status set to VERIFIED.`,
        type: 'approve'
      });

      saveMasterProperties(all);

      return {
        success: true,
        message: 'Property verified successfully.',
        data: prop
      };
    } else {
      const reason = payload.reason?.trim() || 'Property information is incomplete or unverified.';
      prop.verification_status = 'REJECTED';
      prop.verified_at = new Date().toISOString();
      prop.verified_by = auth.id || 'admin-001';
      prop.rejection_reason = reason;
      prop.verified = false; // backward compatibility

      recordAuditLog({
        action: 'Reject',
        title: `Admin rejected '${prop.name}'`,
        desc: `Rejection reason: "${reason}". Status set to REJECTED.`,
        type: 'reject'
      });

      saveMasterProperties(all);

      return {
        success: true,
        message: 'Property rejected successfully.',
        data: prop
      };
    }
  },

  /**
   * Delete Property (Admin)
   */
  async deleteProperty(propertyId, auth = getCurrentAuth()) {
    await delay(150);
    if (auth.role !== 'admin') {
      const err = new Error('You are not authorized to perform this action.');
      err.status = 403;
      throw err;
    }

    let all = getMasterProperties();
    const prop = all.find(p => String(p.id) === String(propertyId));
    if (!prop) {
      const err = new Error('Property not found.');
      err.status = 404;
      throw err;
    }

    all = all.filter(p => String(p.id) !== String(propertyId));
    saveMasterProperties(all);

    recordAuditLog({
      action: 'Delete',
      title: `Admin deleted property #${propertyId}`,
      desc: `Purged '${prop.name}' from master database.`,
      type: 'reject'
    });

    return { success: true, message: 'Property deleted successfully.' };
  },

  /**
   * Activity & Audit Logs
   */
  getAuditLogs() {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [
      { id: 1, action: "Approve", title: "Admin verified 'Skyline Boys PG'", desc: "Verified electricity bill and owner Aadhaar card.", time: "Today, 18:30", type: "approve" },
      { id: 2, action: "Reject", title: "Admin rejected listing #11 ('Green Valley Boys Hostel')", desc: "Reason: Photos do not match physical room.", time: "Today, 14:15", type: "reject" },
      { id: 3, action: "Submit", title: "Owner submitted 'Royal Residency PG'", desc: "Submitted for admin verification.", time: "Yesterday, 17:40", type: "resolve" }
    ];
  }
};

function recordAuditLog(log) {
  try {
    const logs = SmartStayAPI.getAuditLogs();
    logs.unshift({
      id: Date.now(),
      action: log.action,
      title: log.title,
      desc: log.desc,
      time: 'Just now',
      type: log.type
    });
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs.slice(0, 50)));
  } catch (e) {}
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Automatically seed database on initial load if needed
initDatabase();
