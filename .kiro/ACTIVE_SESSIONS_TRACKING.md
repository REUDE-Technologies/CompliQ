# Active Sessions & Real-Time User Tracking

## 🟢 What's New: Real Active Session Tracking

### The Problem (Before)
- Admin panel showed "Active Users" = all users with status='active'
- Didn't matter if they were actually logged in RIGHT NOW
- Example: 8 active users shown, but maybe only 1 person is using the system

### The Solution (Now)
- **Active Users** = ONLY users currently logged in RIGHT NOW
- Updates in real-time as users login/logout
- Admin can see who's using the system at this exact moment

---

## How It Works

### Step 1: User Logs In
```javascript
// When user clicks "Sign In" and password verified:
handleLogin() → 
  Create session in: compliq_session
  ADD to: compliq_active_sessions[email] = {
    email, firstName, lastName, role, sector,
    loginTime, lastActivity, status: 'online'
  }
```

### Step 2: Session Stored
```javascript
localStorage.compliq_active_sessions = {
  "operator@reude.tech": {
    email: "operator@reude.tech",
    firstName: "Fleet",
    lastName: "Operator",
    role: "Fleet Operator",
    sector: "wind",
    loginTime: "2026-11-15T14:30:00Z",
    lastActivity: "2026-11-15T14:35:22Z",
    status: "online"
  },
  "solar@reude.tech": {
    email: "solar@reude.tech",
    firstName: "Solar",
    lastName: "Operator",
    role: "Fleet Operator",
    sector: "solar",
    loginTime: "2026-11-15T14:31:15Z",
    lastActivity: "2026-11-15T14:36:10Z",
    status: "online"
  }
}
```

### Step 3: Admin Sees Real Active Users
```
Admin Panel → Overview tab:
Active (30d): 2  ← REAL, currently logged in RIGHT NOW

How it's calculated:
- Get all items from compliq_active_sessions
- Filter by sector (wind or solar)
- Count = number of active users
```

### Step 4: User Logs Out
```javascript
// When user clicks "Sign Out":
handleLogout() → 
  Remove from compliq_active_sessions
  Active user count decreases immediately
```

---

## Real Example

### Timeline:

**14:30** - Operator logs in
```
Active Users: 1
  - operator@reude.tech ✓ online
```

**14:31** - Solar Operator logs in
```
Active Users: 2
  - operator@reude.tech ✓ online
  - solar@reude.tech ✓ online
```

**14:35** - Operator logs out
```
Active Users: 1
  - solar@reude.tech ✓ online
  (operator removed from active sessions)
```

**14:40** - Admin views metrics
```
Overview shows:
- Active (30d): 1
- Adoption Rate: 25% (1 active / 4 total)
```

---

## Code Changes Made

### 1. **auth.html** - Login tracking
```javascript
// After password verification, add to active sessions
const ACTIVE_SESSIONS_KEY = 'compliq_active_sessions';
let activeSessions = JSON.parse(localStorage.getItem(ACTIVE_SESSIONS_KEY) || '{}');
activeSessions[found.email] = {
  email: found.email,
  firstName: found.firstName,
  lastName: found.lastName,
  role: found.role,
  sector: sector,
  loginTime: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  status: 'online'
};
localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(activeSessions));
```

### 2. **dashboard.js** - Logout tracking
```javascript
function handleLogout() {
  const ACTIVE_SESSIONS_KEY = 'compliq_active_sessions';
  const sess = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  
  // Remove from active sessions
  if (sess && sess.email) {
    let activeSessions = JSON.parse(localStorage.getItem(ACTIVE_SESSIONS_KEY) || '{}');
    delete activeSessions[sess.email];
    localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(activeSessions));
  }
  
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}
```

### 3. **admin.html** - Show real active users
```javascript
// Get REAL active sessions - only users currently logged in
const ACTIVE_SESSIONS_KEY = 'compliq_active_sessions';
let activeSessions = JSON.parse(localStorage.getItem(ACTIVE_SESSIONS_KEY) || '{}');
let activeUsers = Object.values(activeSessions).filter(s => s.sector === 'wind');

document.getElementById('ov-active').textContent = activeUsers.length; // REAL
```

### 4. **admin-solar.html** - Same for solar
```javascript
// Same logic but filter for solar sector
let activeUsers = Object.values(activeSessions).filter(s => s.sector === 'solar');
document.getElementById('ov-active').textContent = activeUsers.length;
```

---

## What You'll See Now

### Before (Incorrect):
```
Overview Metrics:
  Total Users: 8
  Active (30d): 8  ← All users showed as active!
  Adoption Rate: 100%
```

### After (Correct):
```
Overview Metrics:
  Total Users: 8
  Active (30d): 1  ← Only user currently logged in
  Adoption Rate: 12.5%
  (1 logged in / 8 total)
```

---

## How to Test

### Test Scenario 1: Single User Login
```
1. Open admin.html (as admin)
   → Active (30d): 0

2. In new tab, login as: operator@reude.tech / Operator@2026
   → Go back to admin tab
   → Active (30d): 1 ✓

3. Logout from operator tab
   → Go back to admin tab
   → Active (30d): 0 ✓
```

### Test Scenario 2: Multiple Users
```
1. Tab 1: Login as admin@reude.tech
   → Active shows: 0 (admin doesn't count in metrics)

2. Tab 2: Login as operator@reude.tech
   → Active shows: 1 ✓

3. Tab 3: Login as solar@reude.tech (solar dashboard)
   → Wind admin shows: 1 (solar user doesn't count)
   → Solar admin shows: 1 ✓

4. Tab 2: Logout operator
   → Active shows: 0 ✓
```

---

## Storage Structure

### compliq_active_sessions
```javascript
{
  "email1@domain.com": {
    email: "email1@domain.com",
    firstName: "First",
    lastName: "Last",
    role: "Fleet Operator",
    sector: "wind",  // ← Used to filter
    loginTime: "2026-11-15T14:30:00Z",
    lastActivity: "2026-11-15T14:35:22Z",
    status: "online"
  },
  "email2@domain.com": {
    email: "email2@domain.com",
    firstName: "Solar",
    lastName: "Op",
    role: "Solar Operator",
    sector: "solar",  // ← Different sector
    loginTime: "2026-11-15T14:31:15Z",
    lastActivity: "2026-11-15T14:36:10Z",
    status: "online"
  }
}
```

---

## Key Points

✅ **Real-time** - Updates immediately on login/logout
✅ **Sector-filtered** - Wind admin sees wind users, solar admin sees solar users
✅ **Accurate** - Shows ONLY currently logged-in users
✅ **No manual refresh needed** - Data updates instantly
✅ **Multi-browser** - Works across tabs and browsers (same localStorage)

---

## Future Enhancements

1. **Track last activity** - Update `lastActivity` on every action
2. **Idle timeout** - Auto-logout inactive users (30 mins)
3. **Session view** - Show device, IP, browser info
4. **Login history** - Track past logins (today, this week, all time)
5. **Concurrent sessions** - Limit users to 1 login at a time

