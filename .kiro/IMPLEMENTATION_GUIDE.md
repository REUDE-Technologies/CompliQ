# CompliQ Platform - Real Data Implementation Guide

## Current Status & What Needs to Change

### 1. **Real-Time Data Tracking** ❌ → ✅
**Current Issue**: Admin panels show simulated/fake data
**Solution**: Track actual data uploads through localStorage

```javascript
// Real data structure for uploads
const UPLOADS_KEY = 'compliq_uploads';  // Array of actual uploads
const SESSIONS_KEY = 'compliq_sessions'; // Track active sessions

// When user uploads file in dashboard:
// 1. Store file metadata with uploader info, timestamp, sector
// 2. Display in admin panel with real details
// 3. Show which user uploaded, when, file type, records count
```

### 2. **Admin Approval Workflow** ❌ → ✅
**Current Issue**: Users don't need approval, "pending" status not enforced
**Solution**: Implement proper workflow

```
Registration → Pending Status → Admin Reviews → Approve/Reject → Active/Inactive
```

**Current Code**: `auth.html` already blocks pending users ✓
**What's Missing**:
- Show pending users in admin panel
- Admin can approve/reject from pending approvals tab
- Approved users can then login
- Real-time status updates

### 3. **Two-Factor Authentication (2FA)** ❌ → ✅
**What is 2FA?**
- Step 1: User enters email + password
- Step 2: System sends 6-digit code to email/SMS
- Step 3: User enters code to verify identity
- Prevents unauthorized access even if password is stolen

**Implementation**:
```javascript
// After password verified:
// 1. Generate 6-digit OTP (One-Time Password)
// 2. Store with expiry (5 mins)
// 3. Show 2FA verification screen
// 4. User enters code
// 5. If correct, create session
// 6. If wrong, block for security
```

### 4. **Forgot Password** ✅ (Added)
**Current**: Modal added in auth.html
**How it works**:
- User clicks "Forgot password?"
- Enters email
- System generates reset token
- User gets reset link (demo shows token in localStorage)
- User sets new password
- Password updated in users list

### 5. **Preferences System** ❌ → ✅
**Current Issue**: Preferences UI exists but doesn't save/apply
**What needs to work**:
- Default Dashboard (Wind vs Solar)
- Theme (Light/Dark) - save to localStorage
- Date Format (DD/MM/YYYY)
- Timezone (Asia/Kolkata)
- Language (English)
- Save button actually updates profile

### 6. **Solar Ingest Data** ❌ → ✅
**Current Issue**: Solar dashboard has no real upload functionality
**Solution**: Copy wind dashboard upload logic but:
- Save to solar-specific storage key
- Show solar panel asset info (not turbine)
- Filter by solar sector in admin

### 7. **Active Users Display** ❌ → ✅
**Current Issue**: "Active" shown as fake numbers
**Solution**: Track actual logged-in sessions

```javascript
// When user logs in:
const session = {
  email: 'user@email.com',
  loginTime: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  sector: 'wind'
};

// Track in real-time
// Admin can see:
// - Who's logged in right now
// - Last activity time
// - Sector they're using
// - Device info (if desired)
```

---

## Implementation Priority

### Phase 1 (Critical)
1. ✅ Forgot Password (DONE)
2. Real upload tracking (wind + solar)
3. Admin approval workflow enforcement
4. Active users display

### Phase 2 (Important)
5. Two-Factor Authentication
6. Preferences that actually save
7. Real data in admin panels

### Phase 3 (Enhancement)
8. Device/Session management
9. Password reset email integration
10. Audit logs for security

---

## Storage Structure

```javascript
// Users Database
localStorage.compliq_users = [
  {
    email, firstName, lastName, org, role, sector, password,
    status: 'pending'|'active'|'rejected',
    createdAt, lastLogin, preferences: {}
  }
]

// Real Uploads
localStorage.compliq_uploads = [
  {
    id, uploadedBy, fileName, fileType, records, timestamp,
    sector, assetId, fileData, status: 'processing'|'completed'
  }
]

// Active Sessions
localStorage.compliq_sessions = [
  {
    email, loginTime, lastActivity, sector, device, ip
  }
]

// User Preferences
localStorage.compliq_user_prefs = {
  'user@email.com': {
    defaultDashboard: 'wind'|'solar',
    theme: 'light'|'dark',
    dateFormat, timezone, language
  }
}

// Password Resets
localStorage.compliq_resets = {
  'user@email.com': {
    token, expires, used: false
  }
}

// 2FA Settings
localStorage.compliq_2fa = {
  'user@email.com': {
    enabled: true|false,
    method: 'email'|'sms',
    verified: true|false
  }
}
```

---

## What Users Will See

### On Login
```
1. Enter email + password
2. ✅ (NEW) 2FA verification - "Enter 6-digit code sent to your email"
3. ✅ Dashboard loads with REAL data
4. ✅ "Active" count shows actual logged-in users
```

### In Admin Panel
```
✅ Overview shows REAL metrics:
  - Total users (from users list)
  - Files uploaded (from actual uploads)
  - Reports generated (from actual reports)
  - Active users (from live sessions)

✅ Pending Approvals tab shows:
  - Actual users waiting approval
  - Their info
  - Admin can approve/reject with one click

✅ Analytics shows:
  - REAL per-user activity (logins, uploads)
  - REAL organizations
  - REAL reports generated

✅ Upload Audit shows:
  - ACTUAL files uploaded by users
  - Who uploaded, when, what sector
  - Not fake data
```

### In Dashboard
```
✅ Ingest Data shows:
  - Files uploaded by logged-in user
  - In real-time
  - Asset info saved correctly
  - Visible to all users in same sector

✅ Preferences actually work:
  - Save default dashboard preference
  - Apply theme on next login
  - Remember user settings
```

---

## Files to Update

1. `auth.html` - Add 2FA, improve forgot password ✅ (Started)
2. `dashboard.html` - Track real uploads, track sessions
3. `solar-dashboard.html` - Solar-specific uploads + ingest
4. `admin.html` - Show real data from localStorage
5. `admin-solar.html` - Show real solar data
6. `account.html` - Preferences that actually save
7. `dashboard.js` - Real data tracking functions
8. Add new `preferences.js` - Preferences handling

---

## Quick Reference: What's Real vs Fake

| Feature | Status | Notes |
|---------|--------|-------|
| Login/Registration | ✅ Real | Users stored in localStorage |
| Pending Approval | ✅ Real | Blocks pending users |
| Admin Block Pending | ❌ Fake | Still showing all in lists |
| File Uploads | ❌ Fake | Wind has dummy, Solar has none |
| Active Users | ❌ Fake | Random numbers |
| Reports Generated | ❌ Fake | Simulated data |
| Preferences | ❌ Fake | Don't persist |
| Forgot Password | ✅ Real | Just added |
| 2FA | ❌ Not implemented | Need to add |
| Admin Data | ❌ Fake | All simulated |

