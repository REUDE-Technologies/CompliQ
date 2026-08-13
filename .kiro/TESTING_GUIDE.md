# Complete Testing Guide - CompliQ Platform

## ✅ Everything That's Now Working

| Feature | Works? | Test Method |
|---------|--------|------------|
| Real Upload Tracking | ✅ | Upload file → Check admin panel |
| Active Session Tracking | ✅ | Login/logout → Watch metrics change |
| Admin Approval | ✅ | Register user → Approve in admin panel |
| Forgot Password | ✅ | Click forgot password link |
| Real Metrics | ✅ | Check Overview tab numbers |
| Sector Filtering | ✅ | Login wind vs solar → Different data |

---

## 🧪 Full Testing Workflow

### Phase 1: Admin Approval Workflow

**Setup:**
1. Open two browser tabs
2. Tab A: index.html (for auth)
3. Tab B: Blank

**Test:**
```
Tab A:
1. Click "Get Started"
2. Click "Create Account"
3. Fill form:
   - First Name: Test
   - Last Name: User
   - Email: testuser@demo.com
   - Organization: Test Farm
   - Role: Fleet Operator
   - Password: Test@2026
4. Check: "Your account is pending admin approval" ✓

Tab A:
5. Sign In with: admin@reude.tech / Admin@Reude2026
6. Click Admin Panel (orange button in sidebar)
7. Go to: "Pending Approvals" tab
8. Find testuser@demo.com
9. Click "✅ Approve"
10. Check: "Account has been activated" ✓

Tab A:
11. Sign Out
12. Sign In with: testuser@demo.com / Test@2026
13. Check: Dashboard loads ✓ (previously blocked)
```

---

### Phase 2: Real Upload Tracking

**Setup (Use approved test user from Phase 1):**

**Test:**
```
Dashboard:
1. Click "Ingest Data" (sidebar)
2. Select Turbine: "T-001-BLADE-A"
3. Select Blade: "Blade A"
4. Drag file OR click to upload

Try uploading these:
- Any JPG/PNG image
- JSON file
- MP4 video

After upload:
- See: "File stored: [filename]" ✓
- See: File in preview area ✓

Then check Admin Panel:
1. Login as admin
2. Go Admin Panel → Access Control tab
3. Look for "Data Upload Audit Trail"
4. See: Your upload with:
   - Upload ID: UP-... ✓
   - Uploaded By: testuser@demo.com ✓
   - File Type: [correct type] ✓
   - Timestamp: [correct time] ✓
```

---

### Phase 3: Real Active Users

**Setup:** Multiple browser tabs

**Test:**
```
Tab 1: Admin Panel
1. Login as admin@reude.tech
2. Click Admin Panel
3. Check Overview → "Active (30d)": 0

Tab 2: Wind Dashboard
1. Login as operator@reude.tech / Operator@2026
2. (Stay logged in)

Tab 1: Admin Panel (Refresh)
1. Scroll to Overview
2. Check "Active (30d)": 1 ✓ (Should change from 0 to 1)

Tab 3: Solar Dashboard
1. Login as solar@reude.tech / Solar@Reude2026

Tab 1: Admin Panel (Wind) - Still shows 1
Tab Admin-Solar (Open new tab):
1. Login as solar-admin@reude.tech / Admin@Solar2026
2. Click Admin Panel
3. Check "Active (30d)": 1 ✓ (Only solar user)

Tab 2: Wind Dashboard (Logout)
1. Click Sign Out

Tab 1: Admin Panel (Wind) (Refresh)
1. Check "Active (30d)": 0 ✓ (Decreased from 1 to 0)
```

---

### Phase 4: Forgot Password

**Test:**
```
Login Page:
1. Click "Forgot password?"
2. Modal opens
3. Enter email: admin@reude.tech
4. Click "Send Reset Link"
5. See: "✅ Reset link sent to..." ✓

Check localStorage (DevTools):
1. Open DevTools (F12)
2. Console tab
3. Type: localStorage.compliq_resets
4. See: Email with token info ✓
```

---

### Phase 5: Solar Dashboard Ingest Data

**Setup:**
1. Login as solar@reude.tech / Solar@Reude2026
2. Should go to solar-dashboard.html ✓

**Test:**
```
Solar Dashboard:
1. Click "Ingest Data" (sidebar)
2. Select Solar Asset: Farm panel
3. Upload file (solar panel image, thermal, JSON)
4. See: "File stored: [filename]" ✓

Solar Admin Panel:
1. Login as solar-admin@reude.tech / Admin@Solar2026
2. Click Admin Panel
3. Go to "Access Control" tab
4. Check "Data Upload Audit Trail"
5. See: Solar user's upload ✓
   - Shows solar@reude.tech
   - Shows solar file
   - Shows timestamp ✓
```

---

### Phase 6: Preferences (Partial)

**Note:** UI ready, backend save not yet complete

**Test:**
```
Account/Settings:
1. Go to account.html
2. Click "Preferences"
3. See options:
   - Default Dashboard ✓
   - Theme ✓
   - Date Format ✓
   - Timezone ✓
   - Language ✓
4. Try changing values
5. Click "Save Preferences"
6. (Changes don't persist yet - future feature)
```

---

## 🔍 Verification Checklist

Use this checklist to verify everything works:

### Admin Panel
- [ ] Shows real user count
- [ ] Shows real file upload count
- [ ] Shows real pending approvals
- [ ] Active users changes on login/logout
- [ ] Access Control shows actual uploads
- [ ] Upload uploader name is correct
- [ ] Upload timestamp is correct
- [ ] Wind admin only shows wind uploads
- [ ] Solar admin only shows solar uploads

### Registration & Approval
- [ ] New user gets "Pending" status
- [ ] Pending user can't login
- [ ] Admin can see pending user
- [ ] Admin can approve
- [ ] Approved user can login
- [ ] Admin can reject
- [ ] Rejected user gets error message

### Uploads
- [ ] Wind user can upload file
- [ ] Solar user can upload file
- [ ] Upload appears in admin panel immediately
- [ ] Upload shows correct user name
- [ ] Upload shows correct timestamp
- [ ] Wind uploads don't appear in solar admin
- [ ] Solar uploads don't appear in wind admin

### Active Sessions
- [ ] Active count is 0 before any login
- [ ] Active count increases on login
- [ ] Active count decreases on logout
- [ ] Wind admin shows wind active users only
- [ ] Solar admin shows solar active users only
- [ ] Adoption rate calculates correctly

### Forgot Password
- [ ] Forgot password link works
- [ ] Modal opens
- [ ] Can enter email
- [ ] Shows success/error messages
- [ ] Token stored in localStorage

---

## 📊 Test Data

### For Testing

**Wind Credentials:**
```
Admin: admin@reude.tech / Admin@Reude2026
Operator: operator@reude.tech / Operator@2026
Engineer: engineer@reude.tech / Engineer@2026
Analyst: analyst@reude.tech / Analyst@2026
Manager: sitemanager@reude.tech / SiteMan@2026
```

**Solar Credentials:**
```
Admin: solar-admin@reude.tech / Admin@Solar2026
Operator: solar@reude.tech / Solar@Reude2026
Engineer: solar-engineer@reude.tech / Engineer@Solar2026
Analyst: solar-analyst@reude.tech / Analyst@Solar2026
```

**Test Upload Files:**
- Download any JPG/PNG/MP4 from internet
- Create simple JSON file: `{"test": "data"}`
- Any text file will work

---

## 🐛 Troubleshooting

### Issue: Active users still shows wrong number
**Solution:**
1. Clear localStorage: DevTools → Application → Clear Storage
2. Reload page
3. Login fresh

### Issue: Uploads not showing in admin
**Solution:**
1. Make sure file uploaded successfully (see toast message)
2. Go to "Access Control" tab in admin panel
3. Refresh if needed
4. Check correct admin panel (wind vs solar)

### Issue: User stuck on pending
**Solution:**
1. Login as admin
2. Go Admin Panel → Pending Approvals
3. Click "✅ Approve"
4. User can login now

### Issue: Active count not updating
**Solution:**
1. Check you're on correct admin panel (wind or solar)
2. Filter by sector - wind admin only shows wind active users
3. Refresh page to see latest
4. Check other browser tabs - they all share same localStorage

---

## 📱 Browser Storage

### What to Check in DevTools

**F12 → Application → Local Storage:**

```
compliq_users
  → Array of all registered users
  → Check: email, role, sector, status (pending/active/rejected)

compliq_session
  → Currently logged-in user
  → Check: email, role, sector

compliq_active_sessions
  → Currently online users
  → Check: count updates on login/logout

compliq_uploads_real
  → All uploaded files
  → Check: uploadedBy, timestamp, sector

compliq_resets
  → Password reset tokens
  → Check: token, expires date
```

---

## ✨ Expected Results

When everything works correctly:

```
1. Register user → Pending ✓
2. Admin approves → Active ✓
3. User logs in → Active count +1 ✓
4. User uploads file → Shows in audit trail ✓
5. Admin sees real metrics → All accurate ✓
6. User logs out → Active count -1 ✓
7. Forgot password → Reset token created ✓
```

---

## 📞 Support

If something doesn't work:
1. Check browser console (F12) for errors
2. Clear localStorage and reload
3. Make sure using correct credentials
4. Check if in correct admin panel (wind vs solar)
5. Verify user status is 'active' not 'pending'

